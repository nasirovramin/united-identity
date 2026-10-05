import { WebSourceAdapter } from "./adapter.js";
export class LandorAdapter extends WebSourceAdapter {
 discover(html,h){return super.discover(html,h).filter(x=>!/\/about|\/contact|\/careers|\/news/i.test(x.url))}
}
