// Telegraph publication guard: never expose an "Ətraflı" link before the
// page itself and its embedded project media are reachable.
const MEDIA_RE = /<(?:img|video|iframe)\b[^>]*(?:src|data-src)=["']([^"']+)["']/gi;

async function probeMedia(url){
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    let r;
    try{
      r=await fetch(url,{method:"GET",redirect:"follow",signal:controller.signal,headers:{"User-Agent":"Mozilla/5.0 (compatible; UnitedIdentityBot/1.0)"}});
    }finally{clearTimeout(timer)}
    if(!r.ok) return {ok:false,reason:"HTTP "+r.status};
    const type=(r.headers.get("content-type")||"").toLowerCase();
    if(type && !/(image|video|octet-stream)/.test(type)) return {ok:false,reason:"invalid_media_type"};
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
    let m;
    while((m=MEDIA_RE.exec(body))){
      try{
        const u=new URL(m[1],url).toString();
        if(/^https?:\/\//i.test(u) && !media.includes(u)) media.push(u);
      }catch{}
    }

    // Validate every media asset actually embedded in the final Telegraph page.
    // A page with a broken/slow project asset must not receive an Ətraflı button.
    for(const asset of media){
      const check=await probeMedia(asset);
      if(!check.ok) return {ok:false,reason:"broken_media: "+check.reason,asset};
    }
    return {ok:true,mediaChecked:media.length};
  }catch(e){return {ok:false,reason:String(e?.message||e)}}
}
