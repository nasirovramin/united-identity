const SOURCES=[
{name:"It's Nice That",url:"https://www.itsnicethat.com/tags/branding",host:"www.itsnicethat.com"},
{name:"Creative Boom",url:"https://www.creativeboom.com/work/",host:"www.creativeboom.com"},
{name:"World Brand Design Society",url:"https://worldbranddesign.com/",host:"worldbranddesign.com"},
{name:"The Brand Identity",url:"https://the-brandidentity.com/",host:"the-brandidentity.com"}
];
const FILTERS=["identity","visual communication","branding","brand identity","visual identity","айдентика","фирменный стиль","визуальная идентичность","визуальная айдентика","брендинг","ребрендинг","бренд-система","система бренда","визуальная система","визуальная коммуникация","визуальные коммуникации","бренд-дизайн","редизайн бренда","фирменная айдентика"];
const STRONG=["identity system","brand system","brand design","rebrand","rebranding","brand refresh","brand world"];
const REJECT_PATHS=["/insights","/news","/about","/contact","/jobs","/careers","/features","/archive","/category","/categories","/tag","/tags","/work/","/projects/","/media/identity","/media/graphic-design","/media/branding","/media/typography"];
const REJECT_TITLES=["insights","news","about","contact","jobs","careers","features","articles","archive","work","projects","branding"];
const MAX_SEND=1;
const MAX_PAGE_FETCHES_PER_RUN=20;
// Redeploy marker: web crawler + filtered identity scan active.

export default {
 async fetch(req,env){
  const p=new URL(req.url).pathname;
  if(p==="/scan"){
   const r=await scan(env);
   return out(r,r.ok?200:500);
  }
  if(p==="/self-test"){
   try{
    const r=await selfTest(env);
    return out(r,r.ok?200:500);
   }catch(e){
    return out({ok:false,error:msg(e)},500);
   }
  }
  if(p==="/health") return out({ok:true,module:"web-page crawler",filters:FILTERS,sources:SOURCES.map(x=>x.name)});
  if(p==="/diagnostics"){
   const raw=await env.IDENTITY_KV.get("diag:last-scan");
   return out(raw?JSON.parse(raw):{ok:false,reason:"No scan diagnostics yet"});
  }
  if(p==="/repair-az") return out(await repairAzPosts(env));
  return new Response("United Identity production rejimində işləyir ✅\\nAvtomatik paylaşım aktivdir.");
 },
 async scheduled(c,env,ctx){
  ctx.waitUntil((async()=>{
   const d=new Date(c&&c.scheduledTime?c.scheduledTime:Date.now());
   if(d.getUTCHours()===0){
    try{ await repairAzPosts(env); }catch(e){}
   }
   await scan(env);
  })());
 }
};

async function scan(env){
 need(env);
 const st={
  ok:true,
  startedAt:new Date().toISOString(),
  sourcesTotal:SOURCES.length,
  sourcesVisited:0,
  candidates:0,
  matched:0,
  sent:0,
  duplicates:0,
  skippedGeneric:0,
  skippedNoIdentity:0,
  skippedFetchLimit:0,
  errors:[],
  perSource:[]
 };

 const sourceBatches=[];
 // Rotate the starting source every hour so one source cannot dominate when MAX_SEND=1.
 const now=new Date();
 const rotationIndex=(Math.floor(now.getTime()/3600000))%SOURCES.length;
 const rotatedSources=[...SOURCES.slice(rotationIndex),...SOURCES.slice(0,rotationIndex)];
 st.rotationStart=rotatedSources[0]?rotatedSources[0].name:"";
 for(const s of rotatedSources){
  const srcStat={source:s.name,homeOk:false,links:0,eligible:0,checked:0,matched:0,sent:0,duplicates:0,errors:[]};
  try{
   const h=await get(s.url);
   st.sourcesVisited++;
   srcStat.homeOk=true;
   let arr=links(h,s.url,s.host)
    .map(a=>({...a,source:s.name,score:candidateScore(a)}))
    .filter(a=>{
      if(isGenericPage(a.url,a.text)){st.skippedGeneric++;return false}
      return true;
    })
    .sort((a,b)=>b.score-a.score);
   srcStat.links=arr.length;
   srcStat.eligible=arr.length;
   sourceBatches.push({source:s,candidates:arr,stat:srcStat});
  }catch(e){
   srcStat.errors.push(msg(e));
   st.errors.push(s.name+": "+msg(e));
   sourceBatches.push({source:s,candidates:[],stat:srcStat});
  }
  st.perSource.push(srcStat);
 }

 st.candidates=sourceBatches.reduce((n,b)=>n+b.candidates.length,0);

 // Round-robin: check one candidate from every source before taking a second from any source.
 let pageFetches=0;
 let round=0;
 const maxRounds=8;
 while(st.sent<MAX_SEND && pageFetches<MAX_PAGE_FETCHES_PER_RUN && round<maxRounds){
  let progressed=false;

  for(const batch of sourceBatches){
   if(st.sent>=MAX_SEND || pageFetches>=MAX_PAGE_FETCHES_PER_RUN) break;

   const a=batch.candidates[round];
   if(!a) continue;
   progressed=true;
   pageFetches++;
   batch.stat.checked++;

   try{
    const k="seen:"+await hash(a.url);
    if(await env.IDENTITY_KV.get(k)){
     st.duplicates++;
     batch.stat.duplicates++;
     continue;
    }

    const h=await get(a.url), m=meta(h,a.url);
    if(isGenericPage(a.url,m.title)){
     st.skippedGeneric++;
     continue;
    }

    const body=clean(
     h.replace(/<script\b[\s\S]*?<\/script>/gi," ")
      .replace(/<style\b[\s\S]*?<\/style>/gi," ")
      .replace(/<[^>]+>/g," ")
    ).slice(0,20000);

    if(!isProjectLike(m,a,body)){
     st.skippedNoIdentity++;
     continue;
    }

    // Reject candidates without usable project media before any AI translation.
    // This prevents spending Workers AI quota on posts that Telegram would refuse anyway.
    const usableImages=(m.images||[]).filter(u=>/^https?:\/\//i.test(u));
    if(!usableImages.length){
     st.skippedNoMedia=(st.skippedNoMedia||0)+1;
     continue;
    }

    st.matched++;
    batch.stat.matched++;
    const prepared=await prepareProject(env,h,m,a.url,a.source);
    const tgResult=await telegram(env,prepared);
    const telegramMessageIds=messageIds(tgResult);
    await env.IDENTITY_KV.put(
      k,
      JSON.stringify({
       postId:prepared.postId,
       title:m.title,
       titleAz:prepared.titleAz,
       url:a.url,
       source:a.source,
       telegraphUrl:prepared.telegraphUrl||"",
       telegraphPath:prepared.telegraphPath||"",
       telegramMessageIds,
       sentAt:new Date().toISOString()
      })
    );
    st.sent++;
    batch.stat.sent++;

   }catch(e){
    const err=a.url+": "+msg(e);
    batch.stat.errors.push(err);
    st.errors.push(err);
   }
  }

  if(!progressed) break;
  round++;
 }

 if(pageFetches>=MAX_PAGE_FETCHES_PER_RUN && st.sent<MAX_SEND){
  st.skippedFetchLimit=1;
 }

 st.finishedAt=new Date().toISOString();
 st.blockingErrors=(st.matched>0 && st.sent===0)?st.errors.slice(0,10):[];
 if(st.blockingErrors.length) st.ok=false;
 st.sourceDistribution=st.perSource
  .filter(x=>x.sent>0)
  .map(x=>({source:x.source,sent:x.sent}));

 // Save only one compact diagnostic snapshot per scan.
 try{
  await env.IDENTITY_KV.put("diag:last-scan",JSON.stringify(st));
 }catch(e){}

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
  const seg=p.split("/").filter(Boolean);
  if(seg.length<=2 && /^(media|topic|topics|category|categories|tag|tags|work|projects)$/i.test(seg[0]||"")) return true;
 }catch{}
 const t=clean(text).toLowerCase();
 return REJECT_TITLES.some(x=>t===x||t===x+" | it's nice that"||t===x+" - creative boom")||
   /^(identity|graphic design|branding|typography)\s*(\||-|$)/i.test(t);
}
function candidateScore(a){
 const t=clean((a.text||"")+" "+(a.url||"")).toLowerCase();
 let score=0;
 for(const x of STRONG) if(t.includes(x)) score+=4;
 for(const x of FILTERS) if(t.includes(x)) score+=2;
 if(/case|project|identity|brand|rebrand|visual|design/i.test(t)) score+=1;
 return score;
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
 const jsonld=extractJsonLd(h);
 const title=
  tag(h,"og:title")||
  tag(h,"twitter:title")||
  jsonld.headline||
  jsonld.name||
  pick(h,/<title[^>]*>([\s\S]*?)<\/title>/i)||
  fallback;
 const desc=
  tag(h,"og:description")||
  tag(h,"description")||
  tag(h,"twitter:description")||
  jsonld.description||
  "";
 const image=
  tag(h,"og:image")||
  tag(h,"twitter:image")||
  jsonld.image||
  "";
 const images=[image,...jsonld.images,...extractProjectImages(h,fallback)].filter(Boolean);
 const published=
  tag(h,"article:published_time")||
  tag(h,"datePublished")||
  jsonld.datePublished||
  pick(h,/<time[^>]*datetime=["']([^"']+)["']/i)||
  "";
 const modified=
  tag(h,"article:modified_time")||
  jsonld.dateModified||
  "";
 const author=jsonld.author||"";
 return {
  title:clean(title),
  desc:clean(desc),
  image,
  images:dedupeImageUrls(images),
  published:clean(published),
  modified:clean(modified),
  author:clean(author)
 };
}

