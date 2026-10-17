const MODELS=[
  "@cf/meta/llama-3.1-8b-instruct-fast"
];

const TRANSLATION_CACHE_VERSION="v9-faithful-clear-context";

const KEEP_ENGLISH=[
  "AI","UI","UX","Visual Identity","Identity","Digital","Motion","Logo","Wordmark",
  "typography","font","branding","brand"
];

export class AzerbaijaniTranslator {
  constructor(env){this.env=env}

  async translateBlocks(blocks=[]){
    const source=(blocks||[]).map(x=>String(x||"").trim());
    const results=new Array(source.length).fill("");

    // Keep the faithful sentence-by-sentence method, but translate at most
    // two source sentences per AI request. This stays under Cloudflare's
    // per-invocation subrequest limit while still preventing paragraph-wide
    // summarisation and repetition failures.
    for(let i=0;i<source.length;i++){
      if(!source[i]) continue;

      const sentences=splitEnglishSentences(source[i]);
      const chunks=sentenceChunks(sentences,2,950);
      const translated=[];

      for(let j=0;j<chunks.length;j++){
        translated.push(await this.translate(chunks[j],{
          full:true,
          contextBefore:chunks[j-1]||"",
          contextAfter:chunks[j+1]||""
        }));
      }

      results[i]=translated.join(" ").replace(/\s+/g," ").trim();
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
    "- Stay close to the source wording and sentence order, but rebuild word order and sentence structure whenever a literal rendering would be unclear in Azerbaijani.",
    "- DO NOT summarize, compress, simplify away details, merge ideas, or omit repeated information.",
    "- DO NOT add explanations, examples, interpretations, background facts or conclusions that are not explicitly present in the source.",
    "- Clarify references that are implicit in English: when 'it', 'this', 'they', 'the idea', 'that job' or a similar reference would be vague in Azerbaijani, replace it with the exact person/object/idea it refers to, but ONLY if that referent is explicit in the source or supplied context.",
    "- Preserve cause-and-effect, contrast, purpose and sequence explicitly. If English leaves a relation implicit but Azerbaijani would sound confusing, make that relation grammatically clear without adding a new fact.",
    "- Every fact, qualifier, comparison, example, attribution, quotation, relationship and nuance in the source must appear in the translation.",
    "- Preserve sentence boundaries whenever possible. Split or join a sentence only when absolutely necessary for clear Azerbaijani, and do not lose any content when doing so.",
    "- If an idiom, metaphor or wordplay is present, translate its intended meaning clearly and keep all concrete details. If necessary, phrase the same sentence so the reader understands what the wordplay refers to, but do not add a separate explanation or invent a new metaphor.",
    "- Preserve names, brands, studios, people, products, dates, numbers and proper nouns exactly unless Azerbaijani grammar requires a suffix.",
    "- Keep established international design/tech terms where appropriate: "+KEEP_ENGLISH.join(", ")+".",
    "- Quotes must preserve the speaker's exact meaning and all details. Do not polish away awkwardness if that changes content.",
    "- Never introduce Azerbaijan/Azerbaijani as article content unless the source itself mentions it.",
    "- Do not use fake phonetic borrowings when a normal Azerbaijani word exists.",
    "",
    "QUALITY TARGET:",
    "- The translation should be fully understandable on first reading in Azerbaijani while remaining maximally faithful to the source.",
    "- Faithfulness is more important than elegance. Clarity may change word order, sentence structure and explicit referents, but NEVER the amount of information.",
    "- The Azerbaijani reader should understand what the case study is saying and why each sentence follows the previous one, without needing to see the English original.",
    "",
    "Domain guide:",
    "- assurance in financial/audit context = independent verification / assurance work, not insurance.",
    "- compliance = meeting regulatory/legal requirements.",
    "- privacy hedge = a dense hedge/shrub planted to create privacy.",
    "- behind the scenes / behind the hedge may be deliberate wordplay; preserve both the hidden-work meaning and hedge reference.",
    "- the grind = repetitive, time-consuming routine work.",
    "",
    full
      ?"This is a full case-study paragraph. Translate the complete paragraph with nothing removed and nothing added. Preserve every design decision, rationale, example and quote, but phrase them so the logic is clear in Azerbaijani."
      :"This is a headline or short Telegram text. Translate it completely; do not shorten it. Make the intended meaning immediately clear."
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

  // Deterministic cleanup for a few recurring machine-transliteration errors.
  // These replacements do not add facts; they only turn bad loanwords into the
  // intended Azerbaijani meaning.
  out=out
    .replace(/\bassurans\b/gi,"təsdiq və yoxlama")
    .replace(/\bprivasiya\b/gi,"məxfilik")
    .replace(/\bçovaq\b/gi,"kol")
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

function sentenceChunks(sentences=[],maxSentences=2,maxChars=950){
  const chunks=[];
  let current=[];

  for(const sentence of sentences){
    const candidate=[...current,sentence].join(" ");
    if(current.length && (current.length>=maxSentences || candidate.length>maxChars)){
      chunks.push(current.join(" "));
      current=[sentence];
    }else{
      current.push(sentence);
    }
  }
  if(current.length) chunks.push(current.join(" "));
  return chunks;
}

function splitEnglishSentences(value=""){
  const s=String(value||"").replace(/\s+/g," ").trim();
  if(!s) return [];

  const out=[];
  let start=0;
  let quote=null;
  for(let i=0;i<s.length;i++){
    const ch=s[i];

    if(ch==='"' || ch==="“" || ch==="”"){
      if(quote===null) quote=ch;
      else if(ch===quote || ch==="”") quote=null;
    }

    if(!/[.!?]/.test(ch)) continue;

    let end=i+1;
    while(end<s.length && /["'’”)]/.test(s[end])) end++;
    const next=s.slice(end).match(/^\s+([A-Z“"'])/);
    if(next){
      const piece=s.slice(start,end).trim();
      if(piece) out.push(piece);
      start=end;
    }
  }

  const tail=s.slice(start).trim();
  if(tail) out.push(tail);
  return out;
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
