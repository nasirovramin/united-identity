import fs from "node:fs/promises";
import {
  discoverProjectLinksMarkdown,
  parseArticle
} from "../src/sources/the-brand-identity.js";
import previousSnapshot from "../src/generated/the-brand-identity-snapshot.js";

const FEATURES="https://the-brandidentity.com/features";
const OUTPUT="src/generated/the-brand-identity-snapshot.js";
const SOURCE={
  id:"the-brand-identity",
  name:"The Brand Identity",
  type:"web",
  url:FEATURES
};

const features=await reader(FEATURES,"markdown");
const discovered=discoverProjectLinksMarkdown(features);
console.log("TBI discovered project cards",discovered.length);
const cards=discovered.slice(0,30);
if(!cards.length) throw new Error("No The Brand Identity project cards found");

const previousByUrl=new Map(
  (previousSnapshot?.items||[]).map(item=>[item.canonicalUrl,item])
);

const items=[];
let reused=0;
let fetched=0;

for(const card of cards){
  const cached=previousByUrl.get(card.url);
  if(cached){
    items.push(cached);
    reused++;
    continue;
  }

  try{
    const html=await reader(card.url,"html");
    const parsed=parseArticle(html,card.url,SOURCE);
    const item=parsed.item;
    if(!item.titleOriginal||!item.canonicalUrl) throw new Error("parsed article incomplete");
    const media=(item.caseStudyMedia||[]).length;
    const texts=(item.caseStudyBlocks||[]).filter(x=>x.type==="text").length;
    console.log("TBI",item.titleOriginal,"media",media,"text",texts);
    items.push(item);
    fetched++;
  }catch(e){
    console.error("TBI fetch failed",card.url,String(e?.message||e));
  }
  await sleep(1200);
}
console.log("TBI snapshot reuse",reused,"fetched",fetched);

if(!items.length) throw new Error("No The Brand Identity articles could be materialized");

const snapshot={source:SOURCE,items};
const js="const snapshot="+JSON.stringify(snapshot,null,2)+";\n\nexport default snapshot;\n";
await fs.mkdir("src/generated",{recursive:true});
await fs.writeFile(OUTPUT,js,"utf8");
console.log("WROTE",OUTPUT,"items",items.length);

async function reader(url,mode="markdown"){
  let last="";
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const headers={
        "User-Agent":"Mozilla/5.0 (compatible; UnitedIdentitySourceRefresh/1.0)",
        "Accept":"text/plain"
      };
      if(mode!=="markdown") headers["X-Respond-With"]=mode;
      const r=await fetch("https://r.jina.ai/"+url,{
        headers,
        signal:AbortSignal.timeout(35000)
      });
      const text=await r.text();
      if(r.ok && text.length>500) return text;
      last="HTTP "+r.status+" bytes "+text.length;
      if(r.status!==429 && r.status<500) break;
    }catch(e){
      last=String(e?.message||e);
    }
    await sleep(1500*attempt*attempt);
  }
  throw new Error("Reader failed for "+url+": "+last);
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