function extractJsonLd(h){
 const out={headline:"",name:"",description:"",datePublished:"",dateModified:"",author:"",image:"",images:[]};
 const re=/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m;
 const items=[];
 while((m=re.exec(h))){
  try{
   const parsed=JSON.parse(m[1].trim());
   if(Array.isArray(parsed)) items.push(...parsed);
   else if(parsed&&Array.isArray(parsed["@graph"])) items.push(...parsed["@graph"]);
   else if(parsed) items.push(parsed);
  }catch{}
 }
 const pickText=v=>{
  if(!v) return "";
  if(typeof v==="string") return v;
  if(Array.isArray(v)) return v.map(pickText).filter(Boolean).join(", ");
  if(typeof v==="object") return v.name||v.headline||v.url||"";
  return "";
 };
 const imageVals=[];
 for(const x of items){
  if(!x||typeof x!=="object") continue;
  const type=String(x["@type"]||"").toLowerCase();
  const useful=/article|newsarticle|blogposting|creativework|project|webpage/.test(type);
  if(!useful && !out.headline && !out.name) continue;
  out.headline ||= pickText(x.headline);
  out.name ||= pickText(x.name);
  out.description ||= pickText(x.description);
  out.datePublished ||= pickText(x.datePublished);
  out.dateModified ||= pickText(x.dateModified);
  out.author ||= pickText(x.author||x.creator);
  const iv=x.image||x.thumbnailUrl||x.primaryImageOfPage;
  const vals=Array.isArray(iv)?iv:[iv];
  for(const v of vals){
   if(typeof v==="string") imageVals.push(v);
   else if(v&&typeof v==="object"){
    if(v.url) imageVals.push(v.url);
    if(v.contentUrl) imageVals.push(v.contentUrl);
   }
  }
 }
 out.images=imageVals;
 out.image=imageVals[0]||"";
 return out;
}

