export class TranslationCache {
 constructor(env){this.env=env}
 async key(kind,text){
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(kind+"|"+String(text||"")));
  return "translation:"+kind+":"+[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
 }
 async get(kind,text){const k=await this.key(kind,text);return this.env.IDENTITY_KV.get(k)}
 async put(kind,text,value){const k=await this.key(kind,text);await this.env.IDENTITY_KV.put(k,String(value||""),{expirationTtl:60*60*24*90});return value}
 async remember(kind,text,producer){
  const old=await this.get(kind,text); if(old) return {value:old,cached:true};
  const value=await producer(); await this.put(kind,text,value); return {value,cached:false};
 }
}
