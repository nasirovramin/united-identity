// Converts source output into the single format used by the publisher.
export class PostNormalizer {
  constructor({translate,telegraph}={}){
    this.translate=translate;
    this.telegraph=telegraph;
  }

  async prepare(packet){
    const item=packet.item||{};
    if(typeof this.translate!=="function") throw new Error("translation_provider_missing");

    const title=await this.translate(item.titleOriginal||"",{full:false});
    const translatedText=item.textOriginal
      ?await this.translate(item.textOriginal,{full:false})
      :"";
    const paragraphs=toParagraphs(translatedText).slice(0,2);

    let detailsUrl="";
    if(item.hasCaseStudy){
      if(typeof this.telegraph!=="function") throw new Error("telegraph_provider_missing");

      const translatedBlocks=[];
      for(const block of item.caseStudyBlocks||[]){
        if(block.type==="text"){
          translatedBlocks.push({
            ...block,
            text:await this.translate(block.text,{full:true})
          });
        }else{
          translatedBlocks.push(block);
        }
      }

      detailsUrl=await this.telegraph({
        title,
        blocks:translatedBlocks,
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
