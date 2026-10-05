// Technical control: rotation, request discipline, retries and source isolation.
export class TechnicalController {
  constructor(env, sources, opts={}) {
    this.env=env; this.sources=sources;
    this.timeoutMs=opts.timeoutMs||12000;
    this.cooldownSeconds=opts.cooldownSeconds||1800;
  }
  async orderedSources(){
    const raw=await this.env.IDENTITY_KV.get("control:source-cursor");
    const cursor=Number(raw||0)%Math.max(this.sources.length,1);
    return [...this.sources.slice(cursor),...this.sources.slice(0,cursor)];
  }
  async advance(source){
    const i=this.sources.findIndex(s=>s.id===source.id);
    await this.env.IDENTITY_KV.put("control:source-cursor",String((i+1)%this.sources.length));
  }
  async isCooling(source){
    return !!(await this.env.IDENTITY_KV.get("control:cooldown:"+source.id));
  }
  async markFailure(source,error){
    const key="control:cooldown:"+source.id;
    await this.env.IDENTITY_KV.put(key,JSON.stringify({at:new Date().toISOString(),error:String(error)}),{expirationTtl:this.cooldownSeconds});
  }
  async fetch(url){
    const ac=new AbortController(); const timer=setTimeout(()=>ac.abort(),this.timeoutMs);
    try{
      const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; UnitedIdentityBot/2.0)","Accept":"text/html,application/xhtml+xml"},redirect:"follow",signal:ac.signal});
      if(!r.ok) throw Error("HTTP "+r.status);
      return await r.text();
    } finally { clearTimeout(timer); }
  }
}
