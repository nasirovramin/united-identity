const MODELS=[
  "@cf/meta/llama-3.1-8b-instruct-fast"
];

const TRANSLATION_CACHE_VERSION="v5-faithful-repeat-guard";

const KEEP_ENGLISH=[
  "AI","UI","UX","Visual Identity","Identity","Digital","Motion","Logo","Wordmark",
  "typography","font","branding","brand"
];

export class AzerbaijaniTranslator {
  constructor(env){this.env=env}

  async translateBlocks(blocks=[]){
    const source=(blocks||[]).map(x=>String(x||"").trim());
    const results=new Array(source.length).fill("");

    // Translate each editorial paragraph independently. This avoids one paragraph
    // contaminating another and gives the model enough local context to resolve
    // idioms and pronouns without merging article blocks.
    for(let i=0;i<source.length;i++){
      if(!source[i]) continue;
      results[i]=await this.translate(source[i],{
        full:true,
        contextBefore:source[i-1]||"",
        contextAfter:source[i+1]||""
      });
    }
    return results;
  }

  async translate(text,{full=false,contextBefore="",contextAfter=""}={}){
    const src=String(text||"").trim();
    if(!src) return "";
    if(!this.env?.AI) throw new Error("Workers AI binding missing");

    const cachePayload=JSON.stringify({
      v:TRANSLATION_CACHE_VERSION,
      src,
      full:Boolean(full),
      before:String(contextBefore||"").slice(0,1200),
      after:String(contextAfter||"").slice(0,1200)
    });
    const key="translation:tbi:"+TRANSLATION_CACHE_VERSION+":"+await digest(cachePayload);
    const cached=await this.env.IDENTITY_KV?.get(key);
    if(cached){
      const cachedCheck=validateTranslation(src,cached);
      if(cachedCheck.ok) return cached;
    }

    const errors=[];
    for(const model of MODELS){
      // Retry the stronger model once only when the output is structurally or
      // factually suspicious. Normal successful translations use one request.
      const attempts=model===MODELS[0]?2:1;
      for(let attempt=0;attempt<attempts;attempt++){
        try{
          const systemPrompt=buildSystemPrompt({
            full,
            contextBefore,
            contextAfter,
            strict:attempt>0
          });

          const result=await this.env.AI.run(model,{
            messages:[
              {role:"system",content:systemPrompt},
              // Important: user content contains ONLY source copy. Keeping all
              // instructions out of the user message prevents instruction text
              // from leaking into the published translation.
              {role:"user",content:src}
            ],
            max_tokens:full?2600:1000,
            temperature:0.05
          });

          const raw=cleanAI(result);
          const out=extractTranslation(raw);
          const check=validateTranslation(src,out);

          if(check.ok){
            if(this.env.IDENTITY_KV){
              await this.env.IDENTITY_KV.put(key,out,{expirationTtl:60*60*24*90});
            }
            return out;
          }
          errors.push(model+" attempt "+(attempt+1)+": "+check.reason);
        }catch(e){
          errors.push(model+" attempt "+(attempt+1)+": "+String(e?.message||e));
        }
      }
    }

    throw new Error("Azerbaijani translation failed quality checks: "+errors.join(" | "));
  }
}

function buildSystemPrompt({full,contextBefore,contextAfter,strict}){
  const before=String(contextBefore||"").trim();
  const after=String(contextAfter||"").trim();

  const lines=[
    "You are a careful Azerbaijani translator for design, branding, technology and business journalism.",
    "Translate the user's source text faithfully into Azerbaijani.",
    "Return ONLY the final Azerbaijani translation. Do not add labels, notes, explanations or commentary.",
    "",
    "CORE METHOD:",
    "- Translate sentence by sentence and meaning unit by meaning unit.",
    "- Stay as close as possible to the source wording and sentence order, but fix word order and grammar where Azerbaijani requires it.",
    "- DO NOT summarize, compress, simplify away details, merge ideas, or omit repeated information.",
    "- DO NOT add explanations, examples, interpretations, background facts or conclusions that are not explicitly present in the source.",
    "- Every fact, qualifier, comparison, example, attribution, quotation, relationship and nuance in the source must appear in the translation.",
    "- Preserve sentence boundaries whenever possible. Split or join a sentence only when absolutely necessary for clear Azerbaijani, and do not lose any content when doing so.",
    "- If an idiom or metaphor is present, translate its intended meaning clearly, but keep all concrete details from the original. Do not invent a new metaphor.",
    "- Preserve names, brands, studios, people, products, dates, numbers and proper nouns exactly unless Azerbaijani grammar requires a suffix.",
    "- Keep established international design/tech terms where appropriate: "+KEEP_ENGLISH.join(", ")+".",
    "- Quotes must preserve the speaker's exact meaning and all details. Do not polish away awkwardness if that changes content.",
    "- Never introduce Azerbaijan/Azerbaijani as article content unless the source itself mentions it.",
    "- Do not use fake phonetic borrowings when a normal Azerbaijani word exists.",
    "",
    "QUALITY TARGET:",
    "- The translation should feel clear and grammatical in Azerbaijani, but it must remain maximally faithful to the source.",
    "- Faithfulness is more important than elegance. Clarity may change word order, not content.",
    "",
    "Domain guide:",
    "- assurance in financial/audit context = independent verification / assurance work, not insurance.",
    "- compliance = meeting regulatory/legal requirements.",
    "- privacy hedge = a dense hedge/shrub planted to create privacy.",
    "- behind the scenes / behind the hedge may be deliberate wordplay; preserve both the hidden-work meaning and hedge reference.",
    "- the grind = repetitive, time-consuming routine work.",
    "",
    full
      ?"This is a full article paragraph. Translate the complete paragraph with nothing removed and nothing added."
      :"This is a headline or short Telegram text. Translate it completely; do not shorten it."
  ];

  if(before){
    lines.push(
      "",
      "Previous paragraph for context only. Use it ONLY to resolve references; DO NOT translate, repeat, summarize or import facts from it:",
      before.slice(0,1200)
    );
  }
  if(after){
    lines.push(
      "",
      "Next paragraph for context only. Use it ONLY to resolve references; DO NOT translate, repeat, summarize or import facts from it:",
      after.slice(0,1200)
    );
  }
  if(strict){
    lines.push(
      "",
      "STRICT RETRY: The previous output failed integrity checks. Re-translate more literally and ensure that no source detail is missing and no new fact is added."
    );
  }

  return lines.join("\n");
}

