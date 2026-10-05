// Content/visual gate. Expensive translation must happen only after this gate passes.
export class ContentController {
  constructor(env){this.env=env}
  async validate(item){
    const errors=[];
    if(!item?.url) errors.push("missing_url");
    if(!item?.title || item.title.trim().length<5) errors.push("missing_title");
    if(!Array.isArray(item?.images) || !item.images.some(x=>/^https?:\/\//i.test(x))) errors.push("missing_media");
    if(!this.isIdentity(item)) errors.push("not_identity");
    if(item?.url && await this.isDuplicate(item.url)) errors.push("duplicate");
    return {ok:errors.length===0,errors};
  }
  isIdentity(item){
    const t=((item.title||"")+" "+(item.description||"")+" "+(item.text||"")).toLowerCase();
    return ["brand identity","visual identity","identity system","branding","rebrand","айдентика","визуальная идентичность","брендинг"].some(x=>t.includes(x));
  }
  async isDuplicate(url){
    const data=new TextEncoder().encode(url);
    const digest=await crypto.subtle.digest("SHA-256",data);
    const key=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
    return !!(await this.env.IDENTITY_KV.get("seen:"+key));
  }
}
