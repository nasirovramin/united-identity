// Converts source output into the single format used by the publisher.
export class PostNormalizer {
  constructor({translate,telegraph,summarize}={}){
    this.translate=translate;
    this.telegraph=telegraph;
    this.summarize=summarize;
  }

  async prepare(packet){
    const item=packet.item||{};
    if(typeof this.translate!=="function") throw new Error("translation_provider_missing");

    const title=await this.translate(item.titleOriginal||"",{full:false});
    let paragraphs=[];
    let detailsUrl="";

    if(item.hasCaseStudy){
      if(typeof this.telegraph!=="function") throw new Error("telegraph_provider_missing");
      if(typeof this.summarize!=="function") throw new Error("case_study_summarizer_missing");
      // ONE grounded explanatory brief replaces dozens of sentence-by-sentence
      // translations. The same brief also provides the Telegram intro.
      const brief=await this.summarize(item);
      const briefParagraphs=toParagraphs(brief);
      paragraphs=briefParagraphs.slice(0,2);

      // Shorten ONLY the written content. Preserve every source image, GIF,
      // video and embedded player in its original order and relative position.
      const contentBlocks=mergeSummaryWithOriginalMedia(briefParagraphs,item.caseStudyBlocks||[]);
      detailsUrl=await this.telegraph({
        title,
        blocks:contentBlocks,
        sourceUrl:item.canonicalUrl,
        sourceName:packet.source.name,
        agency:item.agency||""
      });
    }else{
      const intro=item.textOriginal?await this.translate(item.textOriginal,{full:false}):"";
      paragraphs=toParagraphs(intro).slice(0,2);
    }

    return {
      language:"az",
      title,
      paragraphs,
      agency:item.agency||"",
      hashtag:"#visualidentity",
      media:Array.isArray(item.media)?item.media:[],
      detailsUrl,
      sourceName:packet.source.name,
      sourceUrl:item.canonicalUrl
    };
  }
}

function mergeSummaryWithOriginalMedia(paragraphs=[],sourceBlocks=[]){
  const sourceTexts=sourceBlocks.filter(block=>block?.type==="text").length;
  const summary=(paragraphs||[]).filter(Boolean);
  if(!sourceTexts){
    return [
      ...summary.map(text=>({type:"text",tag:"p",text})),
      ...sourceBlocks.filter(block=>isSourceMedia(block)).map(block=>({...block}))
    ];
  }

  // Place summary paragraphs into the original article's text positions,
  // without moving, skipping or imposing any upper limit on the media.
  const placements=new Map();
  summary.forEach((text,index)=>{
    const slot=Math.floor(index*sourceTexts/summary.length);
    if(!placements.has(slot))placements.set(slot,[]);
    placements.get(slot).push({type:"text",tag:"p",text});
  });

  const result=[];
  let textSlot=0;
  for(const block of sourceBlocks){
    if(block?.type==="text"){
      result.push(...(placements.get(textSlot)||[]));
      textSlot++;
    }else if(isSourceMedia(block)){
      result.push({...block});
    }
  }
  return result;
}

function isSourceMedia(block){
  const url=String(block?.url||"");
  return ["image","gif","video","iframe"].includes(block?.type)
    && (url.startsWith("https://")||url.startsWith("http://"));
}

function toParagraphs(text=""){
  const raw=String(text).split(/\n\s*\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  if(raw.length>1) return raw;
  const sentences=String(text).match(/[^.!?]+[.!?]?/g)||[];
  if(sentences.length<2) return raw;
  const mid=Math.ceil(sentences.length/2);
  return [
    sentences.slice(0,mid).join(" ").trim(),
    sentences.slice(mid).join(" ").trim()
  ].filter(Boolean);
}
