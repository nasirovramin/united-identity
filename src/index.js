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

    if(path==="/test-send/the-brand-identity"){
      try{
        return json(await sendTheBrandIdentityTest(env));
      }catch(e){
        return json({ok:false,error:String(e?.message||e)},500);
      }
    }

    if(path==="/repair-test/the-brand-identity"){
      try{
        return json(await repairTheBrandIdentityTest(env));
      }catch(e){
        return json({ok:false,error:String(e?.message||e)},500);
      }
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


async function repairTheBrandIdentityTest(env){
  const sourceUrl="https://the-brandidentity.com/project/together-gives-clusia-a-four-petal-mark-showing-ai-and-people-at-work";
  const mirrorUrl="https://www.usbrandingstudio.com/projects/together-gives-clusia-a-four-petal-mark-showing-ai-and-people-at-work";
  const marker="test:the-brand-identity:clusia:v1";

  const savedRaw=await env.IDENTITY_KV?.get(marker);
  if(!savedRaw) throw new Error("Original test post record not found");
  const saved=JSON.parse(savedRaw);

  const r=await fetch(mirrorUrl,{
    headers:{
      "User-Agent":"Mozilla/5.0",
      "Accept":"text/html,application/xhtml+xml"
    }
  });
  if(!r.ok) throw new Error("Mirror HTTP "+r.status);
  const html=await r.text();

  const images=[];
  const seen=new Set();
  const imgRe=/<img\b([^>]*)>/gi;
  let m;
  while((m=imgRe.exec(html))){
    const attrs=m[1]||"";
    const mm=
      attrs.match(/\bdata-full-src=["']([^"']+)["']/i)||
      attrs.match(/\bdata-src=["']([^"']+)["']/i)||
      attrs.match(/\bsrc=["']([^"']+)["']/i);
    if(!mm) continue;
    let u="";
    try{u=new URL(mm[1],mirrorUrl).toString()}catch{continue}
    if(!/^https?:\/\//i.test(u)) continue;
    if(/logo|icon|avatar|favicon|sprite|emoji|tracking|pixel/i.test(u)) continue;
    if(seen.has(u)) continue;
    seen.add(u);
    images.push(u);
  }

  // Prefer project-specific assets when filenames/paths expose the project name.
  const projectImages=images.filter(u=>/clusia|together/i.test(u));
  const media=(projectImages.length>=2?projectImages:images).slice(0,30);
  if(!media.length) throw new Error("No article images found in mirror");

  const title="Clusia üçün insan və AI əməkdaşlığını göstərən dörd ləçəkli vizual kimlik";
  const detailBlocks=[
    {type:"text",tag:"p",text:"Clusia maliyyə əməliyyatları aparan şirkətlər üçün assurance platformasıdır. Platforma banklar və fintech şirkətlərinin hər il keçməli olduğu audit və müstəqil yoxlamaların bir hissəsini AI ilə avtomatlaşdırır. Sistem audit layihəsini müştərinin bağlı sistemlərindən formalaşdırır, hər cavabın mənbəsini göstərir və yekun nəticə akkreditə olunmuş mütəxəssis tərəfindən yoxlanılıb təsdiqlənir."},
    {type:"image",url:media[0]},
    {type:"text",tag:"p",text:"Yeni Visual Identity insanlarla AI-nin birlikdə işləməsini görünən etməyə çalışır. Dörd ləçəkdən ibarət işarə müxtəlif rolların eyni Clusia sistemi daxilində paralel işləməsini simvollaşdırır. İşarə kiçik ölçüdə də aydın qalması üçün lanyard, telefon qabı, browser tab və app icon kimi müxtəlif touchpoint-lərdə sınaqdan keçirilib."},
    ...media.slice(1,Math.min(media.length,3)).map(url=>({type:"image",url})),
    {type:"text",tag:"p",text:"Pixel əsaslı illustrasiyalarda hər pixel logo işarəsindəki ləçəyin kiçik versiyasıdır. Bu elementlər insan və AI-nin kiçik töhfələrinin birlikdə daha böyük nəticəyə çevrilməsi ideyasını daşıyır. Illustrasiyalar əvvəlcə pixel art kimi hazırlanıb, sonra Figma Weave ilə forma axtarışları aparılıb və Cinema 4D-də 3D olaraq yenidən qurulub."},
    ...media.slice(3,Math.min(media.length,6)).map(url=>({type:"image",url})),
    {type:"text",tag:"p",text:"Typography sistemində başlıqlar və interface üçün Klim Type Foundry-nin Die Grotesk, əsas mətn üçün isə Studio René Bieder-in Vitruv Text şriftindən istifadə olunur. Rəng palitrası deep green, mint və warm brown tonlarından ibarətdir. Digital məhsul daxilində yaşıl rəng əsasən status, call to action və animasiya olunan logo üçün saxlanılır."},
    ...media.slice(6).map(url=>({type:"image",url}))
  ];

  const telegraph=new TelegraphService(env);
  const detailsUrl=await telegraph.createFromBlocks({
    title,
    blocks:detailBlocks,
    sourceUrl,
    sourceName:"The Brand Identity",
    agency:""
  });

  const caption=[
    "🎬 <b>"+escapeHtml(title)+"</b>",
    "Clusia maliyyə şirkətləri üçün audit və müstəqil yoxlamaları AI vasitəsilə sürətləndirən ABŞ platformasıdır. Yeni vizual kimlik insan və AI-nin eyni sistem daxilində birlikdə işləməsi ideyası üzərində qurulub.",
    "Sistemin əsas işarəsi mərkəzdə birləşən dörd ləçəkdən ibarətdir. Pixel əsaslı illustrasiyalar, Die Grotesk və Vitruv Text typography, eləcə də yaşıl, mint və tünd qəhvəyi rəng palitrası digital məhsuldan outdoor reklama qədər vahid vizual dil yaradır.",
    "#visualidentity",
    '<a href="'+escapeHtml(detailsUrl)+'">Ətraflı</a>     <a href="'+escapeHtml(sourceUrl)+'">Mənbə: The Brand Identity</a>'
  ].join("\n\n");

  const edit=await telegramCall(env,"editMessageCaption",{
    chat_id:env.TELEGRAM_CHAT_ID,
    message_id:saved.message_id,
    caption,
    parse_mode:"HTML"
  });

  const updated={...saved,detailsUrl,imagesInTelegraph:media.length,repairedAt:new Date().toISOString()};
  await env.IDENTITY_KV?.put(marker,JSON.stringify(updated));
  return {ok:true,message_id:edit.message_id,detailsUrl,imagesInTelegraph:media.length};
}

async function sendTheBrandIdentityTest(env){
  const marker="test:the-brand-identity:clusia:v1";
  const existing=await env.IDENTITY_KV?.get(marker);
  if(existing) return {ok:true,alreadySent:true,details:JSON.parse(existing)};

  const sourceUrl="https://the-brandidentity.com/project/together-gives-clusia-a-four-petal-mark-showing-ai-and-people-at-work";
  const mirrorUrl="https://www.usbrandingstudio.com/projects/together-gives-clusia-a-four-petal-mark-showing-ai-and-people-at-work";

  let hero="";
  try{
    const r=await fetch(mirrorUrl,{headers:{"User-Agent":"Mozilla/5.0","Accept":"text/html"}});
    if(r.ok){
      const html=await r.text();
      const m=
        html.match(/<meta[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i)||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i)||
        html.match(/<img[^>]*src=["']([^"']+)["']/i);
      if(m) hero=new URL(m[1],mirrorUrl).toString();
    }
  }catch{}

  const title="Clusia üçün insan və AI əməkdaşlığını göstərən dörd ləçəkli vizual kimlik";
  const paragraphs=[
    "Clusia maliyyə şirkətləri üçün audit və müstəqil yoxlamaları AI vasitəsilə sürətləndirən ABŞ platformasıdır. Yeni vizual kimlik insan və AI-nin eyni sistem daxilində birlikdə işləməsi ideyası üzərində qurulub.",
    "Sistemin əsas işarəsi mərkəzdə birləşən dörd ləçəkdən ibarətdir. Pixel əsaslı illustrasiyalar, Die Grotesk və Vitruv Text typography, eləcə də yaşıl, mint və tünd qəhvəyi rəng palitrası digital məhsuldan outdoor reklama qədər vahid vizual dil yaradır."
  ];

  const telegraph=new TelegraphService(env);
  const detailBlocks=[
    {type:"text",tag:"p",text:"Clusia maliyyə əməliyyatları aparan şirkətlər üçün assurance platformasıdır. Platforma banklar və fintech şirkətlərinin hər il keçməli olduğu audit və müstəqil yoxlamaların bir hissəsini AI ilə avtomatlaşdırır. Sistem audit layihəsini müştərinin bağlı sistemlərindən formalaşdırır, hər cavabın mənbəsini göstərir və yekun nəticə akkreditə olunmuş mütəxəssis tərəfindən yoxlanılıb təsdiqlənir."},
    {type:"text",tag:"p",text:"Yeni Visual Identity insanlarla AI-nin birlikdə işləməsini görünən etməyə çalışır. Dörd ləçəkdən ibarət işarə müxtəlif rolların eyni Clusia sistemi daxilində paralel işləməsini simvollaşdırır. İşarə kiçik ölçüdə də aydın qalması üçün lanyard, telefon qabı, browser tab və app icon kimi müxtəlif touchpoint-lərdə sınaqdan keçirilib."},
    {type:"text",tag:"p",text:"Pixel əsaslı illustrasiyalarda hər pixel logo işarəsindəki ləçəyin kiçik versiyasıdır. Bu elementlər insan və AI-nin kiçik töhfələrinin birlikdə daha böyük nəticəyə çevrilməsi ideyasını daşıyır. Illustrasiyalar əvvəlcə pixel art kimi hazırlanıb, sonra Figma Weave ilə forma axtarışları aparılıb və Cinema 4D-də 3D olaraq yenidən qurulub."},
    {type:"text",tag:"p",text:"Typography sistemində başlıqlar və interface üçün Klim Type Foundry-nin Die Grotesk, əsas mətn üçün isə Studio René Bieder-in Vitruv Text şriftindən istifadə olunur. Rəng palitrası deep green, mint və warm brown tonlarından ibarətdir. Digital məhsul daxilində yaşıl rəng əsasən status, call to action və animasiya olunan logo üçün saxlanılır."},
    ...(hero?[{type:"image",url:hero}]:[])
  ];

  const detailsUrl=await telegraph.createFromBlocks({
    title,
    blocks:detailBlocks,
    sourceUrl,
    sourceName:"The Brand Identity",
    agency:""
  });

  const sourceLink='<a href="'+escapeHtml(sourceUrl)+'">Mənbə: The Brand Identity</a>';
  const detailsLink='<a href="'+escapeHtml(detailsUrl)+'">Ətraflı</a>';
  const caption=[
    "🎬 <b>"+escapeHtml(title)+"</b>",
    ...paragraphs.map(escapeHtml),
    "#visualidentity",
    detailsLink+"     "+sourceLink
  ].join("\n\n");

  let result;
  if(hero){
    result=await telegramCall(env,"sendPhoto",{
      chat_id:env.TELEGRAM_CHAT_ID,
      photo:hero,
      caption,
      parse_mode:"HTML"
    });
  }else{
    result=await telegramCall(env,"sendMessage",{
      chat_id:env.TELEGRAM_CHAT_ID,
      text:caption,
      parse_mode:"HTML",
      link_preview_options:{url:sourceUrl,is_disabled:false,prefer_large_media:true,show_above_text:true}
    });
  }

  const saved={message_id:result.message_id,detailsUrl,sourceUrl,hero:!!hero};
  await env.IDENTITY_KV?.put(marker,JSON.stringify(saved));
  return {ok:true,sent:true,...saved};
}

async function telegramCall(env,method,payload){
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID) throw new Error("Telegram secrets missing");
  const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/"+method,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(payload)
  });
  const d=await r.json();
  if(!d.ok) throw new Error("Telegram "+method+": "+JSON.stringify(d));
  return d.result;
}

function escapeHtml(value=""){
  return String(value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

export { CheckModule, PublishModule };
