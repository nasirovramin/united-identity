// Resilient public-web reader. It does not bypass authentication, CAPTCHAs or access controls.
export class PublicWebReader {
 constructor(opts={}){this.timeoutMs=opts.timeoutMs||12000;this.retries=opts.retries??1}
 async read(url){
  const attempts=[
   {headers:{"User-Agent":"Mozilla/5.0 (compatible; UnitedIdentityBot/2.1; +public-content-reader)","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Accept-Language":"en-US,en;q=0.8"}},
   {headers:{"User-Agent":"UnitedIdentityBot/2.1","Accept":"text/html,application/xhtml+xml"}}
  ];
  let last;
  for(const init of attempts){
   try{
    const r=await this.fetchWithTimeout(url,init);
    if([401,403,429].includes(r.status)) {last=Error("access_limited_HTTP_"+r.status); continue}
    if(!r.ok){last=Error("HTTP_"+r.status);continue}
    const type=(r.headers.get("content-type")||"").toLowerCase();
    const text=await r.text();
    if(text.length<100){last=Error("response_too_small");continue}
    if(this.looksLikeChallenge(text)){last=Error("challenge_or_consent_page");continue}
    return {ok:true,url:r.url||url,text,type,method:"public_html"};
   }catch(e){last=e}
  }
  return {ok:false,url,error:String(last?.message||last||"read_failed")};
 }
 async fetchWithTimeout(url,init={}){
  const ac=new AbortController(); const timer=setTimeout(()=>ac.abort(),this.timeoutMs);
  try{return await fetch(url,{...init,redirect:"follow",signal:ac.signal})}
  finally{clearTimeout(timer)}
 }
 looksLikeChallenge(text=""){
  const s=text.slice(0,12000).toLowerCase();
  return ["captcha","verify you are human","checking your browser","access denied","enable javascript and cookies to continue"].some(x=>s.includes(x));
 }
}
