const F=require('./engine.js'),cp=require('child_process');
let seed=9001;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return (seed>>8)%n};const pick=a=>a[rnd(a.length)];
const words=['Hello','caf\u00e9','na\u00efve','\u00fcber','\u65e5\u672c\u8a9e','\u05e9\u05dc\u05d5\u05dd','\u0420\u0443\u0441\u0441\u043a\u0438\u0439','Re:','a b','100%','\u20ac5','\ud83d\ude00 ok','x_y','=?','?='];
const phrase=()=>{let n=1+rnd(4),a=[];while(n--)a.push(pick(words));return a.join(rnd(3)?' ':'  ')};
const cs=[['utf-8',s=>Buffer.from(s,'utf8')],['iso-8859-1',s=>Buffer.from(s,'latin1')],['windows-1252',s=>Buffer.from(s,'latin1')]];
function encWord(s,csn,fn,mode){const b=fn(s);if(mode==='B')return '=?'+csn+'?B?'+b.toString('base64')+'?=';let q='';for(const x of b){if((x>=48&&x<=57)||(x>=65&&x<=90)||(x>=97&&x<=122))q+=String.fromCharCode(x);else if(x===32)q+='_';else q+='='+x.toString(16).toUpperCase().padStart(2,'0')}return '=?'+csn+'?Q?'+q+'?='}
const sub=()=>{let n=1+rnd(3),out=[];while(n--){const k=rnd(3);if(k===0)out.push('Plain '+pick(['text','news','2026']));else{let [c,fn]=pick(cs);let s=phrase();if(c!=='utf-8')s=s.replace(/[^\u0000-\u00ff]/g,'x');out.push(encWord(s,c,fn,pick(['B','Q'])))}}return out.join(pick([' ','  ','\r\n ']))};
const ids=['ann','bob.smith','x+y','c_d'],doms=['example.com','mail.test.org','a.io'],nm=['Ann Lee','Doe, John','O\'Neil','Jos\u00e9','"Q" Test','Sam'];
const q=s=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
const addr=()=>{const a=pick(ids)+'@'+pick(doms),k=rnd(5);const n=pick(nm).replace(/[^\u0000-\u007f]/g,'e');if(k===0)return a;if(k===1)return n.replace(/[",]/g,'')+' <'+a+'>';if(k===2)return q(n)+' <'+a+'>';if(k===3)return '<'+a+'>';return a+' ('+pick(['work','a b'])+')'};
const addrs=()=>{let n=1+rnd(3),a=[];while(n--)a.push(addr());return a.join(', ')};
const pad=n=>String(n).padStart(2,'0'),D=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const date=()=>{const y=2000+rnd(40),m=rnd(12),d=1+rnd(28),dt=new Date(Date.UTC(y,m,d));const tz=pick(['+0000','-0500','+0530','+0300','-0800','GMT']);const wd=rnd(4)?(rnd(2)?D[dt.getUTCDay()]+', ':''):D[rnd(7)]+', ';return wd+(rnd(2)?pad(d):d)+' '+M[m]+' '+y+' '+pad(rnd(24))+':'+pad(rnd(60))+(rnd(3)?':'+pad(rnd(60)):'')+' '+tz};
const pct=s=>[...Buffer.from(s,'utf8')].map(b=>(b>=48&&b<=57)||(b>=65&&b<=90)||(b>=97&&b<=122)||b===46?String.fromCharCode(b):'%'+b.toString(16).toUpperCase().padStart(2,'0')).join('');
const fn=()=>{const n=pick(['report','na\u00efve file','\u65e5\u672c\u8a9e','caf\u00e9 menu','plain']),k=rnd(4);
 if(k===0)return 'attachment; filename="'+n.replace(/[^\u0000-\u007f]/g,'e')+'.pdf"';
 if(k===1)return "attachment; filename*=UTF-8''"+pct(n+'.pdf');
 if(k===2){const e=pct(n+'.pdf'),h=Math.max(3,Math.floor(e.length/2));let cut=h;while(e[cut-1]==='%'||e[cut-2]==='%')cut++;return "attachment; filename*0*=UTF-8''"+e.slice(0,cut)+'; filename*1*='+e.slice(cut)}
 return 'attachment; filename*0="'+n.replace(/[^\u0000-\u007f]/g,'e')+'"; filename*1=".pdf"'};
const req=[],exp=[];
for(let i=0;i<1500;i++){const s=sub();req.push(['subject',s.replace(/\r\n/g,'')]);exp.push(['subject',F.decodeWords(s.replace(/\r\n/g,'')).text])}
for(let i=0;i<1500;i++){const s=addrs();req.push(['addr',s]);exp.push(['addr',F.parseAddressList(s).map(x=>[x.name,x.addr])])}
for(let i=0;i<1500;i++){const s=date();req.push(['date',s]);const p=F.parseDate(s);exp.push(['date',p.ok&&p.iso?p.iso.replace(/\.\d+/,''):'ERR:'+(p.error||p.unknownTz)])}
for(let i=0;i<1500;i++){const s=fn();req.push(['fname',s]);const p=F.parseParams(s);exp.push(['fname',p.params.filename===undefined?null:p.params.filename])}
const o=JSON.parse(cp.execFileSync('python3',['oracle.py'],{input:JSON.stringify(req),maxBuffer:1e9}));
const bad={};let nb=0;
o.forEach((v,i)=>{const k=req[i][0],e=exp[i][1];let ov=v;
 if(k==='subject'){ov=v;}
 if(JSON.stringify(ov)!==JSON.stringify(e)){nb++;(bad[k]=bad[k]||[]).length<3&&bad[k].push([req[i][1],e,ov])}});
console.log('cases',o.length,'mismatches',nb,JSON.stringify(Object.fromEntries(Object.entries(bad).map(([k,v])=>[k,v.length]))));
if(nb)console.log(JSON.stringify(bad).slice(0,2500));
process.exit(nb?1:0);
