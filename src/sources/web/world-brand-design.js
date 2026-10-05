import { WebSourceAdapter } from "./adapter.js";
export class WorldBrandDesignAdapter extends WebSourceAdapter {
 discover(html,helpers){
  return super.discover(html,helpers).filter(x=>/\/|brand|design|identity/i.test(x.url+" "+x.text));
 }
}
