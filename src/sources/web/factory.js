import { PentagramAdapter } from "./pentagram.js";
import { LandorAdapter } from "./landor.js";
import { DixonBaxiAdapter } from "./dixonbaxi.js";
import { PlenumAdapter } from "./plenum.js";
import { BpandoAdapter } from "./bpando.js";
import { WebSourceAdapter } from "./adapter.js";
import { WorldBrandDesignAdapter } from "./world-brand-design.js";
import { TheBrandIdentityAdapter } from "./the-brand-identity.js";
export function makeWebAdapter(source,technical){
 if(source.id==="pentagram") return new PentagramAdapter(source,technical);
 if(source.id==="landor") return new LandorAdapter(source,technical);
 if(source.id==="dixonbaxi") return new DixonBaxiAdapter(source,technical);
 if(source.id==="plenum") return new PlenumAdapter(source,technical);
 if(source.id==="bpando") return new BpandoAdapter(source,technical);
 if(source.id==="world-brand-design") return new WorldBrandDesignAdapter(source,technical);
 if(source.id==="the-brandidentity") return new TheBrandIdentityAdapter(source,technical);
 return new WebSourceAdapter(source,technical);
}
