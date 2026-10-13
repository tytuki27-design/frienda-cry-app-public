const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:8000');if(response.status()!==200)throw Error('HTTP failed');
 await page.waitForFunction(()=>document.querySelector('#ready').textContent==='基準MP3 13匹の準備完了',null,{timeout:60000});
 console.log('Ready:',await page.locator('#ready').innerText());
 if(await page.locator('#start').isDisabled())throw Error('Start is disabled');
 const audio=await page.evaluate(async()=>{for(const name of names){const b=await decodeBuffer(bytes64(EMBEDDED[name]).buffer),x=mono(b);for(let t=0;t+1<b.duration;t+=.25){const clip=x.slice(Math.round(t*b.sampleRate),Math.round((t+1)*b.sampleRate));const m=align(features(clip,b.sampleRate),refs.get(name).features);if(m&&m.score>.9)return {name,rate:b.sampleRate,samples:Array.from(clip)};}}throw Error('No suitable reference clip')});
 const wav=Buffer.alloc(44+audio.samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(audio.rate,24);wav.writeUInt32LE(audio.rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);audio.samples.forEach((x,i)=>wav.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(x*32767))),44+i*2));
 await page.locator('#file').setInputFiles({name:'reference.wav',mimeType:'audio/wav',buffer:wav});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('完了（') || document.querySelector('#status').textContent.includes('エラー'),null,{timeout:60000});
 console.log('Classification:',await page.locator('#status').innerText());
 const winner=await page.locator('.winner strong').innerText();if(winner!==audio.name)throw Error('Self-match mismatch: '+winner);console.log('Self-match:',winner);
 await page.locator('#judgeClip').click();await page.waitForFunction(()=>document.querySelector('#clipMessage').textContent.includes('完了'),null,{timeout:60000});
 console.log('Manual:',await page.locator('#clipMessage').innerText());
 await page.locator('#addSample').click();if(!await page.locator('#sampleStatus').innerText().then(x=>x.includes('全1件')))throw Error('Sample registration failed');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#ready').textContent==='基準MP3 13匹の準備完了');
 if(!await page.locator('#sampleStatus').innerText().then(x=>x.includes('登録 1件')))throw Error('Persistence failed');
 console.log('Sample registration and reload persistence: passed');
 for(const path of ['references.json','manifest.webmanifest']){const r=await page.request.get('http://127.0.0.1:8000/'+path);if(!r.ok())throw Error(path+' failed');await r.json();console.log(path+': HTTP 200 and valid JSON');}
 if(errors.length)throw Error(errors.join('\n'));console.log('Uncaught page errors: 0');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
