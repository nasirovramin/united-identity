const SOURCES=[
{name:"It's Nice That",url:"https://www.itsnicethat.com/tags/branding",host:"www.itsnicethat.com"},
{name:"Creative Boom",url:"https://www.creativeboom.com/work/",host:"www.creativeboom.com"},
{name:"World Brand Design Society",url:"https://worldbranddesign.com/",host:"worldbranddesign.com"},
{name:"The Brand Identity",url:"https://the-brandidentity.com/",host:"the-brandidentity.com"}
];
const FILTERS=["identity","visual communication","branding","brand identity","visual identity","айдентика","фирменный стиль","визуальная идентичность","визуальная айдентика","брендинг","ребрендинг","бренд-система","система бренда","визуальная система","визуальная коммуникация","визуальные коммуникации","бренд-дизайн","редизайн бренда","фирменная айдентика"];
const STRONG=["identity system","brand system","brand design","rebrand","rebranding","brand refresh","brand world"];
const REJECT_PATHS=["/insights","/news","/about","/contact","/jobs","/careers","/features","/articles","/archive","/category","/categories","/tag","/tags","/work/","/projects/"];
const REJECT_TITLES=["insights","news","about","contact","jobs","careers","features","articles","archive","work","projects","branding"];
const MAX_SEND=12;
// Redeploy marker: web crawler + filtered identity scan active.

export default {
 async fetch(req,env){
  const p=new URL(req.url).pathname;
  if(p==="/scan") return out(await scan(env));
  if(p==="/linkedin-test") return out(await linkedinTest(env));
  if(p==="/real-test") return out(await realTest(env));
  if(p==="/health") return out({ok:true,module:"web-page crawler",filters:FILTERS,sources:SOURCES.map(x=>x.name)});
  return new Response("United Identity işləyir ✅\\nVeb modul aktivdir.\\nFiltrlər: Identity / Visual Communication / Branding / Brand Identity");
 },
 async scheduled(c,env,ctx){ctx.waitUntil(scan(env))}
};

async function scan(env){
 need(env);
 const st={ok:true,sources:0,candidates:0,matched:0,sent:0,duplicates:0,errors:[]}, all=[];
 for(const s of SOURCES){
  try{
   const h=await get(s.url); st.sources++;
   for(const a of links(h,s.url,s.host).slice(0,60)){
    if(match(a.text+" "+a.url)) all.push({...a,source:s.name});
   }
  }catch(e){st.errors.push(s.name+": "+msg(e))}
 }
 const uniq=[...new Map(all.map(x=>[x.url,x])).values()]; st.candidates=uniq.length;
 for(const a of uniq.slice(0,45)){
  if(st.sent>=MAX_SEND) break;
  try{
   const k="seen:"+await hash(a.url);
   if(await env.IDENTITY_KV.get(k)){st.duplicates++;continue}
   const h=await get(a.url), m=meta(h,a.url);
   const body=clean(h.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).slice(0,15000);
   if(!match(m.title+" "+m.desc+" "+body)) continue;
   st.matched++;
   await telegram(env,{...m,url:a.url,source:a.source});
   await env.IDENTITY_KV.put(k,new Date().toISOString());
   st.sent++;
  }catch(e){st.errors.push(a.url+": "+msg(e))}
 }
 return st;
}

