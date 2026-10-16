const assert=require('node:assert/strict');const {chromium}=require('playwright-core');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{const page=await browser.newPage();await page.goto('http://127.0.0.1:8000');await page.waitForFunction(()=>refs.size===names.length);
const result=await page.evaluate(async()=>{
 const frame={f:Array(24).fill(1/Math.sqrt(24)),rms:.01};
 const legacy={name:names[0],frames:Array.from({length:30},()=>({...frame,f:[...frame.f]}))};
 localStorage.setItem('frienda-v85-user-samples',JSON.stringify([legacy]));loadSamples();
 const inherited=userSamples.length===1&&$('sampleCounts').textContent.includes(names[0]+' 1件')&&$('sampleCounts').textContent.includes(names[1]+' 0件');
 const originalFeatures=features,originalAlign=align,originalRefs=new Map(refs);
 features=()=>legacy.frames;
 const base1=[],base2=[];refs.clear();refs.set(names[0],{features:base1});refs.set(names[1],{features:base2});
 const match=score=>({score,from:0,to:1,refFrom:0,refTo:1,scale:1});let calls=0;
 align=(q,r)=>{calls++;return match(r===base1?.8:r===base2?.89:.9)};
 await compare(new Float32Array(8000),8000);
 const close=$('results').textContent.includes('判定不確か')&&$('results').textContent.includes('内蔵MP3 0.800 / 追加録音 0.900');
 const diagnostic=$('diagnostics').textContent.includes('実際に照合 1件 / 成立 1件')&&calls===3;
 const playback=$('results').querySelector('button[data-refname]')?.dataset.from==='0';
 align=(q,r)=>r===userSamples[0]?.frames?null:match(r===base1?.9:.5);
 await compare(new Float32Array(8000),8000);const rejected=$('diagnostics').textContent.includes('実際に照合 1件 / 成立 0件')&&!$('results').textContent.includes('判定不確か');
 userSamples=[];updateSampleStatus();await compare(new Float32Array(8000),8000);const empty=$('diagnostics').textContent.includes('実際に照合 0件')&&$('results').textContent.includes('未登録');
 align=()=>null;await compare(new Float32Array(8000),8000);const failure=$('results').classList.contains('hidden')&&$('status').textContent.includes('判定エラー')&&$('diagnostics').textContent.includes('照合診断');
 features=originalFeatures;align=originalAlign;refs.clear();for(const [k,v]of originalRefs)refs.set(k,v);
 store(new Float32Array(7*8000),8000);$('clipEnd').value='7';$('clipStart').value='0';$('addSample').onclick();const longRejected=userSamples.length===0&&$('sampleStatus').textContent.includes('長すぎます');
 return {inherited,close,diagnostic,playback,rejected,empty,failure,longRejected};
});for(const [name,passed]of Object.entries(result)){assert.equal(passed,true,name);console.log(name+': passed')}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
