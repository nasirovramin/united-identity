export class TelegramSourceAdapter {
 constructor(source,technical){this.source=source;this.technical=technical}
 async collect(){ throw Error("telegram_source_reader_not_configured"); }
 normalize(raw={}){return {sourceId:this.source.id,sourceType:"telegram",sourceName:this.source.name,sourceUrl:this.source.url,projectUrl:raw.url||this.source.url,title:raw.title||"",body:raw.body||raw.text||"",agency:raw.agency||"",date:raw.date||"",images:raw.images||[],richMedia:raw.richMedia||[]};}
}
