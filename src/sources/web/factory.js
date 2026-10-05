import { WebSourceAdapter } from "./adapter.js";
import { WorldBrandDesignAdapter } from "./world-brand-design.js";
import { TheBrandIdentityAdapter } from "./the-brand-identity.js";
export function makeWebAdapter(source,technical){
 if(source.id==="world-brand-design") return new WorldBrandDesignAdapter(source,technical);
 if(source.id==="the-brandidentity") return new TheBrandIdentityAdapter(source,technical);
 return new WebSourceAdapter(source,technical);
}
