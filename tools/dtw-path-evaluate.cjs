// Compare v8.7, stronger warp cost, slope limits and static/delta features without class-specific rules.
// Usage: node tools/dtw-path-evaluate.cjs [development-manifest.json] [report.json]
// No manifest: evaluate the 65 embedded/synthetic regression cases. AUDIO_CONTEXT_RATE=48000 is optional.
// No recordings are uploaded. The manifest and its files stay local.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const appHtml=process.env.AUDIO_APP_HTML_PATH?path.resolve(process.env.AUDIO_APP_HTML_PATH):path.join(root,'index.html');
(async()=>{
 const server=http.createServer((req,res)=>{const files={'/':'index.html','/index.html':'index.html','/manifest.webmanifest':'manifest.webmanifest','/references.json':'references.json','/candidate.js':'tools/mfcc-dtw.js','/tools/mfcc-dtw.js':'tools/mfcc-dtw.js'};const f=files[new URL(req.url,'http://localhost').pathname];if(!f){res.writeHead(404);return res.end()}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':'text/html; charset=utf-8');res.end(fs.readFileSync(f==='index.html'?appHtml:path.join(root,f)))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage();if(process.env.AUDIO_CONTEXT_RATE)await page.addInitScript(rate=>{const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(options={}){super({...options,sampleRate:rate})}}},Number(process.env.AUDIO_CONTEXT_RATE));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>refs.size===names.length);if(await page.evaluate(()=>typeof MfccDtw==='undefined'))await page.addScriptTag({url:`http://127.0.0.1:${server.address().port}/candidate.js`});
 const skipEmbedded=process.env.AUDIO_SKIP_EMBEDDED==='1';if(skipEmbedded&&!process.argv[2])throw Error('Skipping embedded cases requires a manifest');let purpose='held-out';const external=[];if(process.argv[2]){const file=path.resolve(process.argv[2]),manifest=JSON.parse(fs.readFileSync(file,'utf8'));purpose=manifest.purpose||'held-out';if(!['held-out','source-comparison','development'].includes(purpose))throw Error('Unsupported manifest purpose');if(!Array.isArray(manifest.recordings)||!manifest.recordings.length)throw Error('recordings must be nonempty');const ids=new Set(),referenceFiles=new Set(),testFiles=new Set();for(const r of manifest.recordings){if(!r.id||ids.has(r.id)||!r.name||!r.file||!r.session||!['reference','test'].includes(r.split))throw Error('Require unique id, name, file, session, and split reference/test');ids.add(r.id);const bytes=fs.readFileSync(fs.realpathSync(path.resolve(path.dirname(file),r.file))),audioHash=require('node:crypto').createHash('sha256').update(bytes).digest('hex');(r.split==='reference'?referenceFiles:testFiles).add(audioHash);external.push({...r,audioSha256:audioHash,b64:bytes.toString('base64')})}if([...testFiles].some(f=>referenceFiles.has(f)))throw Error('Reference and test files overlap');const referenceSessions=new Set(external.filter(r=>r.split==='reference').map(r=>r.session));if(external.some(r=>r.split==='test'&&referenceSessions.has(r.session)))throw Error('Reference and test sessions overlap');if(!external.some(r=>r.split==='test'))throw Error('At least one held-out test recording is required');}
 if(external.length&&(purpose!=='development'||external.some(r=>r.split!=='test')))throw Error('Path experiments require development recordings with split=test');
 const data=await page.evaluate(async external=>{
 const representation=(x,rate)=>MfccDtw.segments(x,rate).map(segment=>{const raw=MfccDtw.extract(x.slice(Math.round(segment.from*rate),Math.round(segment.to*rate)),rate);return {...segment,raw}});
 const decoded=[];for(const name of names){const b=await decodeBuffer(bytes64(EMBEDDED[name]).buffer);decoded.push({name,x:mono(b),rate:b.sampleRate})}
 const references=decoded.map(r=>({name:r.name,segments:representation(r.x,r.rate)})),cases=[];
 if(!external.length)for(const r of decoded){cases.push({...r,kind:'embedded-full'});let best=0,max=-1;const size=Math.round(r.rate);for(let start=0;start+size<=r.x.length;start+=Math.round(r.rate*.25)){let e=0;for(let i=start;i<start+size;i++)e+=r.x[i]*r.x[i];if(e>max){max=e;best=start}}const x=r.x.slice(best,best+size);cases.push({...r,x,kind:'embedded-active-1s'},{...r,x:Float32Array.from(x,v=>v*.1),kind:'synthetic-gain-0.1'},{...r,x,rate:r.rate*1.1,kind:'synthetic-speed-1.1'});let seed=42;const rms=Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length),amplitude=rms*Math.sqrt(3/10);const noisy=Float32Array.from(x,v=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return v+(seed/2**32*2-1)*amplitude});cases.push({...r,x:noisy,kind:'synthetic-white-noise-10dB'})}
 for(const r of external){const b=await decodeBuffer(bytes64(r.b64).buffer);cases.push({name:r.name,id:r.id,audioSha256:r.audioSha256,x:mono(b),rate:b.sampleRate,kind:'development-recording'})}
 return {references,rows:cases.map(r=>({name:r.name,id:r.id||r.name+'-'+r.kind,kind:r.kind,audioSha256:r.audioSha256||null,segments:representation(r.x,r.rate)}))};
 },external);
 const vm=require('node:vm'),sandbox=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'tools/mfcc-dtw.js'),'utf8'),sandbox);const baseline=vm.runInContext('MfccDtw.score',sandbox);