function extractTranslation(raw=""){
  const s=String(raw||"").trim();
  let out=s;

  // Defensive cleanup for models that add a harmless label despite instructions.
  out=out
    .replace(/^\s*Aşağıdakı\s+mətni\s+Azərbaycan\s+dilinə\s+(?:çevir(?:\s+və\s+redaktə\s+et)?|tərcümə\s+et)\s*:\s*/i,"")
    .replace(/^\s*(?:Tərcümə|Azərbaycan dilində|Cavab|Hazır mətn)\s*:\s*/i,"")
    .replace(/^["“](.*)["”]$/s,"$1")
    .trim();

  return out;
}

function validateTranslation(src,out){
  if(!out||out.length<Math.min(20,Math.max(8,src.length*0.15))){
    return {ok:false,reason:"output_too_short"};
  }

  // Reject suspiciously compressed outputs. Azerbaijani length can differ from
  // English, so keep the threshold conservative while still blocking summaries.
  if(src.length>=120 && out.length<src.length*0.48){
    return {ok:false,reason:"possible_content_omission"};
  }

  // Every explicit number/date amount in the source must survive translation.
  const sourceNumbers=[...String(src).matchAll(/\b\d+(?:[.,]\d+)?%?\b/g)].map(m=>m[0]);
  for(const n of sourceNumbers){
    if(!String(out).includes(n)){
      return {ok:false,reason:"numeric_fact_missing:"+n};
    }
  }

  // Reject runaway generations. Translation may be somewhat longer than English,
  // but several-times expansion is a model failure, not faithful translation.
  if(src.length>=80 && out.length>src.length*3.2){
    return {ok:false,reason:"runaway_expansion"};
  }

  // Detect degenerate word loops such as "cədvəli cədvəli cədvəli ...".
  const srcTokens=wordTokens(src);
  const outTokens=wordTokens(out);
  if(outTokens.length>=20){
    const srcFreq=tokenFrequency(srcTokens);
    const outFreq=tokenFrequency(outTokens);
    for(const [word,count] of outFreq){
      const srcCount=srcFreq.get(word)||0;
      if(count>=8 && count>srcCount+5 && count/outTokens.length>=0.12){
        return {ok:false,reason:"repeated_word_loop:"+word};
      }
    }

    // Also catch repeated 2-4 word phrases that dominate the output.
    for(const size of [2,3,4]){
      const loop=findRepeatedNgramLoop(outTokens,size);
      if(loop) return {ok:false,reason:"repeated_phrase_loop:"+loop};
    }
  }

  const instructionLeak=[
    /Aşağıdakı\s+mətni/i,
    /Azərbaycan\s+dilinə\s+(?:çevir|tərcümə)/i,
    /çevir\s+və\s+redaktə\s+et/i,
    /EDITORIAL RULES/i,
    /OUTPUT FORMAT/i,
    /EDITORIAL RULES|OUTPUT FORMAT|Previous paragraph for context only|Next paragraph for context only/i
  ];
  if(instructionLeak.some(r=>r.test(out))){
    return {ok:false,reason:"instruction_leak"};
  }

  // Target-language instructions previously caused the model to hallucinate
  // "Azərbaycan..." into unrelated project copy. Reject that factual addition.
  if(!/Azerbaijan|Azerbaijani/i.test(src) && /Azərbaycan/i.test(out)){
    return {ok:false,reason:"invented_azerbaijan_reference"};
  }

  const knownBad=[
    /\bprivasiya\b/i,
    /\bçovaq\b/i,
    /\bassurans\b/i
  ];
  if(knownBad.some(r=>r.test(out))){
    return {ok:false,reason:"literal_or_fake_loanword"};
  }

  // A translation that simply reproduces a large English chunk is not acceptable.
  const normalizedSrc=src.toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
  const normalizedOut=out.toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
  if(normalizedSrc.length>80 && normalizedOut.includes(normalizedSrc.slice(0,80))){
    return {ok:false,reason:"source_echo"};
  }

  return {ok:true};
}

function wordTokens(value=""){
  return String(value)
    .toLocaleLowerCase("az")
    .match(/[\p{L}\p{N}]+/gu)||[];
}

function tokenFrequency(tokens=[]){
  const map=new Map();
  for(const t of tokens) map.set(t,(map.get(t)||0)+1);
  return map;
}

function findRepeatedNgramLoop(tokens,size){
  if(tokens.length<size*4) return "";
  let run=1;
  let previous="";
  for(let i=0;i<=tokens.length-size;i+=size){
    const gram=tokens.slice(i,i+size).join(" ");
    if(gram===previous){
      run++;
      if(run>=4) return gram;
    }else{
      previous=gram;
      run=1;
    }
  }
  return "";
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
