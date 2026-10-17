// Converts source output into the single format used by the publisher.
// Translation is injected as a dependency so the provider can change
// without touching source modules or the publisher.
export class PostNormalizer {
  constructor({translate,telegraph}={}){
    this.translate=translate;
    this.telegraph=telegraph;
  }

  async prepare(packet){
    const item=packet.item||{};
    if(typeof this.translate!=="function") throw new Error("translation_provider_missing");

    const title=await this.translate(item.titleOriginal||"");
    const sourceText=String(item.textOriginal||"").trim();
    const translatedText=sourceText?await this.translate(sourceText):"";
    const paragraphs=toParagraphs(translatedText).slice(0,2);

    let detailsUrl="";
    if(item.hasCaseStudy){
      if(typeof this.telegraph!=="function") throw new Error("telegraph_provider_missing");
      detailsUrl=await this.telegraph({
        title,
        text:item.caseStudyText||sourceText,
        media:item.caseStudyMedia||item.media||[],
        sourceUrl:item.canonicalUrl,
        sourceName:packet.source.name,
        agency:item.agency||""
      });
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

function toParagraphs(text=""){
  return String(text)
    .split(/\n\s*\n/)
    .map(x=>x.replace(/\s+/g," ").trim())
    .filter(Boolean);
}
