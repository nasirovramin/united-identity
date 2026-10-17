import { SourceModule } from "./base.js";

const FEATURES_URL="https://the-brandidentity.com/features";
const HOST="the-brandidentity.com";

export class TheBrandIdentitySource extends SourceModule {
  constructor(){
    super({
      id:"the-brand-identity",
      name:"The Brand Identity",
      type:"web",
      url:FEATURES_URL
    });
  }

  async scan(){
    const html=await fetchHtml(FEATURES_URL);
    const projects=discoverProjectLinks(html);
    return projects.map(x=>({
      source:{...this.config},
      item:{
        canonicalUrl:x.url,
        titleOriginal:x.title||"",
        textOriginal:"",
        agency:"",
        media:x.image?[{type:"image",url:x.image}]:[],
        hasCaseStudy:true,
        caseStudyText:"",
        caseStudyMedia:[],
        cardImage:x.image||""
      }
    }));
  }

  async readArticle(url){
    if(!isAllowedProjectUrl(url)) throw new Error("invalid_the_brand_identity_project_url");
    const html=await fetchHtml(url);
    return parseArticle(html,url,this.config);
  }
}

function discoverProjectLinks(html){
  const out=[];
  const seen=new Set();
  const re=/<a\b[^>]*href=["']([^"']*\/project\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const url=absolute(m[1],FEATURES_URL);
    if(!isAllowedProjectUrl(url)||seen.has(url)) continue;
    seen.add(url);
    const inner=m[2]||"";
    const image=extractImageFromFragment(inner,url);
    const title=cleanText(inner.replace(/<img\b[^>]*>/gi," "));
    out.push({url,title,image});
  }

  // Some cards use nested clickable layers. Fall back to all project hrefs,
  // preserving document order.
  if(!out.length){
    const hrefRe=/href=["']([^"']*\/project\/[^"']+)["']/gi;
    while((m=hrefRe.exec(html))){
      const url=absolute(m[1],FEATURES_URL);
      if(!isAllowedProjectUrl(url)||seen.has(url)) continue;
      seen.add(url);
      out.push({url,title:"",image:""});
    }
  }
  return out;
}

export function parseArticle(html,url,source){
  const scope=articleScope(html);
  const title=
    meta(html,"og:title")||
    textOfFirst(scope,"h1")||
    "";

  const hero=
    absolute(meta(html,"og:image"),url)||
    firstImage(scope,url)||
    "";

  const orderedBlocks=extractOrderedBlocks(scope,url,title);
  const textBlocks=orderedBlocks.filter(x=>x.type==="text").map(x=>x.text);
  const mediaBlocks=orderedBlocks.filter(x=>x.type!=="text");

  // This source does not show an Agentlik line in the Telegram post.
  const agency="";
  const summarySource=textBlocks.slice(0,2).join("\n\n");

  return {
    source:{...source},
    item:{
      canonicalUrl:url,
      titleOriginal:cleanTitle(title),
      textOriginal:summarySource,
      agency,
      media:hero?[{type:"image",url:hero}]:mediaBlocks.slice(0,1),
      hasCaseStudy:true,
      caseStudyBlocks:orderedBlocks,
      caseStudyText:textBlocks.join("\n\n"),
      caseStudyMedia:mediaBlocks
    }
  };
}

