import { WebSourceAdapter } from "./adapter.js";

const PROJECT_INDEX="https://the-brandidentity.com/search?filter=category%3AProject";

export class TheBrandIdentityAdapter extends WebSourceAdapter {
 // The Brand Identity has a dedicated Project index. Do not discover from the
 // homepage or other editorial/category pages.
 async home(){
  return this.technical.fetch(PROJECT_INDEX);
 }

 workSections(){
  return [{url:PROJECT_INDEX,text:"Projects"}];
 }

 discover(html,helpers,baseUrl=PROJECT_INDEX){
  return super.discover(html,helpers,baseUrl).filter(x=>{
   const u=new URL(x.url);
   if(u.pathname==="/search") return false;
   return !/\/shop\/|\/about\/|\/jobs\//i.test(u.pathname);
  });
 }
}
