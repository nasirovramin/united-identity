// Content/visual gate. Expensive translation must happen only after this gate passes.
export class ContentController {
  constructor(env){this.env=env}
  async validate(item){
    const errors=[];
    if(!item?.url) errors.push("missing_url");
    if(!item?.title || item.title.trim().length<5) errors.push("missing_title");
    if(!Array.isArray(item?.images) || !item.images.some(x=>/^https?:\/\//i.test(x))) errors.push("missing_media");
    if(!this.isIdentity(item)) errors.push("not_identity");
    if(await this.isDuplicate(item)) errors.push("duplicate");
    return {ok:errors.length===0,errors};
  }
  isIdentity(item){
    const t=((item.title||"")+" "+(item.description||"")+" "+(item.text||"")).toLowerCase();
    return ["brand identity","visual identity","identity system","branding","rebrand","айдентика","визуальная идентичность","брендинг"].some(x=>t.includes(x));
  }
  normalize(s=""){
    return String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
      .replace(/https?:\/\/\S+/g," ").replace(/[^a-z0-9а-яəğıöşüç\s]/gi," ")
      .replace(/\s+/g," ").trim();
  }
  async digest(s){
    const data=new TextEncoder().encode(s);
    const digest=await crypto.subtle.digest("SHA-256",data);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  async duplicateKeys(item){
    const keys=[];
    if(item?.url) keys.push("seen:"+await this.digest(item.url));
    const title=this.normalize(item?.title||"");
    const agency=this.normalize(item?.agency||"");
    // Stable project identity catches the same project arriving from another source/URL.
    if(title.length>=5) keys.push("project:"+await this.digest(title+"|"+agency));
    const image=(item?.images||[]).find(x=>/^https?:\/\//i.test(x));
    if(image) keys.push("image:"+await this.digest(image.replace(/[?#].*$/,"")));
    return [...new Set(keys)];
  }
  async isDuplicate(item){
    for(const key of await this.duplicateKeys(item)){
      if(await this.env.IDENTITY_KV.get(key)) return true;
    }
    return false;
  }
  async markPublished(item,record={}){
    const value=JSON.stringify({...record,at:new Date().toISOString()});
    for(const key of await this.duplicateKeys(item)) await this.env.IDENTITY_KV.put(key,value);
  }
}
