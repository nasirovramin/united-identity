export class TechnicalChecker {
  check(packet){
    const errors=[];
    const warnings=[];

    if(!packet?.source?.id) errors.push("source_id_missing");
    if(!["web","telegram"].includes(packet?.source?.type)) errors.push("source_type_invalid");
    if(!isHttp(packet?.source?.url)) errors.push("source_url_invalid");

    const item=packet?.item||{};
    if(!isHttp(item.canonicalUrl)) errors.push("canonical_url_invalid");
    if(!String(item.titleOriginal||"").trim()) errors.push("title_missing");

    const media=Array.isArray(item.media)?item.media:[];
    if(!media.length) errors.push("media_missing");

    for(const m of media){
      if(!["image","video","gif"].includes(m?.type)) errors.push("media_type_invalid");
      if(!isHttp(m?.url)) errors.push("media_url_invalid");
    }

    return {ok:errors.length===0,errors,warnings};
  }
}

function isHttp(value=""){
  try{
    const u=new URL(String(value));
    return u.protocol==="http:"||u.protocol==="https:";
  }catch{return false}
}
