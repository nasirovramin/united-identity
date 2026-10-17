import { ALL_SOURCES, WEB_SOURCES, TELEGRAM_SOURCES } from "./sources/registry.js";
import { CheckModule } from "./checker/index.js";
import { PublishModule } from "./publisher/index.js";

function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{"content-type":"application/json;charset=UTF-8"}
  });
}

export default {
  async fetch(req){
    const path=new URL(req.url).pathname;

    if(path==="/health"){
      return json({
        ok:true,
        architecture:"sources -> check -> publish",
        modules:{
          sources:true,
          check:true,
          publish:true
        },
        sourceCount:{
          web:WEB_SOURCES.length,
          telegram:TELEGRAM_SOURCES.length,
          total:ALL_SOURCES.length
        },
        automaticScanning:false,
        publishing:false
      });
    }

    if(path==="/sources"){
      return json({
        web:WEB_SOURCES,
        telegram:TELEGRAM_SOURCES
      });
    }

    return new Response(
      "United Identity arxitekturası hazırdır: Mənbələr → Yoxlama → Paylaşım. Hazırda mənbə qoşulmayıb.",
      {headers:{"content-type":"text/plain;charset=UTF-8"}}
    );
  }
};

export { CheckModule, PublishModule };
