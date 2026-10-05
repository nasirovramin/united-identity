import { WebSourceAdapter } from "./adapter.js";
export class DixonBaxiAdapter extends WebSourceAdapter {
 discover(html,h){return super.discover(html,h).filter(x=>/case-study|work|project/i.test(x.url+" "+x.text))}
}
