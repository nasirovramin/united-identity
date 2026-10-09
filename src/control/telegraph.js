// Telegraph publication guard: never expose an "Ətraflı" link before the
// page itself and its embedded project media are reachable.
const MEDIA_RE = /<(img|video|iframe)\b[^>]*(?:src|data-src)=["']([^"']+)["']/gi;

async function probeMedia(url,kind){
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    let r;
    try{
      r=await fetch(url,{method:"GET",redirect:"follow",signal:controller.signal,headers:{"User-Agent":"Mozilla/5.0 (compatible; UnitedIdentityBot/1.0)"}});
    }finally{clearTimeout(timer)}
    if(!r.ok) return {ok:false,reason:"HTTP "+r.status};
    const type=(r.headers.get("content-type")||"").toLowerCase();
    // An iframe is an HTML embed, not an image; rejecting text/html here
    // incorrectly marks otherwise valid Telegraph case studies as broken.
    const allowed=kind==="iframe"
      ? /(text\/html|video|image|octet-stream)/.test(type)
      : kind==="video"
        ? /(video|octet-stream)/.test(type)
        : /(image|octet-stream)/.test(type);
    if(type && !allowed) return {ok:false,reason:"invalid_media_type"};
    return {ok:true};
  }catch(e){return {ok:false,reason:String(e?.message||e)}}
}

export async function verifyTelegraph(url){
  if(!/^https:\/\/telegra\.ph\//i.test(url||"")) return {ok:false,reason:"invalid_telegraph_url"};
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    let r;
    try{r=await fetch(url,{method:"GET",redirect:"follow",signal:controller.signal})}
    finally{clearTimeout(timer)}
    if(!r.ok) return {ok:false,reason:"HTTP "+r.status};
    const body=await r.text();
    if(body.length<300 || !/<article|tl_article|page_content/i.test(body)) return {ok:false,reason:"empty_or_invalid_page"};

    const media=[];
    const seen=new Set();
    let m;
    while((m=MEDIA_RE.exec(body))){
      try{
        const u=new URL(m[2],url).toString();
        const kind=m[1].toLowerCase();
        const key=kind+"|"+u;
        if(/^https?:\/\//i.test(u) && !seen.has(key)){
          seen.add(key);
          media.push({url:u,kind});
        }
      }catch{}
    }

    // Validate media using the correct MIME rules for each embed type.
    for(const asset of media){
      const check=await probeMedia(asset.url,asset.kind);
      if(!check.ok) return {ok:false,reason:"broken_media: "+check.reason,asset:asset.url,kind:asset.kind};
    }
    return {ok:true,mediaChecked:media.length};
  }catch(e){return {ok:false,reason:String(e?.message||e)}}
}
