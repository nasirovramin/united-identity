const WORK_SECTION = /(?:^|\/)(?:work|our-work|portfolio|projects?|case-stud(?:y|ies)|selected-work|cases)(?:\/|$)/i;
const NON_WORK_SECTION = /\/(?:news|insights?|articles?|journal|blog|about|contact|jobs?|careers?|shop|store|press|events?|features?|archive|category|categories|tags?)(?:\/|$)/i;

export class WebSourceAdapter {
 constructor(source,technical){this.source=source;this.technical=technical}

 async home(){return this.technical.fetch(this.source.url)}

 discover(html,{links,candidateScore,isGenericPage}){
  const all=links(html,this.source.url,this.source.host)
   .filter(a=>!NON_WORK_SECTION.test(new URL(a.url).pathname));

  // First locate the site's project showcase. A web source may not feed
  // arbitrary homepage/editorial links into United Identity.
  const workLinks=all.filter(a=>{
   const path=new URL(a.url).pathname;
   const label=(a.text||"").trim().toLowerCase();
   return WORK_SECTION.test(path) ||
    /^(work|our work|portfolio|projects?|case studies|selected work|cases)$/i.test(label);
  });

  return workLinks
   .map(a=>({...a,source:this.source.name,sourceId:this.source.id,score:candidateScore(a)}))
   .filter(a=>!isGenericPage(a.url,a.text))
   .sort((a,b)=>b.score-a.score);
 }

 async page(url){return this.technical.fetch(url)}
}
