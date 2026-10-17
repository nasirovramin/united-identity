// Unified contract for every individual source module.
//
// A source module must return one or more packets in this shape:
// {
//   source: { id, name, type: "web"|"telegram", url },
//   item: {
//     canonicalUrl,
//     titleOriginal,
//     textOriginal,
//     agency,
//     media: [{ type:"image"|"video"|"gif", url }],
//     hasCaseStudy,
//     caseStudyText,
//     caseStudyMedia
//   }
// }
//
// Translation and final presentation are not published directly by a source.
// They pass through the Check Module first.
export class SourceModule {
  constructor(config){ this.config=config; }
  async scan(){ throw new Error("scan() must be implemented by the individual source module"); }
}
