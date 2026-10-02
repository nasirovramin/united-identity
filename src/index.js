const SOURCES=[
{name:"It's Nice That",url:"https://www.itsnicethat.com/tags/branding",host:"www.itsnicethat.com"},
{name:"Creative Boom",url:"https://www.creativeboom.com/work/",host:"www.creativeboom.com"},
{name:"World Brand Design Society",url:"https://worldbranddesign.com/",host:"worldbranddesign.com"},
{name:"The Brand Identity",url:"https://the-brandidentity.com/",host:"the-brandidentity.com"}
];
const FILTERS=["identity","visual communication","branding","brand identity","visual identity"];
const STRONG=["identity system","brand system","brand design","rebrand","rebranding","brand refresh","brand world"];
const MAX_SEND=12;\n// Redeploy marker: web crawler + filtered identity scan active.

export default {
 async fetch(req,env){
  const p=new URL(req.url).pathname;
  if(p==="/scan") return out(await scan(env));
  if(p==="/health") return out({ok:true,module:"web-page crawler",filters:FILTERS,sources:SOURCES.map(x=>x.name)});
  return new Response("United Identity işləyir ✅\nVeb modul aktivdir.\nFiltrlər: Identity / Visual Communication / Branding / Brand Identity");
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
 return {title:clean(title),desc:clean(desc)};
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
 const t="🟨 <b>"+esc(cut(x.title,220))+"</b>\n\n"+(x.desc?esc(cut(x.desc,520))+"\n\n":"")+"🌐 <b>Mənbə:</b> "+esc(x.source)+"\n🔗 <a href=\""+esc(x.url)+"\">Materialı aç</a>\n\n#Branding #BrandIdentity #VisualIdentity #VisualCommunication";
 const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:t,parse_mode:"HTML",disable_web_page_preview:false})});
 const d=await r.json(); if(!d.ok) throw Error("Telegram "+JSON.stringify(d));
}
function esc(s=""){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function cut(s,n){s=clean(s);return s.length<=n?s:s.slice(0,n-1).trim()+"…"}
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function need(e){const a=[];if(!e.TELEGRAM_BOT_TOKEN)a.push("TELEGRAM_BOT_TOKEN");if(!e.TELEGRAM_CHAT_ID)a.push("TELEGRAM_CHAT_ID");if(!e.IDENTITY_KV)a.push("IDENTITY_KV");if(a.length)throw Error("Missing: "+a.join(", "))}
function msg(e){return e instanceof Error?e.message:String(e)}
function out(x){return new Response(JSON.stringify(x,null,2),{headers:{"content-type":"application/json;charset=UTF-8"}})}