function match(s){
 const t=clean(s).toLowerCase();
 return FILTERS.some(x=>t.includes(x))||STRONG.some(x=>t.includes(x));
}
function isGenericPage(url,text=""){
 try{
  const u=new URL(url);
  const p=u.pathname.toLowerCase().replace(/\/+$/,"");
  if(REJECT_PATHS.some(x=>p===x.replace(/\/+$/,"")||p.startsWith(x))) return true;
 }catch{}
 const t=clean(text).toLowerCase();
 return REJECT_TITLES.some(x=>t===x||t===x+" | it's nice that"||t===x+" - creative boom");
}
function isProjectLike(m,a,body){
 const head=clean((a.text||"")+" "+(m.title||"")+" "+(m.desc||"")).toLowerCase();
 const strong=STRONG.some(x=>head.includes(x))||FILTERS.some(x=>head.includes(x));
 if(!strong) return false;
 const title=clean(m.title||"").toLowerCase();
 if(!title||title.length<5||REJECT_TITLES.includes(title)) return false;
 if(/^(insights|news|about|contact|jobs|careers|features|articles|archive|work|projects|branding)(\s|$)/i.test(title)) return false;
 return true;
}
async function get(url){
 const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; UnitedIdentityBot/1.0)","Accept":"text/html,application/xhtml+xml"},redirect:"follow"});
 if(!r.ok) throw Error("HTTP "+r.status);
 return r.text();
}
function links(h,base,host){
 const r=[], re=/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
 while((m=re.exec(h))){
  try{
   const u=new URL(dec(m[1]),base); u.hash="";
   if(!u.hostname.endsWith(host.replace(/^www\./,""))) continue;
   const p=u.pathname.toLowerCase();
   if(p==="/"||p.length<8||/\.(jpg|jpeg|png|gif|svg|pdf|zip)$/i.test(p)||/\/(about|contact|jobs|shop|store|submit|privacy|terms|newsletter)(\/|$)/.test(p)) continue;
   r.push({url:u.toString(),text:clean(m[2].replace(/<[^>]+>/g," "))});
  }catch{}
 }
 return r;
}
function meta(h,fallback){
 const title=tag(h,"og:title")||tag(h,"twitter:title")||pick(h,/<title[^>]*>([\s\S]*?)<\/title>/i)||fallback;
 const desc=tag(h,"og:description")||tag(h,"description")||tag(h,"twitter:description")||"";
 const image=tag(h,"og:image")||tag(h,"twitter:image")||"";
 const images=[image,...extractImages(h,fallback)].filter(Boolean);
 return {title:clean(title),desc:clean(desc),image,images:[...new Set(images)].slice(0,10)};
}
function extractImages(h,base){
 const out=[];
 const re=/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi; let m;
 while((m=re.exec(h))){
  try{
   const u=new URL(dec(m[1]),base);
   if(!/^https?:$/i.test(u.protocol)) continue;
   const s=u.toString();
   if(/logo|icon|avatar|sprite|favicon/i.test(s)) continue;
   out.push(s);
  }catch{}
 }
 return out;
}
function tag(h,key){
 const esc=key.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
 return pick(h,new RegExp('<meta[^>]*(?:property|name)=["\\\']'+esc+'["\\\'][^>]*content=["\\\']([^"\\\']*)["\\\']','i'))||
        pick(h,new RegExp('<meta[^>]*content=["\\\']([^"\\\']*)["\\\'][^>]*(?:property|name)=["\\\']'+esc+'["\\\']','i'));
}
function pick(s,r){const m=s.match(r);return m?dec(m[1]):""}
function dec(s=""){return s.replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&nbsp;/gi," ").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n))}
function clean(s=""){return dec(String(s)).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
async function telegram(env,x){
 const title=cleanTitle(x.title||"Identity layihəsi");
 const desc=clean(x.desc||"Vizual kimlik layihəsi.");
 const parts=splitParagraphs(desc,2);
 const sourceLink='<a href="'+esc(x.url)+'">Mənbə: '+esc(x.source)+'</a>';
 const detailsLink=x.telegraphUrl?'<a href="'+esc(x.telegraphUrl)+'">Ətraflı</a>':"";
 const bottom=[detailsLink,sourceLink].filter(Boolean).join("     ");
 const caption=[
  "🎬 <b>"+esc(cut(title,220))+"</b>",
  ...parts.map(p=>esc(cut(p,420))),
  x.agency?"<b>Agentlik:</b> "+esc(x.agency):"",
  "#visualidentity",
  bottom
 ].filter(Boolean).join("\n\n");

 const imgs=(x.images||[]).filter(u=>/^https?:\/\//i.test(u)).slice(0,10);
 if(imgs.length){
  const media=imgs.map((u,i)=>i===0?{type:"photo",media:u,caption,parse_mode:"HTML"}:{type:"photo",media:u});
  const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMediaGroup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,media})});
  const d=await r.json();
  if(d.ok) return d.result;
 }
 const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:caption,parse_mode:"HTML",disable_web_page_preview:true})});
 const d=await r.json(); if(!d.ok) throw Error("Telegram "+JSON.stringify(d));
 return d.result;
}
function cleanTitle(s=""){
 return clean(s).replace(/\s*\|\s*It&#x27;s Nice That$/i,"").replace(/\s*\|\s*It's Nice That$/i,"").trim();
}
function splitParagraphs(s="",n=2){
 s=clean(s);
 if(!s) return [];
 const sentences=s.match(/[^.!?]+[.!?]?/g)||[s];
 if(sentences.length<=1) return [s];
 const mid=Math.ceil(sentences.length/2);
 return [sentences.slice(0,mid).join(" ").trim(),sentences.slice(mid).join(" ").trim()].filter(Boolean).slice(0,n);
}
function esc(s=""){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function cut(s,n){s=clean(s);return s.length<=n?s:s.slice(0,n-1).trim()+"…"}
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function need(e){const a=[];if(!e.TELEGRAM_BOT_TOKEN)a.push("TELEGRAM_BOT_TOKEN");if(!e.TELEGRAM_CHAT_ID)a.push("TELEGRAM_CHAT_ID");if(!e.IDENTITY_KV)a.push("IDENTITY_KV");if(a.length)throw Error("Missing: "+a.join(", "))}
function msg(e){return e instanceof Error?e.message:String(e)}
function out(x){return new Response(JSON.stringify(x,null,2),{headers:{"content-type":"application/json;charset=UTF-8"}})}


async function linkedinTest(env){
 const key="test:linkedin:wildling-papa-tom";
 if(await env.IDENTITY_KV.get(key)) return {ok:true,alreadySent:true};
 const lines=[
  "<b>Wildling Schorle — Brand Identity</b>",
  "Wildling Almaniyanın cənubundan olan alkoqolsuz meyvə içkisidir. PAPA TOM Identity Studio brend üçün təbiəti romantik göstərmək əvəzinə daha xam, atmosferik və qüsurları gizlətməyən vizual dil yaradıb. Narıncı rəng, fotoqrafiya və orqanik W işarəsi bütün identity sistemini birləşdirir.",
  "<b>Agentlik:</b> PAPA TOM Identity Studio",
  "<b>Mənbə:</b> Outstanding Branding — LinkedIn"
 ];
 const text=lines.join("\\n\\n");
 const sourceUrl="https://www.linkedin.com/company/0utstanding-branding/posts/?feedView=all";
 const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,parse_mode:"HTML",link_preview_options:{url:sourceUrl,is_disabled:false,prefer_large_media:true}})});
 const d=await r.json(); if(!d.ok) throw Error("Telegram "+JSON.stringify(d));
 await env.IDENTITY_KV.put(key,new Date().toISOString());
 return {ok:true,sent:true,message_id:d.result.message_id};
}