function delta(raw){return raw.map((t,i)=>{const f=t.f.map((_,c)=>[1,2].reduce((s,n)=>s+n*(raw[Math.min(raw.length-1,i+n)].f[c]-raw[Math.max(0,i-n)].f[c]),0)/10),norm=Math.hypot(...f);return norm>1e-8?f.map(v=>v/norm):f.map(()=>0)})}
for(const ref of data.references)for(const s of ref.segments)s.delta=delta(s.raw);
for(const r of data.rows)for(const s of r.segments)s.delta=delta(s.raw);
function dot(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return Math.max(-1,Math.min(1,sum))}
function bounded(q,r,{penalty=.05,staticWeight=0,deltaWeight=0,limited=true}={}){
 if(q.frames.length<20||r.frames.length<20)return null;
 let best=Infinity;const length=Math.min(300,q.frames.length),starts=[];for(let s=0;s<=q.frames.length-length;s+=50)starts.push(s);if(starts.at(-1)!==q.frames.length-length)starts.push(q.frames.length-length);
 for(const start of starts){const n=r.frames.length,states=limited?5:1;let prev=new Float64Array((n+1)*states).fill(Infinity);for(let j=0;j<=n;j++)prev[j*states]=0;
  for(let i=1;i<=length;i++){const now=new Float64Array((n+1)*states).fill(Infinity),qi=start+i-1;
   for(let j=1;j<=n;j++){const cost=1-((1-staticWeight-deltaWeight)*dot(q.frames[qi].f,r.frames[j-1].f)+staticWeight*dot(q.raw[qi].f,r.raw[j-1].f)+deltaWeight*dot(q.delta[qi],r.delta[j-1]));
    if(!limited){now[j]=Math.min(prev[j-1]+2*cost,prev[j]+cost+penalty,now[j-1]+cost+penalty);continue}
    const b=j*5,a=(j-1)*5;now[b]=Math.min(prev[a],prev[a+1],prev[a+2],prev[a+3],prev[a+4])+2*cost;
    now[b+1]=Math.min(prev[b],prev[b+3],prev[b+4])+cost+penalty;now[b+2]=prev[b+1]+cost+penalty;
    now[b+3]=Math.min(now[a],now[a+1],now[a+2])+cost+penalty;now[b+4]=now[a+3]+cost+penalty;
   }prev=now;
  }
  for(let j=1;j<=n;j++)for(let state=0;state<states;state++)best=Math.min(best,prev[j*states+state]/(2*length));
 }return Number.isFinite(best)?1-best:null;
}
const methods=[{name:'v87',score:(q,r)=>baseline(q.frames,r.frames)},{name:'penalty-0.2',score:(q,r)=>bounded(q,r,{penalty:.2,limited:false})},{name:'slope-2',score:(q,r)=>bounded(q,r)},{name:'slope-2-static-0.2',score:(q,r)=>bounded(q,r,{staticWeight:.2})},{name:'slope-2-delta-0.3',score:(q,r)=>bounded(q,r,{deltaWeight:.3})}];
const rows=[];for(const row of data.rows){const q=row.segments.slice().sort((a,b)=>b.energy-a.energy)[0],rankings={};for(const method of methods){const rank=data.references.map(r=>({name:r.name,score:q?Math.max(...r.segments.map(s=>method.score(q,s)??-Infinity)):-Infinity})).filter(r=>Number.isFinite(r.score)).sort((a,b)=>b.score-a.score);rankings[method.name]=rank.slice(0,5)}rows.push({id:row.id,name:row.name,kind:row.kind,audioSha256:row.audioSha256,rankings});}
const summary=methods.map(m=>({method:m.name,correct:rows.filter(r=>r.rankings[m.name][0]?.name===r.name).length,total:rows.length}));const hash=file=>require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');const report={note:'Development method comparison, not independent accuracy. Embedded/synthetic inputs reuse reference audio. New user microphone failures have not been supplied for validation.',audioContextSampleRate:await page.evaluate(()=>audioContext().sampleRate),sourceSha256:hash(appHtml),candidateSha256:hash(path.join(root,'tools/mfcc-dtw.js')),evaluatorSha256:hash(__filename),commit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),generatedAt:new Date().toISOString(),summary,rows};fs.writeFileSync(process.argv[3]||'/tmp/frienda-path-report.json',JSON.stringify(report,null,2)+'\n');console.log(summary);

 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