function dedupeImageUrls(list){
 const seen=new Set(), out=[];
 for(const raw of list){
  if(!raw) continue;
  try{
   const u=new URL(dec(raw));
   if(!/^https?:$/i.test(u.protocol)) continue;
   const key=(u.hostname+u.pathname)
    .replace(/[-_](?:\d{2,4})x(?:\d{2,4})(?=\.[a-z0-9]+$)/i,"")
    .replace(/\/cdn-cgi\/image\/[^/]+\//i,"/");
   if(seen.has(key)) continue;
   seen.add(key); out.push(u.toString());
  }catch{}
 }
 return out;
}

function extractProjectImages(h,base){
 let scope=String(h||"")
  .replace(/<script\b[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[\s\S]*?<\/style>/gi," ")
  .replace(/<nav\b[\s\S]*?<\/nav>/gi," ")
  .replace(/<footer\b[\s\S]*?<\/footer>/gi," ")
  .replace(/<aside\b[\s\S]*?<\/aside>/gi," ");

 const article=scope.match(/<article\b[^>]*>[\s\S]*?<\/article>/i);
 const main=scope.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
 scope=(article&&article[0])||(main&&main[0])||scope;

 const stop=scope.search(/(?:The Latest|Share Article|Further Info|About the Author|Related Articles|More from)/i);
 if(stop>0) scope=scope.slice(0,stop);

 const out=[];
 const add=(raw,tag="")=>{
  if(!raw) return;
  let val=dec(raw).trim();
  // A srcset may contain many variants of the same project image. Keep the
  // largest variant from that srcset, but do not stop scanning the element:
  // other lazy/full-size attributes can point to additional project images.
  if(/\s+\d+(?:w|x)(?:\s*,|$)/i.test(val)||val.includes(",")){
   const parts=val.split(",").map(x=>x.trim()).filter(Boolean);
   let best="",score=-1;
   for(const part of parts){
    const mm=part.match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/i);
    if(mm){
     const sc=parseFloat(mm[2])*(mm[3].toLowerCase()==="x"?10000:1);
     if(sc>score){score=sc;best=mm[1]}
    }else if(!best) best=part.split(/\s+/)[0];
   }
   val=best||val.split(",").pop().trim().split(/\s+/)[0];
  }
  try{
   const u=new URL(val,base);
   if(!/^https?:$/i.test(u.protocol)) return;
   const s=u.toString();
   if(/(?:logo|favicon|avatar|sprite|icon|emoji|tracking|pixel|analytics|cookie|consent|accessibility|toolbar|newsletter|subscribe|advert|adserver|nicer[-_ ]?tuesdays)/i.test(s+" "+tag)) return;
   if(/\.svg(?:\?|$)/i.test(s)) return;
   const wm=tag.match(/\bwidth=["']?(\d+)/i), hm=tag.match(/\bheight=["']?(\d+)/i);
   if(wm&&hm&&(+wm[1]<220||+hm[1]<160)) return;
   out.push(s);
  }catch{}
 };

 let m;
 const imgRe=/<img\b[^>]*>/gi;
 while((m=imgRe.exec(scope))){
  const tag=m[0];
  const attrs=["data-full-src","data-full","data-hi-res-src","data-original","data-lazy-src","data-image","data-url","data-flickity-lazyload","data-lazy-srcset","data-srcset","srcset","data-src","src"];
  for(const a of attrs){
   const mm=tag.match(new RegExp("\\b"+a+"=[\"']([^\"']+)[\"']","i"));
   if(mm) add(mm[1],tag);
  }
 }

 const sourceRe=/<source\b[^>]*>/gi;
 while((m=sourceRe.exec(scope))){
  const tag=m[0];
  const attrs=["data-full-src","data-full","data-lazy-srcset","data-srcset","srcset","data-src","src"];
  for(const a of attrs){
   const mm=tag.match(new RegExp("\\b"+a+"=[\"']([^\"']+)[\"']","i"));
   if(mm) add(mm[1],tag);
  }
 }

 // Picture/source markup and many CMSs expose project images in arbitrary
 // data-* attributes. Scan every URL-looking attribute inside article/main.
 const attrUrlRe=/\b(?:src|srcset|href|content|data-[a-z0-9_-]+)=[\"']([^\"']+)[\"']/gi;
 while((m=attrUrlRe.exec(scope))){
  const raw=m[1];
  if(/^https?:\/\//i.test(dec(raw)) || /\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(raw)) add(raw,"project media attribute");
 }

 // CSS background images.
 const bgRe=/background(?:-image)?\s*:\s*url\(([\"']?)([^\"')]+)\1\)/gi;
 while((m=bgRe.exec(scope))) add(m[2],"background-image");

 // JSON-escaped image URLs sometimes embedded in data attributes.
 const escapedUrlRe=/https?:\\?\/\\?\/[^\s\"'<>]+?\.(?:jpe?g|png|webp|avif)(?:\?[^\s\"'<>]*)?/gi;
 while((m=escapedUrlRe.exec(scope))) add(m[0].replace(/\\\//g,"/"),"embedded project image");

 return dedupeImageUrls(out);
}
function tag(h,key){
 const esc=key.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
 return pick(h,new RegExp('<meta[^>]*(?:property|name)=["\\\']'+esc+'["\\\'][^>]*content=["\\\']([^"\\\']*)["\\\']','i'))||
        pick(h,new RegExp('<meta[^>]*content=["\\\']([^"\\\']*)["\\\'][^>]*(?:property|name)=["\\\']'+esc+'["\\\']','i'));
}
function pick(s,r){const m=s.match(r);return m?dec(m[1]):""}
function dec(s=""){return s.replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&nbsp;/gi," ").replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n))}
function clean(s=""){return dec(String(s)).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function normalizeIdentityTerms(s=""){
 return String(s)
  .replace(/\bbrand\s+identity\b/gi,"Vizual kimlik")
  .replace(/\bvisual\s+identity\b/gi,"Vizual kimlik")
  .replace(/\bidentiklik\b/gi,"Vizual kimlik")
  .replace(/\bайдентика\b/gi,"Vizual kimlik");
}
function buildCaption(x){
 const title=normalizeIdentityTerms(cleanTitle(x.titleAz||x.title||"Vizual kimlik layihəsi"));
 const desc=normalizeIdentityTerms(clean(x.desc||"Vizual kimlik layihəsi."));
 const parts=splitParagraphs(desc,2);
 const sourceLink='<a href="'+esc(x.url)+'">Mənbə: '+esc(x.source)+'</a>';
 const detailsLink=x.telegraphUrl?'<a href="'+esc(x.telegraphUrl)+'">Ətraflı</a>':"";
 const bottom=[detailsLink,sourceLink].filter(Boolean).join("     ");
 return [
  "🎬 <b>"+esc(cut(title,220))+"</b>",
  ...parts.map(p=>esc(cut(p,420))),
  x.agency?"<b>Agentlik:</b> "+esc(x.agency):"",
  x.projectDate?"<b>"+esc(x.projectDateLabel||"Yaranma tarixi")+":</b> "+esc(x.projectDate):"",
  x.postId?"<b>ID:</b> "+esc(x.postId):"",
  "#visualidentity",
  bottom
 ].filter(Boolean).join("\n\n");
}

async function telegram(env,x){
 const caption=buildCaption(x);
 const imgs=(x.images||[]).filter(u=>/^https?:\/\//i.test(u)).slice(0,10);

 // Never publish image-less posts.
 if(!imgs.length) throw Error("No usable project image found");

 // Case study / Telegraph exists: Telegram post must have one project image.
 if(x.telegraphUrl){
  for(const photo of imgs){
   const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendPhoto",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,photo,caption,parse_mode:"HTML"})});
   const d=await r.json();
   if(d.ok) return d.result;
  }
  throw Error("All project images failed in Telegram");
 }

 // No case study: publish project visuals as an album, no Details link.
 const media=imgs.map((u,i)=>i===0?{type:"photo",media:u,caption,parse_mode:"HTML"}:{type:"photo",media:u});
 const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMediaGroup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,media})});
 const d=await r.json();
 if(d.ok) return d.result;

 // If album fails, try one-by-one and publish the first working image.
 for(const photo of imgs){
  const rr=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendPhoto",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,photo,caption,parse_mode:"HTML"})});
  const dd=await rr.json();
  if(dd.ok) return dd.result;
 }
 throw Error("No usable project image could be sent to Telegram");
}
function cleanTitle(s=""){
 return clean(s).replace(/\s*\|\s*It&#x27;s Nice That$/i,"").replace(/\s*\|\s*It's Nice That$/i,"").trim();
}
function messageIds(result){
 const arr=Array.isArray(result)?result:[result];
 return arr.filter(Boolean).map(x=>x.message_id).filter(Number.isFinite);
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
async function makePostId(url,title=""){
 const h=await hash((url||"")+"|"+cleanTitle(title||""));
 return "UID-"+h.slice(0,10).toUpperCase();
}
function need(e){const a=[];if(!e.TELEGRAM_BOT_TOKEN)a.push("TELEGRAM_BOT_TOKEN");if(!e.TELEGRAM_CHAT_ID)a.push("TELEGRAM_CHAT_ID");if(!e.IDENTITY_KV)a.push("IDENTITY_KV");if(a.length)throw Error("Missing: "+a.join(", "))}
function msg(e){return e instanceof Error?e.message:String(e)}
function out(x,status=200){return new Response(JSON.stringify(x,null,2),{status,headers:{"content-type":"application/json;charset=UTF-8"}})}


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


async function realTest(env,force=false){
 need(env);
 const errors=[];
 let pageFetches=0;
 for(const s of SOURCES){
  try{
   const home=await get(s.url);
   let candidates=links(home,s.url,s.host)
    .filter(a=>!isGenericPage(a.url,a.text))
    .map(a=>({...a,score:candidateScore(a)}))
    .sort((a,b)=>b.score-a.score);
   const strong=candidates.filter(a=>a.score>0);
   candidates=(strong.length?strong:candidates).slice(0,8);
   for(const a of candidates){
    if(pageFetches>=MAX_PAGE_FETCHES_PER_RUN) break;
    pageFetches++;
    try{
     if(isGenericPage(a.url,a.text)) continue;
     const h=await get(a.url), m=meta(h,a.url);
     if(isGenericPage(a.url,m.title)) continue;
     const body=clean(h.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).slice(0,20000);
     if(!isProjectLike(m,a,body)) continue;
     const fingerprint=clean(m.title).toLowerCase().replace(/[^a-z0-9а-яё]+/gi," ").trim();
     const key="project:"+await hash(fingerprint||a.url);
     if(!force && await env.IDENTITY_KV.get(key)) continue;
     const prepared=await prepareProject(env,h,m,a.url,s.name);
     const result=await telegram(env,prepared);
     if(!force) await env.IDENTITY_KV.put(key,JSON.stringify({
      postId:prepared.postId,title:m.title,titleAz:prepared.titleAz,url:a.url,source:s.name,
      telegraphUrl:prepared.telegraphUrl||"",telegraphPath:prepared.telegraphPath||"",
      telegramMessageIds:messageIds(result),sentAt:new Date().toISOString()
     }));
     const message_id=Array.isArray(result)&&result[0]?result[0].message_id:result.message_id;
     return {ok:true,sent:true,source:s.name,title:m.title,url:a.url,message_id};
    }catch(e){errors.push(s.name+" candidate: "+msg(e))}
   }
  }catch(e){errors.push(s.name+": "+msg(e))}
 }
 return {ok:false,sent:false,reason:"No unseen Identity candidate found",errors:errors.slice(0,10)};
}


function articleScope(html){
 let scope=String(html||"")
  .replace(/<script\b[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[\s\S]*?<\/style>/gi," ")
  .replace(/<nav\b[\s\S]*?<\/nav>/gi," ")
  .replace(/<footer\b[\s\S]*?<\/footer>/gi," ")
  .replace(/<aside\b[\s\S]*?<\/aside>/gi," ");
 const article=scope.match(/<article\b[^>]*>[\s\S]*?<\/article>/i);
 const main=scope.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
 scope=(article&&article[0])||(main&&main[0])||scope;
 return scope;
}

function extractArticleBlocks(html){
 const scope=articleScope(html);
 const blocks=[];
 const re=/<(h1|h2|h3|p|li|blockquote|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi; let m;
 while((m=re.exec(scope))){
  const tagName=m[1].toLowerCase();
  const t=clean(
   m[2]
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<[^>]+>/g," ")
  );
  if(!t) continue;
  if(t.length<12 && !/^h[1-3]$/.test(tagName)) continue;
  if(/cookie|privacy|newsletter|subscribe|sign up|advertis|all rights reserved|share this|related articles|more from/i.test(t)) continue;
  blocks.push({type:tagName,text:t});
 }
 const seen=new Set(), out=[];
 for(const b of blocks){
  const key=b.type+"|"+b.text;
  if(seen.has(key)) continue;
  seen.add(key); out.push(b);
 }
 return out;
}

function extractArticleParagraphs(html){
 return extractArticleBlocks(html)
  .filter(b=>["p","li","blockquote"].includes(b.type))
  .map(b=>b.text);
}

function articleTextForAI(blocks){
 return blocks.map(b=>{
  if(/^h[1-3]$/.test(b.type)) return "\n"+b.text+"\n";
  if(b.type==="li") return "• "+b.text;
  return b.text;
 }).join("\n\n").trim();
}

function hasCaseStudy(paragraphs){
 const text=paragraphs.join("\n\n");
 return paragraphs.length>=3 && text.length>=700;
}

async function aiText(env,prompt,opts={}){
 if(!env.AI) throw Error("Workers AI binding is missing");
 const minLength=opts.minLength??2;
 const validator=typeof opts.validator==="function"?opts.validator:(()=>true);
 const models=[
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/meta/llama-3.1-8b-instruct-fast"
 ];
 const errs=[];
 for(const model of models){
  try{
   const r=await env.AI.run(model,{
    messages:[
     {role:"system",content:"Sən Azərbaycan dilində peşəkar dizayn redaktorusan. Əvvəl mətnin mənasını başa düş, sonra Azərbaycan dilində yenidən ifadə et. Sözbəsöz tərcümə etmə. Cümlələr təbii, sadə, qısa və məntiqli olsun. Oxucu nə baş verdiyini ilk oxunuşda anlamalıdır. Məzmunu və faktları qoru. Brand, studio, agency, layihə və xüsusi adları olduğu kimi saxla."},
     {role:"user",content:prompt}
    ],
    max_tokens:3200,
    temperature:0.12
   });
   const out=cleanAI(r);
   if(out && out.length>=minLength && validator(out)) return out;
   errs.push(model+": invalid or empty response");
  }catch(e){
   errs.push(model+": "+msg(e));
  }
 }
 throw Error("Workers AI failed: "+errs.join(" | "));
}

function looksAzerbaijani(s=""){
 const t=clean(s).toLowerCase();
 return /[əğıöüşç]/i.test(t) || /\b(və|üçün|ilə|bir|bu|olan|olaraq|dizayn|layihə|vizual|kimlik|brend|yaradılıb|istifadə|yeni)\b/i.test(t);
}
function needsTranslation(s=""){
 const t=clean(s).toLowerCase();
 return /\b(the|for|with|and|from|into|its|new|brand|identity|rebrand|studio|takes|becomes|creates|designs|launches|draws|on|of|to|a|an)\b/i.test(t);
}
function cleanAI(r){
 if(!r) return "";
 if(typeof r==="string") return r.trim();
 if(typeof r.response==="string") return r.response.trim();
 if(typeof r.result==="string") return r.result.trim();
 if(r.result&&typeof r.result.response==="string") return r.result.response.trim();
 return "";
}

function sourceLang(text=""){
 const t=String(text);
 if(/[А-Яа-яЁё]/.test(t)) return "ru";
 return "en";
}
function cleanTranslation(r){
 if(!r) return "";
 if(typeof r==="string") return r.trim();
 if(typeof r.translated_text==="string") return r.translated_text.trim();
 if(typeof r.translation==="string") return r.translation.trim();
 if(r.result&&typeof r.result.translated_text==="string") return r.result.translated_text.trim();
 return "";
}
async function translateAz(env,text){
 const src=clean(text||"");
 if(!src) return "";
 if(looksAzerbaijani(src) && !needsTranslation(src)) return normalizeIdentityTerms(src);
 const key="tr:az:"+await hash(src);
 const cached=await env.IDENTITY_KV.get(key);
 if(cached) return cached;

 const errors=[];
 for(let attempt=1;attempt<=2;attempt++){
  try{
   const r=await env.AI.run("@cf/meta/m2m100-1.2b",{
    text:src,
    source_lang:sourceLang(src),
    target_lang:"az"
   });
   const out=normalizeIdentityTerms(cleanTranslation(r));
   if(out && out.length>=2 && looksAzerbaijani(out)){
    await env.IDENTITY_KV.put(key,out,{expirationTtl:60*60*24*90});
    return out;
   }
   errors.push("m2m100 invalid output");
  }catch(e){
   const m=msg(e);
   errors.push("m2m100: "+m);
   if(/4006|daily free allocation|quota/i.test(m)) break;
   if(attempt<2) await new Promise(r=>setTimeout(r,400*attempt));
  }
 }

 // Cheap fallback for temporary model/capacity issues. Do not use it when the account-wide daily quota is exhausted.
 if(!errors.some(x=>/4006|daily free allocation|quota/i.test(x))){
  try{
   const prompt="Mətni tam Azərbaycan dilinə çevir. Heç nə ixtisar etmə, fakt əlavə etmə, xüsusi adları saxla. Yalnız tərcüməni qaytar.\n\n"+src;
   const r=await env.AI.run("@cf/meta/llama-3.2-1b-instruct",{
    messages:[
     {role:"system",content:"Sən dəqiq Azərbaycan dili tərcüməçisisən."},
     {role:"user",content:prompt}
    ],
    max_tokens:2200,
    temperature:0
   });
   const out=normalizeIdentityTerms(cleanAI(r));
   if(out && out.length>=2 && looksAzerbaijani(out)){
    await env.IDENTITY_KV.put(key,out,{expirationTtl:60*60*24*90});
    return out;
   }
   errors.push("llama-3.2-1b invalid output");
  }catch(e){
   errors.push("llama-3.2-1b: "+msg(e));
  }
 }

 throw Error("Azerbaijani translation failed: "+errors.join(" | "));
}
async function makeAzTitle(env,title){
 const source=cleanTitle(title||"");
 if(!source) return "Vizual kimlik layihəsi";
 const translated=await translateAz(env,source);
 return normalizeIdentityTerms(cleanTitle(translated));
}

async function makeAzSummary(env,title,desc,articleText){
 const sourceDesc=clean(desc||"");
 const paras=String(articleText||"").split(/\n\s*\n/).map(clean).filter(x=>x.length>40);
 const picked=[];
 if(sourceDesc) picked.push(sourceDesc);
 for(const p of paras){
  if(picked.length>=2) break;
  if(sourceDesc && p.toLowerCase()===sourceDesc.toLowerCase()) continue;
  picked.push(p);
 }
 if(!picked.length) return "Vizual kimlik layihəsi haqqında məlumat.";
 const translated=[];
 for(const p of picked.slice(0,2)){
  translated.push(await translateAz(env,cut(p,900)));
 }
 return translated.join("\n\n");
}

async function translateFullCaseStudy(env,paragraphs){
 const translated=[];
 for(const p of paragraphs){
  const src=clean(p);
  if(!src) continue;
  // Keep every paragraph; split only when a paragraph is unusually long.
  if(src.length<=1400){
   translated.push(await translateAz(env,src));
  }else{
   const sentences=src.match(/[^.!?]+[.!?]?/g)||[src];
   let cur="";
   for(const s of sentences){
    if((cur+" "+s).length>1200 && cur){
     translated.push(await translateAz(env,cur.trim()));
     cur=s;
    }else cur+=(cur?" ":"")+s;
   }
   if(cur) translated.push(await translateAz(env,cur.trim()));
  }
 }
 if(!translated.length) throw Error("Full Azerbaijani case-study translation failed");
 return translated.join("\n\n");
}


function formatProjectDate(raw=""){
 const s=clean(raw);
 if(!s) return "";
 const d=new Date(s);
 if(!Number.isNaN(d.getTime())){
  const dd=String(d.getUTCDate()).padStart(2,"0");
  const mm=String(d.getUTCMonth()+1).padStart(2,"0");
  return dd+"."+mm+"."+d.getUTCFullYear();
 }
 const m=s.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/);
 if(m) return String(m[1]).padStart(2,"0")+"."+String(m[2]).padStart(2,"0")+"."+m[3];
 return "";
}

function extractAgencyCandidatesFromHtml(html,title=""){
 const scope=articleScope(html);
 const plain=clean(scope);
 const combined=clean((title||"")+"\n"+plain);
 const found=[];

 const add=v=>{
  const a=clean(v||"")
   .replace(/^the\s+/i,"")
   .replace(/[“”"'.,;:]+$/g,"")
   .trim();
  if(!a||a.length<2||a.length>90) return;
  if(/https?:\/\/|www\.|\.com\b|\/articles\//i.test(a)) return;
  if(/^(has been|have been|was|were|is|are|been|enlisted|commissioned|appointed|selected|chosen|to bring|to create|to develop)$/i.test(a)) return;
  if(/\b(It'?s Nice That|Creative Boom|World Brand Design Society|The Brand Identity)\b/i.test(a)) return;
  found.push(a);
 };

 let m;

 // Strongest: studio/agency name explicitly present in title or visible article text.
 const studioNameRe=/\b([A-Z][A-Za-z0-9&.'’+\-]*(?:\s+[A-Z][A-Za-z0-9&.'’+\-]*){0,4}\s+(?:Studio|Studios|Design|Agency|Collective|Partners|Branding))\b/g;
 while((m=studioNameRe.exec(combined))) add(m[1]);

 // Also support names beginning with Studio/Design, e.g. "Studio Tyrrell".
 const prefixStudioRe=/\b((?:Studio|Studios|Design|Agency)\s+[A-Z][A-Za-z0-9&.'’+\-]*(?:\s+[A-Z][A-Za-z0-9&.'’+\-]*){0,3})\b/g;
 while((m=prefixStudioRe.exec(combined))) add(m[1]);

 // Attribution phrases in visible text.
 const byRe=/(?:designed|created|developed|crafted|rebranded|devised|produced|built)\s+(?:by|with|in collaboration with)\s+([A-Z][A-Za-z0-9&.'’+\- ]{1,80})/gi;
 while((m=byRe.exec(combined))) add(m[1]);

 // Credits in visible text.
 const creditRe=/(?:Agency|Studio|Design Studio|Branding Agency|Creative Agency|Design Agency|Design|Branding|Identity|Visual Identity|Art Direction|Creative Direction)\s*[:–—-]\s*([A-Z][A-Za-z0-9&.'’+\- ]{1,80})/gi;
 while((m=creditRe.exec(combined))) add(m[1]);

 return [...new Set(found)];
}

function agencyEvidenceSnippets(articleText=""){
 const text=clean(articleText);
 const sentences=text.match(/[^.!?]+[.!?]?/g)||[];
 return sentences
  .filter(s=>/\b(studio|agency|design studio|branding agency|creative agency|designed by|created by|developed by|commissioned|enlisted|appointed|teamed up with|teams up with|collaboration|worked with)\b/i.test(s))
  .slice(0,30);
}

function scoreAgencyCandidate(name,articleText=""){
 const n=clean(name);
 const t=clean(articleText);
 let score=0;
 if(/https?:\/\/|www\.|\.(com|co\.uk|net|org|io)\b/i.test(n)) score-=20;
 if(/\b(Studio|Studios|Design|Agency|Collective|Partners|Branding)\b/i.test(n)) score+=8;
 if(/^(Studio|Studios|Design|Agency)\b/i.test(n)) score+=4;
 if(t.toLowerCase().includes(n.toLowerCase())) score+=3;
 const ev=agencyEvidenceSnippets(t).join(" ");
 if(ev.toLowerCase().includes(n.toLowerCase())) score+=5;
 if(n.split(/\s+/).length<=4) score+=1;
 return score;
}
function extractDeterministicCredits(html,articleText,title=""){
 const text=clean(articleText||"");
 const candidates=extractAgencyCandidatesFromHtml(html,title);

 const addAgency=v=>{
  const a=clean(v||"")
   .replace(/^the\s+/i,"")
   .replace(/[“”"'.,;:]+$/g,"")
   .trim();
  if(!a||a.length<2||a.length>90) return;
  if(/^(has been|have been|was|were|is|are|been|enlisted|commissioned|brought|tasked|appointed|selected|chosen|to bring|to create|to develop)/i.test(a)) return;
  if(/\b(It'?s Nice That|Creative Boom|World Brand Design Society|The Brand Identity)\b/i.test(a)) return;
  candidates.push(a);
 };

 const patterns=[
  /\b([A-Z][A-Za-z0-9&.'’+\- ]{1,70}\b(?:Studio|Studios|Design|Agency|Collective|Partners|Branding))\s+(?:has|have|was|were|is|are)\s+(?:been\s+)?(?:enlisted|commissioned|appointed|brought in|tasked|selected|chosen)\b/i,
  /\b(?:designed|created|developed|crafted|built|rebranded|branding|identity)\s+(?:by|with|in collaboration with)\s+([A-Z][A-Za-z0-9&.'’+\- ]{1,80})/i,
  /\b(?:agency|studio|design studio|branding agency|creative agency|design agency)\s*[:–—-]\s*([A-Z][^\n|•]{1,80})/i,
  /\b(?:agentlik|studiya|dizayn studiyası)\s*[:–—-]\s*([^\n|•]{2,80})/i,
  /\b(?:агентство|студия|дизайн-студия)\s*[:–—-]\s*([^\n|•]{2,80})/i
 ];
 for(const re of patterns){
  const m=text.match(re);
  if(m) addAgency(m[1]);
 }

 // Extra pattern for sentences such as "The new look has been devised by Nomad".
 const devised=text.match(/\b(?:devised|made|produced|developed|created)\s+by\s+([A-Z][A-Za-z0-9&.'’+\- ]{1,80})/i);
 if(devised) addAgency(devised[1]);

 let agency="";
 if(candidates.length){
  const uniq=[...new Set(candidates)];
  uniq.sort((a,b)=>scoreAgencyCandidate(b,text)-scoreAgencyCandidate(a,text) || a.length-b.length);
  agency=uniq[0];
 }

 const datePatterns=[
  /\bDate\s*[:–—-]?\s*([0-3]?\d\s+[A-Za-z]+\s+(?:19|20)\d{2})/i,
  /(?:project date|launch date|launched|unveiled|released|introduced|created|completed)\s*(?:on|:|–|—|-)?\s*([0-3]?\d\s+[A-Za-z]+\s+(?:19|20)\d{2}|[A-Za-z]+\s+[0-3]?\d,?\s+(?:19|20)\d{2}|(?:19|20)\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})/i,
  /(?:yaranma tarixi|layihə tarixi|təqdim edildi|istifadəyə verildi)\s*[:–—-]?\s*([0-3]?\d[.\/-][01]?\d[.\/-](?:19|20)\d{2})/i,
  /(?:дата проекта|запущено|представлено)\s*[:–—-]?\s*([0-3]?\d[.\/-][01]?\d[.\/-](?:19|20)\d{2})/i
 ];
 let projectDate="";
 for(const re of datePatterns){
  const m=text.match(re);
  if(m){
   projectDate=formatProjectDate(m[1]);
   if(projectDate) break;
  }
 }
 return {agency,projectDate};
}

function extractArticleDate(html,published=""){
 const direct=formatProjectDate(published);
 if(direct) return direct;

 const scope=articleScope(html);
 const text=clean(scope);
 const patterns=[
  /\b(?:Date|Published|Posted|Publication date)\s*[:–—-]?\s*([0-3]?\d\s+[A-Za-z]+\s+(?:19|20)\d{2})/i,
  /\b(?:Date|Published|Posted|Publication date)\s*[:–—-]?\s*([A-Za-z]+\s+[0-3]?\d,?\s+(?:19|20)\d{2})/i,
  /\b(?:Date|Published|Posted|Publication date)\s*[:–—-]?\s*((?:19|20)\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})/i
 ];
 for(const re of patterns){
  const m=text.match(re);
  if(m){
   const d=formatProjectDate(m[1]);
   if(d) return d;
  }
 }
 const time=pick(scope,/<time[^>]*datetime=["']([^"']+)["']/i);
 return formatProjectDate(time);
}

async function extractProjectMeta(env,{title,sourceName,published,articleText,html}){
 const deterministic=extractDeterministicCredits(html,articleText,title);
 const articleDate=extractArticleDate(html,published);
 const agency=deterministic.agency||"";
 let projectDate=deterministic.projectDate||"";
 let projectDateLabel=projectDate?"Yaranma tarixi":"";
 if(!projectDate && articleDate){
  projectDate=articleDate;
  projectDateLabel="Məqalə tarixi";
 }
 return {agency,projectDate,projectDateLabel};
}

async function getTelegraphToken(env){
 let token=await env.IDENTITY_KV.get("telegraph:access_token");
 if(token) return token;
 const body=new URLSearchParams({
  short_name:"UnitedIdentity",
  author_name:"United Identity"
 });
 const r=await fetch("https://api.telegra.ph/createAccount",{method:"POST",body});
 const d=await r.json();
 if(!d.ok||!d.result||!d.result.access_token) throw Error("Telegraph account: "+JSON.stringify(d));
 token=d.result.access_token;
 await env.IDENTITY_KV.put("telegraph:access_token",token);
 return token;
}

async function createTelegraphPage(env,{title,translatedText,images,sourceUrl,sourceName,agency,projectDate,projectDateLabel,postId}){
 const token=await getTelegraphToken(env);
 const paragraphs=translatedText.split(/\n\s*\n/).map(clean).filter(Boolean);
 const imgs=dedupeImageUrls((images||[]).filter(u=>/^https?:\/\//i.test(u)));
 const nodes=[];
 if(postId) nodes.push({tag:"p",children:[{tag:"strong",children:["ID: "]},postId]});
 if(agency) nodes.push({tag:"p",children:[{tag:"strong",children:["Agentlik: "]},agency]});
 if(projectDate) nodes.push({tag:"p",children:[{tag:"strong",children:[(projectDateLabel||"Yaranma tarixi")+": "]},projectDate]});
 if(postId||agency||projectDate) nodes.push({tag:"hr"});

 // Article-style layout: text and visuals alternate naturally.
 let imageIndex=0;
 for(let i=0;i<paragraphs.length;i++){
  nodes.push({tag:"p",children:[paragraphs[i]]});
  const shouldInsert=
   imgs.length>0 &&
   imageIndex<imgs.length &&
   (i===0 || (i+1)%2===0);
  if(shouldInsert){
   nodes.push({tag:"figure",children:[
    {tag:"img",attrs:{src:imgs[imageIndex++]}}
   ]});
  }
 }
 while(imageIndex<imgs.length){
  nodes.push({tag:"figure",children:[
   {tag:"img",attrs:{src:imgs[imageIndex++]}}
  ]});
 }

 nodes.push({tag:"hr"});
 nodes.push({tag:"p",children:[
  {tag:"a",attrs:{href:sourceUrl},children:["Mənbə: "+sourceName]}
 ]});

 let content=JSON.stringify(nodes);
 if(new TextEncoder().encode(content).length>63000){
  // Telegraph has a content-size limit. Keep the full text first, then as many project images as fit.
  const essential=nodes.filter(n=>n.tag!=="figure");
  const figures=nodes.filter(n=>n.tag==="figure");
  const fitted=[...essential];
  for(const fig of figures){
   const test=JSON.stringify([...fitted,fig]);
   if(new TextEncoder().encode(test).length>63000) break;
   fitted.push(fig);
  }
  content=JSON.stringify(fitted);
 }

 const body=new URLSearchParams({
  access_token:token,
  title:cut(cleanTitle(title),250),
  author_name:"United Identity",
  content,
  return_content:"false"
 });
 const r=await fetch("https://api.telegra.ph/createPage",{method:"POST",body});
 const d=await r.json();
 if(!d.ok||!d.result||!d.result.url) throw Error("Telegraph createPage: "+JSON.stringify(d));
 return {url:d.result.url,path:d.result.path||""};
}


async function selfTest(env){
 need(env);
 if(!env.AI) throw Error("Workers AI binding is missing");
 const sampleTitle=await translateAz(env,"A new visual identity for a city restaurant");
 const sampleBody=await translateAz(env,"A design studio created a new visual identity for a restaurant using bold typography and a flexible graphic system.");
 const ok=looksAzerbaijani(sampleTitle)&&looksAzerbaijani(sampleBody);
 return {ok,engine:"m2m100-1.2b",title:sampleTitle,summary:sampleBody,checkedAt:new Date().toISOString()};
}

async function prepareProject(env,html,m,url,source){
 if(!env.AI) throw Error("Workers AI binding is missing; refusing to publish untranslated content");
 const postId=await makePostId(url,m.title||"");
 const blocks=extractArticleBlocks(html);
 const paragraphs=blocks.filter(b=>["p","li","blockquote"].includes(b.type)).map(b=>b.text);
 const articleText=articleTextForAI(blocks);
 const titleAz=await makeAzTitle(env,m.title);
 const descAz=await makeAzSummary(env,titleAz,m.desc,articleText);
 const projectMeta=await extractProjectMeta(env,{
  title:m.title,
  sourceName:source,
  published:m.published||"",
  articleText,
  html
 });
 let telegraphUrl="";
 let telegraphPath="";
 if(hasCaseStudy(paragraphs)){
  const translatedText=await translateFullCaseStudy(env,paragraphs);
  const page=await createTelegraphPage(env,{
   title:titleAz,
   translatedText,
   images:m.images||[],
   sourceUrl:url,
   sourceName:source,
   agency:projectMeta.agency,
   projectDate:projectMeta.projectDate,
   projectDateLabel:projectMeta.projectDateLabel,
   postId
  });
  telegraphUrl=page.url;
  telegraphPath=page.path||"";
 }
 return {...m,postId,titleAz,desc:normalizeIdentityTerms(descAz),url,source,telegraphUrl,telegraphPath,agency:projectMeta.agency,projectDate:projectMeta.projectDate,projectDateLabel:projectMeta.projectDateLabel};
}


const AZ_REPAIR_IDS=[
 "UID-8EB391E572",
 "UID-03C05725EC",
 "UID-1EF4AC1E96",
 "UID-F7AFDE98C0",
 "UID-C9A18D7DDE"
];

async function repairAzPosts(env){
 need(env);
 if(!env.AI) throw Error("Workers AI binding is missing");
 const marker="repair:az:2026-10-05:v3-media";
 const done=await env.IDENTITY_KV.get(marker);
 if(done) return {ok:true,alreadyDone:true,details:JSON.parse(done)};

 const wanted=new Set(AZ_REPAIR_IDS);
 const records={};
 let cursor;
 do{
  const page=await env.IDENTITY_KV.list({prefix:"seen:",limit:1000,cursor});
  for(const k of page.keys){
   try{
    const raw=await env.IDENTITY_KV.get(k.name);
    if(!raw) continue;
    const j=JSON.parse(raw);
    if(j&&wanted.has(j.postId)) records[j.postId]={...j,kvKey:k.name};
   }catch{}
  }
  cursor=page.list_complete?undefined:page.cursor;
 }while(cursor && Object.keys(records).length<wanted.size);

 const updatesResp=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/getUpdates?limit=100&timeout=0");
 const updatesJson=await updatesResp.json();
 if(!updatesJson.ok) throw Error("Telegram getUpdates: "+JSON.stringify(updatesJson));

 const messages={
  "UID-03C05725EC":{chat_id:env.TELEGRAM_CHAT_ID,message_id:49},
  "UID-C9A18D7DDE":{chat_id:env.TELEGRAM_CHAT_ID,message_id:48},
  "UID-F7AFDE98C0":{chat_id:env.TELEGRAM_CHAT_ID,message_id:50}
 };
 // Newer records always carry exact Telegram message IDs. Prefer those over legacy fallbacks.
 for(const [id,rec] of Object.entries(records)){
  const mid=Array.isArray(rec.telegramMessageIds)&&rec.telegramMessageIds.length?rec.telegramMessageIds[0]:null;
  if(Number.isFinite(mid)) messages[id]={chat_id:env.TELEGRAM_CHAT_ID,message_id:mid};
 }
 for(const u of updatesJson.result||[]){
  const m=u.channel_post||u.edited_channel_post;
  if(!m) continue;
  const text=(m.caption||m.text||"");
  for(const id of AZ_REPAIR_IDS){
   if(text.includes(id)) messages[id]={chat_id:m.chat.id,message_id:m.message_id};
  }
 }

 const result={};
 let success=0;
 for(const id of AZ_REPAIR_IDS){
  const rec=records[id];
  const msgRef=messages[id];
  if(!rec){result[id]={ok:false,reason:"record_not_found_in_kv"};continue}
  if(!msgRef){result[id]={ok:false,reason:"message_not_found_in_recent_bot_updates",url:rec.url};continue}
  try{
   const html=await get(rec.url);
   const m=meta(html,rec.url);
   const prepared=await prepareProject(env,html,m,rec.url,rec.source||"Mənbə");
   prepared.postId=id;
   const caption=buildCaption(prepared);
   const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/editMessageCaption",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     chat_id:msgRef.chat_id,
     message_id:msgRef.message_id,
     caption,
     parse_mode:"HTML"
    })
   });
   const d=await r.json();
   if(!d.ok) throw Error(JSON.stringify(d));
   const updatedRecord={
    ...rec,
    titleAz:prepared.titleAz,
    telegraphUrl:prepared.telegraphUrl||"",
    telegraphPath:prepared.telegraphPath||"",
    telegramMessageIds:[msgRef.message_id],
    repairedAt:new Date().toISOString()
   };
   await env.IDENTITY_KV.put(rec.kvKey,JSON.stringify(updatedRecord));
   result[id]={ok:true,message_id:msgRef.message_id,url:rec.url,telegraphUrl:prepared.telegraphUrl||""};
   success++;
  }catch(e){
   result[id]={ok:false,reason:msg(e),url:rec.url};
  }
 }

 const pending=AZ_REPAIR_IDS.filter(id=>!result[id]||!result[id].ok);
 const summary={success,total:AZ_REPAIR_IDS.length,pending,result};
 if(success===AZ_REPAIR_IDS.length){
  await env.IDENTITY_KV.put(marker,JSON.stringify(summary));
 }
 return {ok:success>0,complete:success===AZ_REPAIR_IDS.length,...summary};
}