async function realTest(env){
 need(env);
 const errors=[];
 for(const s of SOURCES){
  try{
   const home=await get(s.url);
   const candidates=links(home,s.url,s.host).slice(0,100);
   for(const a of candidates){
    try{
     if(isGenericPage(a.url,a.text)) continue;
     const h=await get(a.url), m=meta(h,a.url);
     if(isGenericPage(a.url,m.title)) continue;
     const body=clean(h.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).slice(0,20000);
     if(!isProjectLike(m,a,body)) continue;
     const fingerprint=clean(m.title).toLowerCase().replace(/[^a-z0-9а-яё]+/gi," ").trim();
     const key="project:"+await hash(fingerprint||a.url);
     if(await env.IDENTITY_KV.get(key)) continue;
     const result=await telegram(env,{...m,url:a.url,source:s.name});
     await env.IDENTITY_KV.put(key,JSON.stringify({title:m.title,url:a.url,source:s.name,sentAt:new Date().toISOString()}));
     const message_id=Array.isArray(result)&&result[0]?result[0].message_id:result.message_id;
     return {ok:true,sent:true,source:s.name,title:m.title,url:a.url,message_id};
    }catch(e){errors.push(s.name+" candidate: "+msg(e))}
   }
  }catch(e){errors.push(s.name+": "+msg(e))}
 }
 return {ok:false,sent:false,reason:"No unseen Identity candidate found",errors:errors.slice(0,10)};
}
