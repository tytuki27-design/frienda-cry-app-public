/* 8 kHz MFCC + subsequence DTW for evaluation and the opt-in application trial mode.
 * Uses the app's existing resample/fft helpers; evaluate before deployment. */
const MfccDtw=(()=>{
 const rate=8000,size=256,windowSize=200,hopSize=80,filters=24,coefficients=13;
 const mel=hz=>2595*Math.log10(1+hz/700),hz=m=>700*(10**(m/2595)-1);
 const points=Array.from({length:filters+2},(_,i)=>hz(mel(80)+(mel(3800)-mel(80))*i/(filters+1))*size/rate);
 function extract(samples,sampleRate){
 const x=resample(samples,sampleRate),out=[],re=new Float64Array(size),im=new Float64Array(size);
 for(let pos=0;pos+windowSize<=x.length;pos+=hopSize){re.fill(0);im.fill(0);let rms=0;for(let j=0;j<windowSize;j++){rms+=x[pos+j]**2;const previous=pos+j>0?x[pos+j-1]:0;re[j]=(x[pos+j]-.97*previous)*(.5-.5*Math.cos(2*Math.PI*j/(windowSize-1)))}fft(re,im);
 const energy=Array.from({length:filters},(_,b)=>{let sum=0;for(let k=Math.ceil(points[b]);k<points[b+2]&&k<=size/2;k++){const weight=k<points[b+1]?(k-points[b])/(points[b+1]-points[b]):(points[b+2]-k)/(points[b+2]-points[b+1]);sum+=Math.max(0,weight)*(re[k]**2+im[k]**2)}return Math.log(Math.max(sum,1e-12))});
 const f=Array.from({length:coefficients},(_,c)=>energy.reduce((sum,e,b)=>sum+e*Math.cos(Math.PI*(c+1)*(b+.5)/filters),0));const norm=Math.hypot(...f)||1;out.push({f:f.map(v=>v/norm),rms:Math.sqrt(rms/windowSize)});
 }
 // Trim only leading/trailing low-energy frames; internal timing remains intact.
 const peak=out.reduce((peak,f)=>Math.max(peak,f.rms),0),threshold=Math.max(1e-5,peak*.08);let a=0,b=out.length;while(a<b&&out[a].rms<threshold)a++;while(b>a&&out[b-1].rms<threshold)b--;return out.slice(a,b);
 }
 function score(query,reference){
 if(query.length<20||reference.length<20||!query.some(t=>t.f.some(v=>Math.abs(v)>1e-8))||!reference.some(t=>t.f.some(v=>Math.abs(v)>1e-8)))return null;
 // 3 s limit keeps this experiment bounded, matching the production query cap.
 let best=Infinity;const window=Math.min(300,query.length);const starts=[];for(let s=0;s<=query.length-window;s+=50)starts.push(s);if(starts.at(-1)!==query.length-window)starts.push(query.length-window);
 for(const start of starts){const q=query.slice(start,start+window);let previous=new Float64Array(reference.length+1); // Free reference-prefix skip (subsequence DTW).
 for(let i=1;i<=q.length;i++){const current=new Float64Array(reference.length+1).fill(Infinity);for(let j=1;j<=reference.length;j++){let dot=0;for(let c=0;c<coefficients;c++)dot+=q[i-1].f[c]*reference[j-1].f[c];const cost=1-Math.max(-1,Math.min(1,dot));current[j]=Math.min(previous[j-1]+2*cost,previous[j]+cost+.05,current[j-1]+cost+.05)}previous=current;}
 for(let j=1;j<previous.length;j++)best=Math.min(best,previous[j]/(2*q.length));
 }return Number.isFinite(best)?1-best:null;
 }
 function center(frames){if(!frames.length)return frames;const means=frames[0].f.map((_,i)=>frames.reduce((sum,t)=>sum+t.f[i],0)/frames.length);return frames.map(t=>{const f=t.f.map((v,i)=>v-means[i]),norm=Math.hypot(...f);return {...t,f:norm>1e-8?f.map(v=>v/norm):f.map(()=>0)}})}
 function segments(samples,sampleRate){
 const frames=features(samples,sampleRate);if(!frames.length)return [];
 const energies=frames.map(f=>f.rms).sort((a,b)=>a-b),peak=energies[energies.length-1],floor=energies[Math.floor(energies.length*.2)];
 const threshold=Math.max(.00025,Math.min(floor*4,peak*.25),peak*.1),out=[];let start=null,end=0;
 const emit=()=>{const from=Math.max(0,start*.032-.08),to=Math.min(samples.length/sampleRate,end*.032+.064+.08);if(to-from<.2)return;const x=samples.slice(Math.round(from*sampleRate),Math.round(to*sampleRate));let energy=0;for(const v of x)energy+=v*v;out.push({from,to,energy,frames:center(extract(x,sampleRate))})};
 for(let i=0;i<frames.length;i++){if(frames[i].rms>=threshold){if(start===null)start=i;end=i}else if(start!==null&&i-end>6){emit();start=null}}if(start!==null)emit();return out.filter(s=>s.frames.length>=20&&s.frames.some(t=>t.f.some(v=>Math.abs(v)>1e-8)));
 }
 return {extract,score,center,segments};
})();
