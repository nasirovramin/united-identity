import { WebSourceAdapter } from "./adapter.js";
export class PlenumAdapter extends WebSourceAdapter {
 discover(html,h){return super.discover(html,h).filter(x=>!/contact|about|career|vacanc/i.test(x.url))}
}
