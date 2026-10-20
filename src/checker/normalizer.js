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

      const textBlocks=briefParagraphs.map(text=>({type:"text",tag:"p",text}));
      const mediaBlocks=selectVisuals(item.caseStudyBlocks||[]);
      detailsUrl=await this.telegraph({
        title,
        blocks:[...textBlocks,...mediaBlocks],
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

function selectVisuals(blocks=[]){
  const all=blocks.map((b,i)=>({b,i})).filter(x=>["image","gif","video","iframe"].includes(x.b?.type));
  if(all.length<=6) return all.map(x=>({...x.b}));
  // Keep representative real source imagery and any film/embed. No new media
  // hosting, proxy or AI image generation is introduced.
  const priority=all.filter(x=>["video","iframe"].includes(x.b.type)).slice(0,2);
  const pictures=all.filter(x=>["image","gif"].includes(x.b.type));
  const count=Math.min(6-priority.length,pictures.length);
  const chosen=count===1?[pictures[0]]:Array.from({length:count},(_,i)=>pictures[Math.round(i*(pictures.length-1)/(count-1))]);
  return [...priority,...chosen].sort((a,b)=>a.i-b.i).map(x=>({...x.b}));
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
