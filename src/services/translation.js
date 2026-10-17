const MODELS=[
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.2-1b-instruct"
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
          const prompt=buildPrompt(src,{
            full,
            contextBefore,
            contextAfter,
            strict:attempt>0
          });

          const result=await this.env.AI.run(model,{
            messages:[
              {
                role:"system",
                content:[
                  "You are a senior Azerbaijani-language editor and translator specialising in design, branding, technology and business journalism.",
                  "Your job is to preserve the author's exact meaning and facts while rewriting the source into fluent, idiomatic Azerbaijani.",
                  "Never translate word-for-word when that would sound unnatural or change the meaning.",
                  "Never invent countries, people, organisations, facts or explanations.",
                  "Never echo the user's instructions. Return only the requested <az>...</az> output."
                ].join(" ")
              },
              {role:"user",content:prompt}
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

function buildPrompt(src,{full,contextBefore,contextAfter,strict}){
  const before=String(contextBefore||"").trim();
  const after=String(contextAfter||"").trim();

  const lines=[
    "Translate ONLY the text inside <source> into natural Azerbaijani.",
    "",
    "EDITORIAL RULES:",
    "1. First understand what the author means; then express that meaning naturally in Azerbaijani. Do not mirror English word order.",
    "2. The result must be immediately understandable to an Azerbaijani reader who has never seen the English original.",
    "3. Preserve every factual claim, relationship, speaker and nuance. Do not add, omit or reinterpret facts.",
    "4. If an English sentence is long or tangled, split it into two or more clear Azerbaijani sentences when needed.",
    "5. Translate idioms, metaphors and wordplay by meaning. If the wordplay matters, make the intended meaning clear instead of producing a literal but nonsensical phrase.",
    "6. Do not create fake Azerbaijani transliterations of ordinary English words. Use a real Azerbaijani equivalent when one exists.",
    "7. Keep proper names and established international design/tech terms unchanged where appropriate: "+KEEP_ENGLISH.join(", ")+".",
    "8. Use clear journalistic Azerbaijani. Avoid academic language, Russian/Turkish calques and robotic AI phrasing.",
    "9. Quotes must sound like natural spoken Azerbaijani while preserving what the speaker actually meant.",
    "10. Do not introduce the words Azerbaijan/Azerbaijani as content unless the SOURCE itself explicitly mentions Azerbaijan/Azerbaijani.",
    "",
    "DOMAIN MEANING GUIDE (use only when relevant):",
    "- assurance in finance/audit context = independent verification / assurance work, NOT insurance.",
    "- compliance = meeting regulatory/legal requirements; translate by meaning, not as a phonetic borrowing.",
    "- privacy hedge = a dense hedge/shrub planted to create privacy. It is a plant/landscaping term, not a country or abstract 'privacy' brand term.",
    "- behind the scenes / behind the hedge may be a deliberate wordplay; make both the hidden-work meaning and hedge reference understandable.",
    "- the grind = repetitive, time-consuming routine work.",
    "- product/UI/interface terminology should stay clear and professional.",
    "",
    full
      ?"This is an article paragraph. Keep all information, but freely rebuild sentence structure for clarity."
      :"This is a headline or short Telegram text. Keep it concise, natural and immediately clear.",
  ];

  if(strict){
    lines.push(
      "",
      "STRICT RETRY:",
      "A previous output failed quality checks. Be especially careful not to echo instructions, invent geography, use literal nonsense, or introduce pseudo-Azerbaijani words."
    );
  }

  if(before){
    lines.push(
      "",
      "<context_before>",
      before,
      "</context_before>",
      "The context above is ONLY for disambiguation. Do not translate or repeat it."
    );
  }

  lines.push("","<source>",src,"</source>");

  if(after){
    lines.push(
      "",
      "<context_after>",
      after,
      "</context_after>",
      "The context above is ONLY for disambiguation. Do not translate or repeat it."
    );
  }

  lines.push(
    "",
    "OUTPUT FORMAT:",
    "Return exactly one block: <az>FINAL AZERBAIJANI TEXT</az>",
    "Do not include notes, labels, explanations or the instructions."
  );

  return lines.join("\n");
}

function extractTranslation(raw=""){
  const s=String(raw||"").trim();
  const tagged=s.match(/<az>\s*([\s\S]*?)\s*<\/az>/i);
  let out=tagged?tagged[1].trim():s;

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
    /<source>|<context_|<az>|<\/az>/i
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
