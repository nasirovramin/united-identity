import { TechnicalChecker } from "./technical.js";
import { VisualChecker } from "./visual.js";
import { PostNormalizer } from "./normalizer.js";

export class CheckModule {
  constructor(options={}){
    this.technical=new TechnicalChecker();
    this.visual=new VisualChecker();
    this.normalizer=new PostNormalizer(options);
  }

  async process(packet){
    const technical=this.technical.check(packet);
    if(!technical.ok){
      return {ok:false,stage:"technical",technical,visual:null,post:null};
    }

    let post;
    try{
      post=await this.normalizer.prepare(packet);
    }catch(error){
      return {
        ok:false,
        stage:"prepare",
        technical,
        visual:null,
        post:null,
        errors:[String(error?.message||error)]
      };
    }

    const visual=this.visual.check(post);
    return {
      ok:visual.ok,
      stage:visual.ok?"ready":"visual",
      technical,
      visual,
      post:visual.ok?post:null
    };
  }
}
