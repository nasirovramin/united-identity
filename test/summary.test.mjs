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
test("all source images and videos are retained in the original order",async()=>{
 let details;let translations=0;let summaries=0;
 const n=new PostNormalizer({
  translate:async s=>{translations++;return "AZ "+s;},
  summarize:async()=>{summaries++;return brief;},
  telegraph:async d=>{details=d;return "https://united-identity-viewer.nasirovramin.workers.dev/article/test";}
 });
 const media=[
  ...Array.from({length:12},(_,i)=>({type:"image",url:"https://example.com/"+i+".jpg"})),
  {type:"video",url:"https://example.com/showreel.mp4"},
  {type:"iframe",url:"https://player.vimeo.com/video/123"},
  {type:"gif",url:"https://example.com/animated.gif"},
  {type:"video",url:"https://example.com/second.mp4"}
 ];
 const sourceBlocks=[
  {type:"text",text:"Brand background"},...media.slice(0,5),
  {type:"text",text:"Design challenge"},...media.slice(5,11),
  {type:"text",text:"Visual decisions"},...media.slice(11,14),
  {type:"text",text:"Outcome"},...media.slice(14)
 ];
 const post=await n.prepare({
  source:{name:"The Brand Identity"},
  item:{
   titleOriginal:"New design",textOriginal:"Do not translate this again",
   hasCaseStudy:true,canonicalUrl:"https://the-brandidentity.com/project/test",
   media:[{type:"image",url:"https://example.com/main.jpg"}],
   caseStudyBlocks:sourceBlocks
  }
 });
 assert.equal(summaries,1);
 assert.equal(translations,1); // headline only, no second intro translation
 assert.equal(post.paragraphs.length,2);
 assert.equal(details.blocks.filter(b=>b.type==="text").length,3);
 const actualMedia=details.blocks.filter(b=>b.type!=="text");
 assert.deepEqual(actualMedia,media);
 assert.equal(details.blocks.length,media.length+3);
 assert.equal(details.blocks[0].type,"text");
 assert.equal(details.blocks[1].url,media[0].url);
 assert.equal(details.blocks.filter(b=>b.type==="video").length,2);
 assert.equal(details.blocks.filter(b=>b.type==="iframe").length,1);
 assert.equal(post.media.length,1);
});
