export class SourceHealth {
 constructor(env){this.env=env}
 async record(source,{ok,error="",items=0}={}){
  const key="health:source:"+source.id;
  let prev={success:0,failures:0,consecutiveFailures:0};
  try{prev=JSON.parse(await this.env.IDENTITY_KV.get(key)||JSON.stringify(prev))}catch{}
  const next={...prev,source:source.name,id:source.id,lastCheck:new Date().toISOString(),lastItems:items};
  if(ok){next.success=(prev.success||0)+1;next.consecutiveFailures=0;next.status="green";next.lastError=""}
  else {next.failures=(prev.failures||0)+1;next.consecutiveFailures=(prev.consecutiveFailures||0)+1;next.lastError=String(error||"unknown");next.status=next.consecutiveFailures>=3?"red":"yellow"}
  await this.env.IDENTITY_KV.put(key,JSON.stringify(next),{expirationTtl:60*60*24*30}); return next;
 }
}
