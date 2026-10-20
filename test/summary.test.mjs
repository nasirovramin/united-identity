import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {CaseStudySummarizer} from "../src/services/summary.js";
import {PostNormalizer} from "../src/checker/normalizer.js";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const sentence="Agentlik brendin istehsal üsulunu və özünəməxsus vizual xüsusiyyətlərini qablaşdırmada göstərməyi məqsəd qoyub.";
const brief=[sentence.repeat(4),sentence.repeat(4),sentence.repeat(4)].join("\n\n");
test("single cached AI call for a case study",async()=>{
 let calls=0;const db=new Map();
 const env={AI:{run:async(model,req)=>{calls++;assert.match(req.messages[1].content,/kraft paper/);return {response:brief};}},IDENTITY_KV:{get:async k=>db.get(k)||null,put:async(k,v)=>db.set(k,v)}};
 const item={titleOriginal:"New design",caseStudyBlocks:[{type:"text",text:"The new brand design uses kraft paper and lettering."}]};
 const s=new CaseStudySummarizer(env);
 assert.equal(await s.summarize(item),brief);assert.equal(await s.summarize(item),brief);assert.equal(calls,1);
});
test("Telegram uses same summary and detail page has fewer images",async()=>{
 let details;const n=new PostNormalizer({translate:async s=>"AZ "+s,summarize:async()=>brief,telegraph:async d=>{details=d;return "https://united-identity-viewer.nasirovramin.workers.dev/article/test"}});
 const post=await n.prepare({source:{name:"The Brand Identity"},item:{titleOriginal:"New design",textOriginal:"Original intro",hasCaseStudy:true,canonicalUrl:"https://the-brandidentity.com/project/test",media:[{type:"image",url:"https://example.com/main.jpg"}],caseStudyBlocks:Array.from({length:9},(_,i)=>({type:"image",url:"https://example.com/"+i+".jpg"}))}});
 assert.equal(post.paragraphs.length,2);assert.equal(details.blocks.filter(b=>b.type==="text").length,3);assert.equal(details.blocks.filter(b=>b.type==="image").length,6);assert.equal(post.media.length,1);
});
