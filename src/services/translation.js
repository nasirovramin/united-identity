const MODELS=[
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.2-1b-instruct"
];

export class AzerbaijaniTranslator {
  constructor(env){this.env=env}

  async translateBlocks(blocks=[]){
    const input=(blocks||[]).map((x,i)=>({i,text:String(x||"").trim()})).filter(x=>x.text);
    if(!input.length) return [];

    const results=new Array(blocks.length).fill("");
    const groups=[];
    let group=[],chars=0;
    for(const item of input){
      if(group.length && chars+item.text.length>3500){
        groups.push(group); group=[]; chars=0;
      }
      group.push(item); chars+=item.text.length;
    }
    if(group.length) groups.push(group);

    for(const g of groups){
      const joined=g.map(x=>"[[BLOCK_"+x.i+"]]\n"+x.text).join("\n\n");
      const prompt=[
        "Aşağıdakı blokları tam Azərbaycan dilinə çevir.",
        "Hər [[BLOCK_N]] markerini olduğu kimi saxla və həmin blokun tərcüməsini onun altında yaz.",
        "Heç bir blok itirilməsin, qısaldılmasın və başqa blokla birləşdirilməsin.",
        "Mətn sadə, təbii və rahat Azərbaycan dilində olsun; ağır elmi üslubdan istifadə etmə.",
        "AI, UI, UX, Visual Identity, Identity, Digital, Motion, Logo, Wordmark, typography, font adları və bütün xüsusi adları orijinal formada saxla.",
        "Yalnız markerlər və tərcümələri qaytar.",
        "",
        joined
      ].join("\n");

      const translated=await this.translate(prompt,{full:true,rawInstruction:true});
      const re=/\[\[BLOCK_(\d+)\]\]\s*([\s\S]*?)(?=\n\s*\[\[BLOCK_\d+\]\]|$)/g;
      let m,found=0;
      while((m=re.exec(translated))){
        const i=Number(m[1]);
        if(Number.isInteger(i) && i>=0 && i<results.length){
          results[i]=m[2].trim();
          found++;
        }
      }
      if(found!==g.length){
        // Some smaller models occasionally rewrite or drop markers.
        // Fall back to reliable per-block translation for this group.
        for(const item of g){
          results[item.i]=await this.translate(item.text,{full:true});
        }
      }
    }
    return results;
  }

  async translate(text,{full=false,rawInstruction=false}={}){
    const src=String(text||"").trim();
    if(!src) return "";
    if(!this.env?.AI) throw new Error("Workers AI binding missing");

    const key="translation:tbi:"+await digest(src);
    const cached=await this.env.IDENTITY_KV?.get(key);
    if(cached) return cached;

    const prompt=rawInstruction?src:[
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

    const finalPrompt=Array.isArray(prompt)?prompt.join("\n"):prompt;
    const errors=[];
    for(const model of MODELS){
      try{
        const result=await this.env.AI.run(model,{
          messages:[
            {role:"system",content:"Sən Azərbaycan dilində dizayn və vizual kommunikasiya mətnlərini peşəkar, sadə və təbii şəkildə tərcümə edən redaktorsan."},
            {role:"user",content:finalPrompt}
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
