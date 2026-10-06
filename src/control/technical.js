import { PublicWebReader } from "../shared/public-web-reader.js";
// Technical control: rotation, request discipline, retries and source isolation.
export class TechnicalController {
  constructor(env, sources, opts={}) {
    this.env=env; this.sources=sources;
    this.timeoutMs=opts.timeoutMs||12000;
    this.cooldownSeconds=opts.cooldownSeconds||1800;
    this.reader=new PublicWebReader({timeoutMs:this.timeoutMs,retries:1});
  }
  async orderedSources(){
    const raw=await this.env.IDENTITY_KV.get("control:source-cursor");
    const cursor=Number(raw||0)%Math.max(this.sources.length,1);
    return [...this.sources.slice(cursor),...this.sources.slice(0,cursor)];
  }
  async nextAvailableSource(){
    const ordered=await this.orderedSources();
    for(const source of ordered){
      if(!(await this.isCooling(source))) return source;
    }
    return null;
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
    const r=await this.reader.read(url);
    if(!r.ok) throw Error(r.error||"public_web_read_failed");
    return r.text;
  }
}
