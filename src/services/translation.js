const MODELS=[
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.2-1b-instruct"
];

const TRANSLATION_CACHE_VERSION="v2-semantic-editor";

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
        "Aşağıdakı məqalə bloklarını Azərbaycan dilinə çevir və eyni anda redaktə et.",
        "ƏVVƏL hər cümlənin nə demək istədiyini anla, SONRA Azərbaycan dilində təbii ifadə et. Sözbəsöz tərcümə etmə.",
        "Oxucu İngilis dili mətnini görmədən fikri asan başa düşməlidir.",
        "İngilis dilindəki idiom, metafora, söz oyunu və qeyri-təbii sintaksisi Azərbaycan dilinə məna baxımından uyğunlaşdır; hərfi qarşılığını yazma.",
        "Uzun və dolaşıq İngilis cümləsini lazım olduqda 2-3 aydın Azərbaycan cümləsinə böl.",
        "Əvəzliklərin kimə/nəyə aid olduğu aydın olsun. 'o', 'bu', 'onlar' kimi sözləri anlaşılmaz buraxma.",
        "Mətn jurnalistik və rahat oxunan olsun; ağır elmi, akademik, süni AI dili və rus/türk kalka ifadələrindən uzaq dur.",
        "Faktları, məna əlaqələrini, sitat sahibini və müəllifin fikrini tam qoru. Heç nə əlavə etmə, qısaltma və şərh etmə.",
        "Sitatları sözbəsöz yox, danışanın nəzərdə tutduğu mənanı qoruyaraq təbii Azərbaycan dilində ver.",
        "AI, UI, UX, Visual Identity, Identity, Digital, Motion, Logo, Wordmark, typography, font adları, brand/studio/şirkət/şəxs adları və beynəlxalq ENG terminlərini orijinal formada saxla.",
        "Azərbaycan dilində mümkün qədər adi söz sırasından istifadə et; tərcümə olduğu hiss olunmamalıdır.",
        "Hər [[BLOCK_N]] markerini olduğu kimi saxla və həmin blokun tərcüməsini onun altında yaz.",
        "Heç bir blok itirilməsin və başqa blokla birləşdirilməsin.",
        "Cavabı verməzdən əvvəl səssiz şəkildə yoxla: cümlə Azərbaycan dilində ilk oxunuşda aydındırmı? Aydın deyilsə, yenidən qur.",
        "Yalnız markerlər və hazır Azərbaycan dilində mətni qaytar.",
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

    const key="translation:tbi:"+TRANSLATION_CACHE_VERSION+":"+await digest(src);
    const cached=await this.env.IDENTITY_KV?.get(key);
    if(cached) return cached;

    const prompt=rawInstruction?src:[
      "Aşağıdakı mətni Azərbaycan dilinə çevir və redaktə et.",
      "ƏVVƏL müəllifin nə demək istədiyini anla, SONRA həmin fikri təbii Azərbaycan dili ilə yaz. Sözbəsöz tərcümə etmə.",
      "Oxucu orijinal İngilis dilini görmədən məzmunu ilk oxunuşda aydın başa düşməlidir.",
      "İngilis dilindəki idiom, metafora, söz oyunu və sintaksisi hərfi çevirmə; mənanı qoruyan təbii Azərbaycan ifadəsi seç.",
      "Uzun və dolaşıq cümlələri lazım olduqda daha qısa və aydın cümlələrə böl.",
      "Əvəzliklərin və əlaqələrin kimə/nəyə aid olduğu aydın olsun.",
      "Jurnalistik, rahat və müasir Azərbaycan dili istifadə et. Ağır elmi/akademik üslub, süni AI cümlələri, rus və türk dilindən kalka ifadələr işlətmə.",
      "Məzmunu qısaltma, fakt əlavə etmə, müəllifin mövqeyini dəyişmə və məlumat itirmə.",
      "Sitatları danışanın niyyətini qoruyaraq təbii Azərbaycan dilində ver; hərfi və anlaşılmaz sitat yaratma.",
      "Brand, Visual Identity, Identity, AI, UI, UX, Digital, Motion, Logo, Wordmark, typography, font adları, şirkət/studio/şəxs adları və digər beynəlxalq ENG terminlərini orijinal formada saxla.",
      full
        ?"Bu tam məqalə hissəsidir: bütün informasiya qorunmalıdır, amma cümlə quruluşu Azərbaycan dilinə uyğunlaşdırıla bilər."
        :"Bu Telegram post mətni/başlığıdır: qısa, aydın və ilk baxışda başa düşülən olmalıdır.",
      "Cavabı verməzdən əvvəl səssiz redaktə et: Azərbaycan dilində qəribə, sözbəsöz və ya anlaşılmaz səslənən hissə qalmasın.",
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
            {role:"system",content:"Sən peşəkar Azərbaycan dili redaktoru və tərcüməçisisən. Dizayn, branding və Visual Identity mövzularını anlayırsan. Sənin işin sözləri çevirmək deyil, müəllifin fikrini tam qoruyaraq onu təbii, aydın, jurnalistik Azərbaycan dilində yenidən ifadə etməkdir. Tərcümə olduğu hiss olunmamalıdır."},
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
