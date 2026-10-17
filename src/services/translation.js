const MODELS=[
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.2-1b-instruct"
];

export class AzerbaijaniTranslator {
  constructor(env){this.env=env}

  async translate(text,{full=false}={}){
    const src=String(text||"").trim();
    if(!src) return "";
    if(!this.env?.AI) throw new Error("Workers AI binding missing");

    const key="translation:tbi:"+await digest(src);
    const cached=await this.env.IDENTITY_KV?.get(key);
    if(cached) return cached;

    const prompt=[
      "Aşağıdakı mətni Azərbaycan dilinə çevir.",
      "Mətnin mənasını əvvəl başa düş, sonra təbii və aydın Azərbaycan dili ilə yaz.",
      "Elmi və ağır akademik cümlələrdən istifadə etmə.",
      "Məzmunu qısaltma, fakt əlavə etmə və heç bir məlumatı itirmə.",
      "Brand, Visual Identity, Identity, AI, UI, UX, Digital, Motion, Logo, Wordmark, typography, font adları, şirkət/studio/şəxs adları və digər beynəlxalq ENG terminlərini orijinal formada saxla.",
      "Sitatların mənasını qoru.",
      full?"Bu tam məqalə hissəsidir; bütün məlumat qorunmalıdır.":"Bu Telegram post mətni üçündür; cümlələr rahat oxunmalıdır.",
      "Yalnız hazır Azərbaycan dilində mətni qaytar.",
      "",
      src
    ].join("\n");

    const errors=[];
    for(const model of MODELS){
      try{
        const result=await this.env.AI.run(model,{
          messages:[
            {role:"system",content:"Sən Azərbaycan dilində dizayn və vizual kommunikasiya mətnlərini peşəkar, sadə və təbii şəkildə tərcümə edən redaktorsan."},
            {role:"user",content:prompt}
          ],
          max_tokens:full?3500:1200,
          temperature:0.1
        });
        const out=cleanAI(result);
        if(out && out.length>=Math.min(10,src.length)){
          if(this.env.IDENTITY_KV) await this.env.IDENTITY_KV.put(key,out,{expirationTtl:60*60*24*90});
          return out;
        }
        errors.push(model+": empty");
      }catch(e){errors.push(model+": "+String(e?.message||e))}
    }
    throw new Error("Azerbaijani translation failed: "+errors.join(" | "));
  }
}

function cleanAI(r){
  if(!r) return "";
  if(typeof r==="string") return r.trim();
  if(typeof r.response==="string") return r.response.trim();
  if(r.result&&typeof r.result.response==="string") return r.result.response.trim();
  return "";
}

async function digest(s){
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
