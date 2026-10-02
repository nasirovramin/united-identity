// United Identity — LinkedIn source module
// Separate from the normal website crawler.
// Reads only the public LinkedIn sources explicitly approved by the user.

export const LINKEDIN_SOURCES = [
  { name: "Outstanding Branding", url: "https://www.linkedin.com/company/0utstanding-branding/posts/?feedView=all" },
  { name: "The Brand Identity", url: "https://www.linkedin.com/company/the-brand-identity-group-ltd/posts/?feedView=all" },
  { name: "Boundless Brand Design", url: "https://www.linkedin.com/company/boundless-brand-design/posts/?feedView=all" },
  { name: "Big Brand Theory India", url: "https://www.linkedin.com/company/bigbrandtheoryindia/posts/?feedView=all" },
  { name: "Mother Design", url: "https://www.linkedin.com/company/mother-design/posts/?feedView=all" },
  { name: "Beautiful Branding", url: "https://www.linkedin.com/company/beautiful-branding/posts/?feedView=all" },
  { name: "Grapheine", url: "https://www.linkedin.com/company/grapheine/posts/?feedView=all" }
];

const IDENTITY_TERMS = [
  "brand identity","visual identity","branding","rebrand","rebranding",
  "brand system","visual system","visual communication","brand design",
  "identity system","identity","айдентика","фирменный стиль",
  "визуальная идентичность","брендинг","ребрендинг","бренд-система",
  "система бренда","визуальная система","визуальная коммуникация","бренд-дизайн"
];

const REJECT_TERMS = [
  "hiring","we are hiring","job opening","vacancy","apply now",
  "webinar","podcast","interview","newsletter","shop","mockup","template",
  "вакансия","ищем дизайнера","подкаст","интервью"
];

export function isIdentityLinkedInPost(text="") {
  const t = text.toLowerCase().replace(/\s+/g," ").trim();
  if (!t) return false;
  if (REJECT_TERMS.some(x => t.includes(x))) return false;
  return IDENTITY_TERMS.some(x => t.includes(x));
}

export function extractExternalCaseStudyLinks(html="") {
  const out=[];
  const re=/https?:\\?\/\\?\/[^"'<>\\s]+/gi;
  for (const raw of html.match(re)||[]) {
    const url=raw.replace(/\\\//g,"/").replace(/&amp;/g,"&");
    if (/linkedin\.com|licdn\.com/i.test(url)) continue;
    if (/case|project|work|identity|brand|t-bi\.link|lnkd\.in/i.test(url)) out.push(url);
  }
  return [...new Set(out)];
}

export async function scanLinkedInPublicSources() {
  // Discovery-only/test mode. LinkedIn can vary what it exposes to anonymous requests.
  // Never auto-publish from this function; candidates must pass the main United Identity pipeline.
  const result={module:"linkedin",mode:"test",sources:[],candidates:[]};
  for (const source of LINKEDIN_SOURCES) {
    try {
      const r=await fetch(source.url,{headers:{
        "User-Agent":"Mozilla/5.0 (compatible; UnitedIdentityBot/1.0)",
        "Accept":"text/html,application/xhtml+xml"
      },redirect:"follow"});
      const html=await r.text();
      const plain=html.replace(/<script\\b[\\s\\S]*?<\\/script>/gi," ")
        .replace(/<style\\b[\\s\\S]*?<\\/style>/gi," ")
        .replace(/<[^>]+>/g," ").replace(/&amp;/g,"&")
        .replace(/&#39;/g,"'").replace(/&quot;/g,'"')
        .replace(/\\s+/g," ").trim();
      result.sources.push({name:source.name,status:r.status,read:r.ok,size:html.length});
      if (r.ok && isIdentityLinkedInPost(plain)) {
        result.candidates.push({
          source:source.name,
          sourceUrl:source.url,
          caseStudyLinks:extractExternalCaseStudyLinks(html).slice(0,10)
        });
      }
    } catch(e) {
      result.sources.push({name:source.name,read:false,error:String(e)});
    }
  }
  return result;
}
