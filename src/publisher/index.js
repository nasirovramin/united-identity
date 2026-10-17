import { TelegramPublisher } from "./telegram.js";

export class PublishModule {
  constructor(env){ this.telegram=new TelegramPublisher(env); }

  async publish(checked){
    if(!checked?.ok || !checked?.post) throw new Error("post_not_approved_by_check_module");
    return this.telegram.publish(checked.post);
  }
}
