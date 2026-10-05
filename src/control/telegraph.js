// Telegraph publication guard: never expose an "Ətraflı" link before it is reachable.
export async function verifyTelegraph(url){
  if(!/^https:\/\/telegra\.ph\//i.test(url||"")) return {ok:false,reason:"invalid_telegraph_url"};
  try{
    const r=await fetch(url,{method:"GET",redirect:"follow"});
    if(!r.ok) return {ok:false,reason:"HTTP "+r.status};
    const body=await r.text();
    if(body.length<300 || !/<article|tl_article|page_content/i.test(body)) return {ok:false,reason:"empty_or_invalid_page"};
    return {ok:true};
  }catch(e){return {ok:false,reason:String(e?.message||e)}}
}
