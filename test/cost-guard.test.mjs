import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker, { quotaWasExhaustedToday } from "../src/index.js";
import { AzerbaijaniTranslator } from "../src/services/translation.js";

globalThis.crypto ||= webcrypto;

test("public diagnostic endpoints cannot run AI or modify posts", async()=>{
  let calls=0;
  const env={AI:{run:async()=>{calls++; throw Error("unexpected AI call")}}};
  for(const path of ["/test-send/the-brand-identity","/repair-test/the-brand-identity","/test/the-brand-identity?translate=1"]){
    const res=await worker.fetch(new Request("https://example.com"+path),env);
    assert.equal(res.status,404);
  }
  assert.equal(calls,0);
  assert.equal((await worker.fetch(new Request("https://example.com/health"),env)).status,200);
});

test("daily quota exhaustion stops until UTC day changes",()=>{
  const raw=JSON.stringify({status:"ai_quota_exhausted",at:"2026-11-05T23:59:00Z"});
  assert.equal(quotaWasExhaustedToday(raw,new Date("2026-11-05T23:59:59Z")),true);
  assert.equal(quotaWasExhaustedToday(raw,new Date("2026-11-06T00:00:00Z")),false);
  assert.equal(quotaWasExhaustedToday("invalid",new Date("2026-11-05T12:00:00Z")),false);
  assert.equal(quotaWasExhaustedToday(JSON.stringify({status:"candidate_failures",at:"2026-11-05T23:59:00Z"}),new Date("2026-11-05T23:59:59Z")),false);
});

test("quota errors do not trigger translation retries",async()=>{
  let calls=0;
  const translator=new AzerbaijaniTranslator({AI:{run:async()=>{calls++;throw Error("3036 daily free allocation exceeded")}},IDENTITY_KV:{get:async()=>null}});
  await assert.rejects(()=>translator.translate("A sample headline"),/3036/);
  assert.equal(calls,1);
});
