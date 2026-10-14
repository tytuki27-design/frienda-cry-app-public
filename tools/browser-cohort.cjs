// Reproduce application predictions locally, with no recording upload to a remote service.
// Usage: node tools/browser-cohort.cjs manifest.json report.json [offline-report.json]
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');
(async()=>{
 const root=path.resolve(__dirname,'..'),manifestFile=path.resolve(process.argv[2]),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),mode=process.env.AUDIO_MODE||'segmented',contextRate=process.env.AUDIO_CONTEXT_RATE?Number(process.env.AUDIO_CONTEXT_RATE):null;
 if(!['legacy','segmented'].includes(mode)||contextRate!==null&&![44100,48000].includes(contextRate))throw Error('Unsupported mode or sample rate');
 const cases=manifest.recordings?.filter(r=>r.split==='test');if(!cases?.length)throw Error('No test recordings');
 const expected=process.argv[4]?JSON.parse(fs.readFileSync(process.argv[4],'utf8')):null;
 const server=http.createServer((q,r)=>{const files={'/':'index.html','/tools/mfcc-dtw.js':'tools/mfcc-dtw.js','/manifest.webmanifest':'manifest.webmanifest'};const file=files[new URL(q.url,'http://localhost').pathname];if(!file){r.writeHead(404);return r.end()}r.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');r.end(fs.readFileSync(path.join(root,file)))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage();
  if(contextRate)await page.addInitScript(rate=>{const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(options={}){super({...options,sampleRate:rate})}}},contextRate);
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>refs.size===13);await page.selectOption('#algorithm',mode);
  const labels=await page.evaluate(()=>names),rows=[];
  for(const recording of cases){
   if(!labels.includes(recording.name))throw Error('Unknown recording label');
   await page.locator('#file').setInputFiles(path.resolve(path.dirname(manifestFile),recording.file));
   await page.waitForFunction(()=>!$('file').disabled&&($('status').textContent.includes('完了')||$('status').textContent.includes('エラー')));
   const status=await page.locator('#status').innerText();if(status.includes('エラー'))throw Error('Recording failed: '+recording.id+' '+status);
   const prediction=await page.locator('.winner strong').innerText(),uncertain=(await page.locator('#results').innerText()).includes('判定不確か');
   if(expected){const offline=expected.rows.find(r=>r.id===recording.id);if(!offline)throw Error('Missing offline case');assert.equal(prediction,offline[mode==='legacy'?'legacy':'segmented'],recording.id)}
   rows.push({id:recording.id,name:recording.name,prediction,uncertain});
  }
  const report={note:'Application functional validation on development recordings; not independent accuracy or Safari hardware validation.',purpose:manifest.purpose,mode,decodedSampleRate:await page.evaluate(()=>audioContext().sampleRate),correct:rows.filter(r=>r.name===r.prediction).length,total:rows.length,uncertain:rows.filter(r=>r.uncertain).length,rows};
  fs.writeFileSync(process.argv[3]||'/tmp/browser-cohort-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode,rate:report.decodedSampleRate,correct:report.correct,total:report.total,uncertain:report.uncertain}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
