import snapshot from "../generated/the-brand-identity-snapshot.js";
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
    if(Array.isArray(snapshot.items) && snapshot.items.length){
      return snapshot.items.map(item=>({
        source:{...this.config},
        item:{...item}
      }));
    }

    const doc=await fetchDocument(FEATURES_URL);
    const projects=doc.kind==="markdown"
      ?discoverProjectLinksMarkdown(doc.text)
      :discoverProjectLinks(doc.text);

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

    const cached=(snapshot.items||[]).find(x=>x.canonicalUrl===url);
    if(cached) return {source:{...this.config},item:sanitizeCaseStudyItem(cached)};

    const doc=await fetchDocument(url);
    return doc.kind==="markdown"
      ?parseMarkdownArticle(doc.text,url,this.config)
      :parseArticle(doc.text,url,this.config);
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


export function discoverProjectLinksMarkdown(markdown){
  const out=[];
  const seen=new Set();
  const body=stripReaderPreamble(markdown);
  const re=/\((https:\/\/the-brandidentity\.com\/project\/[^)\s]+)\)/gi;
  let m;
  while((m=re.exec(body))){
    const url=cleanReaderUrl(m[1]);
    if(!isAllowedProjectUrl(url)||seen.has(url)) continue;
    seen.add(url);

    const start=Math.max(0,m.index-900);
    const context=body.slice(start,m.index+200);
    const images=[...context.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
    const image=images.length?cleanReaderUrl(images[images.length-1][1]):"";
    const headings=[...context.matchAll(/#{3,6}\s+([^\n#]+)/g)];
    const title=headings.length?cleanText(headings[headings.length-1][1]):"";
    out.push({url,title,image});
  }
  return out;
}

export function parseMarkdownArticle(markdown,url,source){
  const body=stripReaderPreamble(markdown);
  const lines=body.split(/\r?\n/);
  const blocks=[];
  const seenMedia=new Set();
  let title="";
  let stop=false;

  for(const raw of lines){
    const line=raw.trim();
    if(!line) continue;

    if(!title){
      const h=line.match(/^#\s+(.+)$/);
      if(h){
        title=cleanTitle(markdownText(h[1]));
        continue;
      }
    }

    if(/^(Graphics|Social|Info|Help|Get featured|Free products \+ inbox insights)$/i.test(markdownText(line))){
      stop=true;
    }
    if(stop) break;

    const media=extractMarkdownMedia(line,url);
    for(const asset of media){
      if(!asset.url||seenMedia.has(asset.url)||isUiImage(asset.url)) continue;
      seenMedia.add(asset.url);
      blocks.push(asset);
    }

    let text=markdownText(line);
    if(!text||text.length<8||isNoise(text,title)) continue;
    if(/^#{1,6}\s*/.test(line)) text=text.replace(/^#+\s*/,"");
    if(/^(Date|Words|\d+ min read|Share)$/i.test(text)) continue;
    if(/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}$/.test(text)) continue;
    if(/^\+\d+\)?$/.test(text)) continue;
    if(text.length<80 && !/[.!?]["'’”)]?$/.test(text) && /^[A-Z0-9& +\-–—]+$/.test(text)) continue;

    blocks.push({
      type:"text",
      tag:/^>/.test(line)?"blockquote":"p",
      text
    });
  }

  if(!title){
    const t=markdown.match(/^Title:\s*(.+)$/mi);
    title=t?cleanTitle(t[1]):"";
  }

  const cleanBlocks=trimProjectBlocks(blocks);
  const textBlocks=cleanBlocks.filter(x=>x.type==="text").map(x=>x.text);
  const mediaBlocks=cleanBlocks.filter(x=>x.type!=="text");
  const hero=mediaBlocks.find(x=>x.type==="image"||x.type==="gif")?.url||"";

  return {
    source:{...source},
    item:{
      canonicalUrl:url,
      titleOriginal:title,
      textOriginal:textBlocks.slice(0,2).join("\n\n"),
      agency:"",
      media:hero?[{type:"image",url:hero}]:mediaBlocks.slice(0,1),
      hasCaseStudy:true,
      caseStudyBlocks:cleanBlocks,
      caseStudyText:textBlocks.join("\n\n"),
      caseStudyMedia:mediaBlocks
    }
  };
}

function extractMarkdownMedia(line,base){
  const out=[];

  for(const m of line.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)){
    const u=cleanReaderUrl(m[1],base);
    if(u&&looksLikeMedia(u)){
      out.push({type:videoUrl(u)?"video":(isGif(u)?"gif":"image"),url:u});
    }
  }

  for(const m of line.matchAll(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)){
    const u=cleanReaderUrl(m[1],base);
    if(!u) continue;
    if(videoUrl(u)) out.push({type:/youtube|youtu\.be|vimeo/i.test(u)?"iframe":"video",url:u});
    else if(looksLikeMedia(u)) out.push({type:isGif(u)?"gif":"image",url:u});
  }

  for(const m of line.matchAll(/https?:\/\/[^\s)]+/g)){
    const u=cleanReaderUrl(m[0],base);
    if(!u) continue;
    if(videoUrl(u)) out.push({type:/youtube|youtu\.be|vimeo/i.test(u)?"iframe":"video",url:u});
    else if(looksLikeMedia(u)) out.push({type:isGif(u)?"gif":"image",url:u});
  }

  return out;
}

function markdownText(value=""){
  return cleanText(
    String(value)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g," ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
      .replace(/^>\s*/,"")
      .replace(/^#{1,6}\s*/,"")
      .replace(/[*_~]+/g,"")
  );
}

function stripReaderPreamble(value=""){
  const s=String(value||"");
  const marker="Markdown Content:";
  const i=s.indexOf(marker);
  return i>=0?s.slice(i+marker.length).trim():s;
}

function cleanReaderUrl(value,base="https://the-brandidentity.com/"){
  let s=decode(String(value||"").trim());
  s=s.replace(/%20\d+(?:w|x)(?=$|[?#])/i,"");
  s=s.replace(/\s+\d+(?:w|x)$/i,"");
  try{return new URL(s,base).toString()}catch{return ""}
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

  const orderedBlocks=trimProjectBlocks(extractOrderedBlocks(scope,url,title));
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

function sanitizeCaseStudyItem(item){
  const cleanBlocks=trimProjectBlocks(Array.isArray(item?.caseStudyBlocks)?item.caseStudyBlocks:[]);
  const textBlocks=cleanBlocks.filter(x=>x.type==="text").map(x=>x.text);
  const mediaBlocks=cleanBlocks.filter(x=>x.type!=="text");

  return {
    ...item,
    caseStudyBlocks:cleanBlocks,
    caseStudyText:textBlocks.join("\n\n"),
    caseStudyMedia:mediaBlocks
  };
}

function trimProjectBlocks(blocks=[]){
  let out=[...blocks];

  // The Brand Identity appends store/product cards after each editorial case study.
  // Those assets are not part of the project and must never enter Telegraph/Viewer.
  const productIndex=out.findIndex(x=>
    x?.type!=="text" &&
    /\/uploads\/(?:cache\/)?products\//i.test(String(x?.url||""))
  );
  if(productIndex>=0) out=out.slice(0,productIndex);

  // Immediately before the store cards the site places short credit/link labels
  // (studio/font names). Keep the actual final editorial paragraph, but drop this tail.
  while(out.length){
    const last=out[out.length-1];
    if(last?.type!=="text") break;
    const t=String(last.text||"").trim();
    if(t.length>=80) break;
    out.pop();
  }

  return out;
}

function extractOrderedBlocks(scope,url,title){
  const blocks=[];
  const seenMedia=new Set();
  const tokenRe=/<(p|h2|h3|blockquote|li)\b[^>]*>[\s\S]*?<\/\1>|<(img|video|iframe|source|picture)\b[^>]*>[\s\S]*?(?:<\/\2>)?|<(img|video|iframe|source)\b[^>]*\/?>/gi;
  let m;

  while((m=tokenRe.exec(scope))){
    const token=m[0]||"";
    const tag=(m[1]||m[2]||m[3]||"").toLowerCase();

    if(["p","h2","h3","blockquote","li"].includes(tag)){
      const text=cleanText(token);
      if(!text||text.length<8||isNoise(text,title)) continue;
      blocks.push({type:"text",tag,text});
      continue;
    }

    const assets=mediaFromToken(token,url);
    for(const asset of assets){
      if(!asset.url||seenMedia.has(asset.url)||isUiImage(asset.url)) continue;
      seenMedia.add(asset.url);
      blocks.push(asset);
    }
  }

  // Some site builds keep lazy assets only in data-* or inline style attributes.
  // Sweep the article HTML after the ordered pass so no case-study visual is lost.
  for(const asset of sweepMedia(scope,url)){
    if(!asset.url||seenMedia.has(asset.url)||isUiImage(asset.url)) continue;
    seenMedia.add(asset.url);
    blocks.push(asset);
  }

  return blocks;
}

function mediaFromToken(token,base){
  const out=[];
  const lower=token.toLowerCase();

  // iframe / embedded video
  if(/^<iframe\b/i.test(token)){
    const src=pickAttr(token,["data-src","src"]);
    const u=absolute(src,base);
    if(u) out.push({type:"iframe",url:u});
    return out;
  }

  // video element: poster first, then every source URL
  if(/^<video\b/i.test(token)){
    const poster=pickAttr(token,["poster","data-poster"]);
    const pu=absolute(poster,base);
    if(pu) out.push({type:"image",url:pu});

    const direct=pickAttr(token,["data-src","src"]);
    const du=absolute(direct,base);
    if(du) out.push({type:"video",url:du});

    for(const sm of token.matchAll(/<source\b[^>]*>/gi)){
      const src=bestMediaAttr(sm[0]);
      const u=absolute(src,base);
      if(u) out.push({type:"video",url:u});
    }
    return out;
  }

  // picture/source can expose responsive images only via srcset/data-srcset.
  if(/^<picture\b/i.test(token)||/^<source\b/i.test(token)){
    const candidates=[];
    for(const mm of token.matchAll(/<(?:source|img)\b[^>]*>/gi)){
      const src=bestMediaAttr(mm[0]);
      const u=absolute(src,base);
      if(u) candidates.push(u);
    }
    const u=candidates[candidates.length-1];
    if(u) out.push({type:isGif(u)?"gif":"image",url:u});
    return out;
  }

  // img + lazy-loading variants.
  if(/^<img\b/i.test(token)){
    const src=bestMediaAttr(token);
    const u=absolute(src,base);
    if(u) out.push({type:isGif(u)?"gif":"image",url:u});
  }

  return out;
}

function sweepMedia(scope,base){
  const out=[];

  // Explicit media/lazy attributes.
  const attrRe=/\b(?:src|data-src|data-lazy-src|data-full-src|poster|data-poster)=["']([^"']+)["']/gi;
  for(const m of scope.matchAll(attrRe)){
    const u=absolute(m[1],base);
    if(!u||!looksLikeMedia(u)) continue;
    out.push({type:videoUrl(u)?"video":(isGif(u)?"gif":"image"),url:u});
  }

  // Responsive srcset/data-srcset. Keep the largest/final candidate.
  const setRe=/\b(?:srcset|data-srcset)=["']([^"']+)["']/gi;
  for(const m of scope.matchAll(setRe)){
    const u=absolute(lastSrcsetUrl(m[1]),base);
    if(!u) continue;
    out.push({type:videoUrl(u)?"video":(isGif(u)?"gif":"image"),url:u});
  }

  // CSS/background and common data-video attributes.
  const bgRe=/(?:background-image\s*:\s*url\(|data-(?:video|media|image|poster)(?:-src)?=["'])([^"'\)]+)(?:\)|["'])/gi;
  for(const m of scope.matchAll(bgRe)){
    const u=absolute(m[1],base);
    if(!u||!looksLikeMedia(u)) continue;
    out.push({type:videoUrl(u)?"video":(isGif(u)?"gif":"image"),url:u});
  }

  // Embedded players such as Vimeo/YouTube are part of the case study too.
  const iframeRe=/<iframe\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/gi;
  for(const m of scope.matchAll(iframeRe)){
    const u=absolute(m[1],base);
    if(u) out.push({type:"iframe",url:u});
  }

  return out;
}

function bestMediaAttr(tag){
  const direct=pickAttr(tag,["data-full-src","data-original","data-lazy-src","data-src","src"]);
  const set=pickAttr(tag,["data-srcset","srcset"]);
  return lastSrcsetUrl(set)||direct;
}

function lastSrcsetUrl(value=""){
  const parts=String(value).split(",").map(x=>x.trim()).filter(Boolean);
  if(!parts.length) return "";
  return parts[parts.length-1].split(/\s+/)[0]||"";
}

function looksLikeMedia(u=""){
  return /\.(?:webp|avif|jpe?g|png|gif|svg|mp4|webm|mov)(?:$|[?#])/i.test(u)||
    /(?:image|video|media|cdn|cloudinary|vimeo|youtube)/i.test(u);
}

function videoUrl(u=""){
  return /\.(?:mp4|webm|mov)(?:$|[?#])/i.test(u)||/(?:vimeo\.com|youtube\.com|youtu\.be)/i.test(u);
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

async function fetchDocument(url){
  const direct=await fetch(url,{
    redirect:"follow",
    headers:{
      "User-Agent":"Mozilla/5.0 (compatible; UnitedIdentity/1.0)",
      "Accept":"text/html,application/xhtml+xml",
      "Accept-Language":"en-US,en;q=0.9"
    }
  });

  if(direct.ok){
    const text=await direct.text();
    if(text.length>=500) return {kind:"html",text,transport:"direct"};
  }

  const readerUrl="https://r.jina.ai/"+url;
  const reader=await fetch(readerUrl,{
    redirect:"follow",
    headers:{
      "User-Agent":"Mozilla/5.0 (compatible; UnitedIdentity/1.0)",
      "Accept":"text/plain"
    }
  });
  if(!reader.ok){
    throw new Error("The Brand Identity direct HTTP "+direct.status+"; reader HTTP "+reader.status);
  }
  const text=await reader.text();
  if(text.length<500) throw new Error("The Brand Identity reader response too small");
  return {kind:"markdown",text,transport:"public-reader"};
}
