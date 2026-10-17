import { ALL_SOURCES, WEB_SOURCES, TELEGRAM_SOURCES } from "./sources/registry.js";
import { CheckModule } from "./checker/index.js";
import { PublishModule } from "./publisher/index.js";
import { AzerbaijaniTranslator } from "./services/translation.js";
import { TelegraphService } from "./services/telegraph.js";

function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{"content-type":"application/json;charset=UTF-8"}
  });
}

export default {
  async fetch(req,env){
    const url=new URL(req.url);
    const path=url.pathname;

    if(path==="/health"){
      return json({
        ok:true,
        architecture:"sources -> check -> publish",
        sourceCount:{
          web:WEB_SOURCES.length,
          telegram:TELEGRAM_SOURCES.length,
          total:ALL_SOURCES.length
        },
        sources:ALL_SOURCES.map(x=>x.config),
        automaticScanning:false,
        publishing:false
      });
    }

    if(path==="/sources"){
      return json({
        web:WEB_SOURCES.map(x=>x.config),
        telegram:TELEGRAM_SOURCES.map(x=>x.config)
      });
    }

    if(path==="/test/the-brand-identity"){
      try{
        const source=WEB_SOURCES.find(x=>x.config.id==="the-brand-identity");
        const cards=await source.scan();
        const first=cards[0];
        if(!first) return json({ok:false,error:"No project card found"},500);
        const article=await source.readArticle(first.item.canonicalUrl);

        if(url.searchParams.get("translate")!=="1"){
          return json({
            ok:true,
            mode:"parse-only",
            source:source.config,
            cardsFound:cards.length,
            sample:{
              url:article.item.canonicalUrl,
              title:article.item.titleOriginal,
              hero:article.item.media[0]?.url||"",
              agency:article.item.agency,
              blocks:article.item.caseStudyBlocks?.length||0,
              textBlocks:(article.item.caseStudyBlocks||[]).filter(x=>x.type==="text").length,
              mediaBlocks:(article.item.caseStudyBlocks||[]).filter(x=>x.type!=="text").length
            }
          });
        }

        const translator=new AzerbaijaniTranslator(env);
        const telegraph=new TelegraphService(env);
        const checker=new CheckModule({
          translate:(text,opts)=>translator.translate(text,opts),
          telegraph:(data)=>telegraph.createFromBlocks(data)
        });
        const checked=await checker.process(article);
        return json({
          ok:checked.ok,
          mode:"translated-preview",
          stage:checked.stage,
          technical:checked.technical,
          visual:checked.visual,
          post:checked.post
        },checked.ok?200:500);
      }catch(e){
        return json({ok:false,error:String(e?.message||e)},500);
      }
    }

    return new Response(
      "United Identity: The Brand Identity mənbə modulu qoşulub. Avtomatik paylaşım hələ testdən sonra aktiv ediləcək.",
      {headers:{"content-type":"text/plain;charset=UTF-8"}}
    );
  }
};

export { CheckModule, PublishModule };
