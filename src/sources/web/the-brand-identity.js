import { WebSourceAdapter } from "./adapter.js";
export class TheBrandIdentityAdapter extends WebSourceAdapter {
 discover(html,helpers){
  return super.discover(html,helpers).filter(x=>!/\/shop\/|\/about\/|\/jobs\//i.test(x.url));
 }
}
