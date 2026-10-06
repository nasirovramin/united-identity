const WORK_SECTION = /(?:^|\/)(?:work|our-work|portfolio|projects?|case-stud(?:y|ies)|selected-work|cases)(?:\/|$)/i;
const NON_WORK_SECTION = /\/(?:news|insights?|articles?|journal|blog|about|contact|jobs?|careers?|shop|store|press|events?|features?|archive|category|categories|tags?)(?:\/|$)/i;
const WORK_LABEL = /^(work|our work|portfolio|projects?|case studies|selected work|cases)$/i;

export class WebSourceAdapter {
 constructor(source,technical){this.source=source;this.technical=technical}

 async home(){return this.technical.fetch(this.source.url)}

 workSections(html,{links}){
  const sourcePath=new URL(this.source.url).pathname;
  if(WORK_SECTION.test(sourcePath)) return [{url:this.source.url,text:"Work"}];
  return links(html,this.source.url,this.source.host).filter(a=>{
   const path=new URL(a.url).pathname;
   return !NON_WORK_SECTION.test(path) &&
    (WORK_SECTION.test(path)||WORK_LABEL.test((a.text||"").trim()));
  });
 }

 discover(html,{links,candidateScore,isGenericPage},baseUrl=this.source.url){
  return links(html,baseUrl,this.source.host)
   .filter(a=>{
    const path=new URL(a.url).pathname;
    return !NON_WORK_SECTION.test(path) && !WORK_LABEL.test((a.text||"").trim());
   })
   .map(a=>({...a,source:this.source.name,sourceId:this.source.id,score:candidateScore(a)}))
   .filter(a=>!isGenericPage(a.url,a.text))
   .sort((a,b)=>b.score-a.score);
 }

 async discoverProjects(homeHtml,helpers){
  const sections=this.workSections(homeHtml,helpers);
  if(!sections.length) throw Error("work_portfolio_section_not_found");
  const out=[];
  const seen=new Set();
  // Source boundary is strict: only links discovered inside Work/Portfolio are eligible.
  for(const section of sections.slice(0,2)){
   const html=section.url===this.source.url?homeHtml:await this.technical.fetch(section.url);
   for(const item of this.discover(html,helpers,section.url)){
    if(item.url===section.url || seen.has(item.url)) continue;
    seen.add(item.url); out.push(item);
   }
  }
  return out.sort((a,b)=>b.score-a.score);
 }

 async page(url){return this.technical.fetch(url)}
}