function extractOrderedBlocks(scope,url,title){
  const blocks=[];
  const re=/<(p|h2|h3|blockquote|li|img|video|iframe|source)\b([^>]*)>([\s\S]*?)(?:<\/\1>|(?=<(?:p|h2|h3|blockquote|li|img|video|iframe|source)\b)|$)/gi;
  let m;
  while((m=re.exec(scope))){
    const tag=m[1].toLowerCase();
    const attrs=m[2]||"";
    const body=m[3]||"";

    if(["p","h2","h3","blockquote","li"].includes(tag)){
      const text=cleanText(body);
      if(!text||text.length<8) continue;
      if(isNoise(text,title)) continue;
      blocks.push({type:"text",tag,text});
      continue;
    }

    const src=pickAttr(attrs,["data-full-src","data-src","data-lazy-src","src"]);
    if(!src) continue;
    const mediaUrl=absolute(src,url);
    if(!/^https?:\/\//i.test(mediaUrl)) continue;

    if(tag==="img"){
      if(isUiImage(mediaUrl)) continue;
      blocks.push({type:isGif(mediaUrl)?"gif":"image",url:mediaUrl});
    }else if(tag==="iframe"){
      blocks.push({type:"iframe",url:mediaUrl});
    }else{
      blocks.push({type:"video",url:mediaUrl});
    }
  }

  // De-duplicate exact consecutive assets/text while keeping original order.
  const out=[];
  let previous="";
  for(const b of blocks){
    const key=b.type==="text"?"text|"+b.text:b.type+"|"+b.url;
    if(key===previous) continue;
    previous=key;
    out.push(b);
  }
  return out;
}

function articleScope(html){
  let s=String(html||"")
    .replace(/<script\b[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[\s\S]*?<\/style>/gi," ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi," ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi," ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi," ");

  const article=s.match(/<article\b[^>]*>[\s\S]*?<\/article>/i);
  if(article) return article[0];
  const main=s.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  return main?main[0]:s;
}

function extractAgency(scope,text){
  const table=scope.match(/<td[^>]*>\s*Design\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if(table){
    const v=cleanText(table[1]);
    if(v) return v;
  }

  const patterns=[
    /(?:design and technology agency|design agency|branding agency|creative agency|studio)\s+([A-Z][A-Za-z0-9&.'’+\- ]{1,70})\s+(?:was|were|has|have|created|designed|developed)/,
    /(?:designed|created|developed|crafted|commissioned)\s+by\s+([A-Z][A-Za-z0-9&.'’+\- ]{1,70})/i
  ];
  for(const p of patterns){
    const m=text.match(p);
    if(m) return m[1].trim().replace(/[.,;:]+$/,"");
  }
  return "";
}

function isNoise(text,title){
  const t=text.trim();
  if(!t) return true;
  if(title && t===cleanTitle(title)) return true;
  return /^(Date|Words|Share|Graphics|Social|Info|Help|Get featured|Free products|Accept|Read more)$/i.test(t)||
    /cookie|all images ©|legal terms|newsletter|subscribe|share on/i.test(t);
}

function isUiImage(url){
  return /logo-elements|texture-studies|sonictextures|paintedfire|icon|avatar|favicon/i.test(url);
}

function isAllowedProjectUrl(value){
  try{
    const u=new URL(value);
    return u.hostname===HOST && u.pathname.startsWith("/project/");
  }catch{return false}
}

function extractImageFromFragment(fragment,base){
  const m=fragment.match(/<img\b[^>]*(?:data-full-src|data-src|src)=["']([^"']+)["']/i);
  return m?absolute(m[1],base):"";
}

function firstImage(scope,base){
  const m=scope.match(/<img\b[^>]*(?:data-full-src|data-src|src)=["']([^"']+)["']/i);
  return m?absolute(m[1],base):"";
}

function textOfFirst(scope,tag){
  const m=scope.match(new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/"+tag+">","i"));
  return m?cleanText(m[1]):"";
}

function meta(html,key){
  const escaped=key.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
  const a=new RegExp('<meta[^>]*(?:property|name)=["\\\']'+escaped+'["\\\'][^>]*content=["\\\']([^"\\\']+)["\\\']','i');
  const b=new RegExp('<meta[^>]*content=["\\\']([^"\\\']+)["\\\'][^>]*(?:property|name)=["\\\']'+escaped+'["\\\']','i');
  const m=html.match(a)||html.match(b);
  return m?decode(m[1]):"";
}

function pickAttr(attrs,names){
  for(const name of names){
    const m=attrs.match(new RegExp("\\b"+name+"=[\"']([^\"']+)[\"']","i"));
    if(m) return decode(m[1]);
  }
  return "";
}

function cleanTitle(value=""){
  return cleanText(value)
    .replace(/\s+[—|-]\s+The Brand Identity.*$/i,"")
    .trim();
}

function cleanText(value=""){
  return decode(String(value))
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/[ \t]+/g," ")
    .replace(/\s*\n\s*/g,"\n")
    .trim();
}

function decode(value=""){
  return String(value)
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&nbsp;/gi," ")
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
}

function absolute(value,base){
  if(!value) return "";
  try{return new URL(decode(value),base).toString()}catch{return ""}
}

function isGif(url=""){return /\.gif(?:$|[?#])/i.test(url)}

async function fetchHtml(url){
  const r=await fetch(url,{
    redirect:"follow",
    headers:{
      "User-Agent":"Mozilla/5.0 (compatible; UnitedIdentity/1.0)",
      "Accept":"text/html,application/xhtml+xml",
      "Accept-Language":"en-US,en;q=0.9"
    }
  });
  if(!r.ok) throw new Error("The Brand Identity HTTP "+r.status);
  const text=await r.text();
  if(text.length<500) throw new Error("The Brand Identity response too small");
  return text;
}
