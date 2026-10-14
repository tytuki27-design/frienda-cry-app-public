// Local-only legacy feature diagnostics. Does not publish or modify the input JSON.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=process.argv[2];if(!file)throw Error('Usage: node tools/diagnose-samples.cjs samples.json');
const uploaded=JSON.parse(fs.readFileSync(file,'utf8'));
if(uploaded.version!==1||!Array.isArray(uploaded.samples)||uploaded.samples.length>65)throw Error('Unsupported sample JSON');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.split('<script>')[1].split('</script>')[0].replace(/init\(\);\s*$/,'');
const context=vm.createContext({console,Float32Array,Float64Array,setTimeout,document:{getElementById:()=>({})},localStorage:{getItem:()=>null},uploaded});
vm.runInContext(script,context);
const result=vm.runInContext(`uploaded.samples.map(sample=>{
 if(!validSample(sample))return {valid:false};
 const frames=sample.frames,n=frames.length,energies=frames.map(x=>x.rms).sort((a,b)=>a-b),threshold=Math.max(.00025,energies[Math.floor(n*.6)]*.22);
 return {name:sample.name,valid:true,frameCount:n,durationSeconds:(n-1)*hop/targetRate+fftSize/targetRate,selfMatch:sampleQuality(sample),minimumRms:energies[0],medianRms:energies[Math.floor(n/2)],maximumRms:energies[n-1],queryThreshold:threshold,queryActive:frames.filter(x=>x.rms>=threshold).length,exactMatched:frames.filter(x=>x.rms>=threshold&&x.rms>=.0003).length,exactMinimumMatched:n*.58,exactWeight:frames.reduce((sum,x)=>sum+(x.rms>=threshold&&x.rms>=.0003?Math.min(1,x.rms/.003)**2:0),0),exactMinimumWeight:n*.15};
})`,context);
console.log(JSON.stringify({note:'Self-match diagnostics are not independent accuracy measurements; exact-alignment gate counts do not describe every alternative alignment.',samples:result},null,2));
