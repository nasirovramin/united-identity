// Base adapter contract. Source-specific adapters can override discovery/extraction without touching the core.
export class GenericWebAdapter {
  constructor(source,technical){this.source=source;this.technical=technical}
  async load(){return this.technical.fetch(this.source.url)}
  normalize(raw){
    return {sourceId:this.source.id,source:this.source.name,url:raw.url,title:raw.title||"",description:raw.description||"",text:raw.text||"",images:raw.images||[],video:raw.video||[],agency:raw.agency||"",date:raw.date||""};
  }
}
