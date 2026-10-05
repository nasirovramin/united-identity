import { WebSourceAdapter } from "./adapter.js";
export class PentagramAdapter extends WebSourceAdapter {
 discover(html,h){return super.discover(html,h).filter(x=>/\/work\//i.test(x.url)&&!/^work$/i.test(x.text||""))}
}
