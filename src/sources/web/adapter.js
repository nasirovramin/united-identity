export class WebSourceAdapter {
 constructor(source,technical){this.source=source;this.technical=technical}
 async home(){return this.technical.fetch(this.source.url)}
 discover(html,{links,candidateScore,isGenericPage}){
  return links(html,this.source.url,this.source.host)
   .map(a=>({...a,source:this.source.name,sourceId:this.source.id,score:candidateScore(a)}))
   .filter(a=>!isGenericPage(a.url,a.text))
   .sort((a,b)=>b.score-a.score);
 }
 async page(url){return this.technical.fetch(url)}
}
