const MODELS=[
  "@cf/meta/llama-3.1-8b-instruct-fast"
];

const TRANSLATION_CACHE_VERSION="v3-contextual-editor";

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
    if(cached) return cached;

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
    "You are a senior Azerbaijani-language editor and translator specialising in design, branding, technology and business journalism.",
    "Translate the user's message into fluent, idiomatic Azerbaijani.",
    "Return ONLY the final Azerbaijani translation. Do not add a label, heading, note, explanation, quotation marks, or the translation instructions.",
    "",
    "Rules:",
    "- First understand the author's intended meaning; then express that meaning naturally in Azerbaijani. Never mirror English word order when it sounds unnatural.",
    "- Preserve all facts, names, relationships, speakers and nuances. Never add geography, organisations, people or explanations that are not in the source.",
    "- If a sentence is long or tangled, split it into clearer Azerbaijani sentences.",
    "- Translate idioms, metaphors and wordplay by meaning, not by literal wording.",
    "- Do not invent pseudo-Azerbaijani phonetic borrowings for ordinary English words.",
    "- Keep proper names and established international design/tech terms where appropriate: "+KEEP_ENGLISH.join(", ")+".",
    "- Use clear contemporary journalistic Azerbaijani, not academic prose, Russian/Turkish calques, or robotic AI language.",
    "- Quotes should sound like natural spoken Azerbaijani while preserving exactly what the speaker means.",
    "- Never introduce Azerbaijan/Azerbaijani as article content unless the source message itself explicitly mentions it.",
    "",
    "Domain guide:",
    "- assurance in financial/audit context means independent verification/assurance work, not insurance.",
    "- compliance means meeting regulatory/legal requirements; translate by meaning.",
    "- privacy hedge means a dense hedge/shrub planted to create privacy. It is a landscaping/plant term.",
    "- behind the scenes / behind the hedge can be intentional wordplay; preserve the hidden-work meaning and the hedge reference clearly.",
    "- the grind means repetitive, time-consuming routine work.",
    "",
    full
      ?"This is a full article paragraph. Preserve every piece of information, but restructure sentences freely for clarity."
      :"This is a headline or short Telegram text. Keep it concise and immediately understandable."
  ];

  if(before){
    lines.push(
      "",
      "Previous paragraph for context only (DO NOT translate or repeat):",
      before.slice(0,1200)
    );
  }
  if(after){
    lines.push(
      "",
      "Next paragraph for context only (DO NOT translate or repeat):",
      after.slice(0,1200)
    );
  }
  if(strict){
    lines.push(
      "",
      "STRICT RETRY: A previous result failed validation. Output only the translation and be especially careful not to invent 'Azərbaycan', echo instructions, or use literal nonsense."
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
