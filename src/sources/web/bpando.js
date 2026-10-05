import { WebSourceAdapter } from "./adapter.js";
export class BpandoAdapter extends WebSourceAdapter {
 discover(html,h){return super.discover(html,h).filter(x=>!/about|contact|newsletter|category|tag/i.test(x.url))}
}
