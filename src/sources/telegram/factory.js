import { LS_ArtDirectionAdapter } from "./ls-artdirection.js";
import { Leonid_Slavin_HSE_ArtDirectionAdapter } from "./leonid-slavin-hse-artdirection.js";
import { morrre_dsgnAdapter } from "./morrre-dsgn.js";
import { designsniperAdapter } from "./designsniper.js";
import { fourdesignAdapter } from "./fourdesign.js";
import { graphicstoryAdapter } from "./graphicstory.js";
import { dsgngoodAdapter } from "./dsgngood.js";
import { designpubAdapter } from "./designpub.js";
import { paradigm_graphicsAdapter } from "./paradigm-graphics.js";
import { DSGN_reviewAdapter } from "./dsgn-review.js";
import { mozhnoAdapter } from "./mozhno.js";
import { naukadsgnAdapter } from "./naukadsgn.js";

export function makeTelegramAdapter(source,technical){
 if(source.name==="LS_ArtDirection") return new LS_ArtDirectionAdapter(source,technical);
 if(source.name==="Leonid_Slavin_HSE_ArtDirection") return new Leonid_Slavin_HSE_ArtDirectionAdapter(source,technical);
 if(source.name==="morrre_dsgn") return new morrre_dsgnAdapter(source,technical);
 if(source.name==="designsniper") return new designsniperAdapter(source,technical);
 if(source.name==="fourdesign") return new fourdesignAdapter(source,technical);
 if(source.name==="graphicstory") return new graphicstoryAdapter(source,technical);
 if(source.name==="dsgngood") return new dsgngoodAdapter(source,technical);
 if(source.name==="designpub") return new designpubAdapter(source,technical);
 if(source.name==="paradigm_graphics") return new paradigm_graphicsAdapter(source,technical);
 if(source.name==="DSGN_review") return new DSGN_reviewAdapter(source,technical);
 if(source.name==="mozhno") return new mozhnoAdapter(source,technical);
 if(source.name==="naukadsgn") return new naukadsgnAdapter(source,technical);
 throw Error("unknown_telegram_source:"+source.id);
}
