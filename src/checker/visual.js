export class VisualChecker {
  check(post){
    const errors=[];
    const warnings=[];

    if(post?.language!=="az") errors.push("azerbaijani_required");
    if(!String(post?.title||"").trim()) errors.push("post_title_missing");

    const paragraphs=Array.isArray(post?.paragraphs)?post.paragraphs.filter(Boolean):[];
    if(!paragraphs.length) errors.push("post_text_missing");
    if(paragraphs.length>3) warnings.push("too_many_paragraphs");

    const media=Array.isArray(post?.media)?post.media:[];
    if(!media.length) errors.push("post_media_missing");

    if(post?.detailsUrl && !/^https:\/\/telegra\.ph\//i.test(post.detailsUrl)){
      errors.push("details_must_be_telegraph");
    }

    if(!/^https?:\/\//i.test(String(post?.sourceUrl||""))){
      errors.push("source_link_missing");
    }

    return {ok:errors.length===0,errors,warnings};
  }
}
