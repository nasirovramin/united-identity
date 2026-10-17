export class TelegraphService {
  constructor(env){this.env=env}

  async createFromBlocks({title,blocks,sourceUrl,sourceName,agency}){
    const token=await this.getToken();
    const nodes=[];

    // Keep the public Telegraph URL short and ASCII-safe. The full Azerbaijani
    // headline is rendered inside the article so the visible content stays correct.
    nodes.push({tag:"h3",children:[String(title||"United Identity")]});

    if(agency){
      nodes.push({tag:"p",children:[{tag:"strong",children:["Agentlik: "]},agency]});
      nodes.push({tag:"hr"});
    }

    for(const block of blocks||[]){
      if(block.type==="text"){
        nodes.push({tag:block.tag==="blockquote"?"blockquote":"p",children:[block.text]});
      }else if(block.type==="image"||block.type==="gif"){
        nodes.push({tag:"figure",children:[{tag:"img",attrs:{src:block.url}}]});
      }else if(block.type==="video"){
        nodes.push({tag:"figure",children:[{tag:"video",attrs:{src:block.url}}]});
      }else if(block.type==="iframe"){
        nodes.push({tag:"figure",children:[{tag:"iframe",attrs:{src:block.url}}]});
      }
    }

    nodes.push({tag:"hr"});
    nodes.push({tag:"p",children:[{tag:"a",attrs:{href:sourceUrl},children:["Mənbə: "+sourceName]}]});

    const pageTitle=asciiTitle(title);
    const url=await createPage(token,pageTitle,nodes);

    // Validate the actual public page before giving the URL to Telegram.
    // If the generated page is not publicly readable, retry once with the
    // shortest possible title to avoid slug/path edge cases.
    if(await pageReadable(url)) return url;

    const fallback=await createPage(token,"United Identity Case Study",nodes);
    if(await pageReadable(fallback)) return fallback;

    throw new Error("Telegraph page created but public page is not readable");
  }

  async getToken(){
    let token=await this.env.IDENTITY_KV?.get("telegraph:access_token");
    if(token) return token;

    const body=new URLSearchParams({
      short_name:"UnitedIdentity",
      author_name:"United Identity"
    });
    const r=await fetch("https://api.telegra.ph/createAccount",{method:"POST",body});
    const d=await r.json();
    if(!d.ok||!d.result?.access_token) throw new Error("Telegraph account failed");
    token=d.result.access_token;
    await this.env.IDENTITY_KV?.put("telegraph:access_token",token);
    return token;
  }
}

async function createPage(token,title,nodes){
  const body=new URLSearchParams({
    access_token:token,
    title:String(title||"United Identity").slice(0,120),
    author_name:"United Identity",
    content:JSON.stringify(nodes),
    return_content:"false"
  });

  const r=await fetch("https://api.telegra.ph/createPage",{method:"POST",body});
  const d=await r.json();
  if(!d.ok||!d.result?.url) throw new Error("Telegraph createPage failed: "+JSON.stringify(d));
  return d.result.url;
}

async function pageReadable(url){
  try{
    const r=await fetch(url,{
      redirect:"follow",
      headers:{
        "User-Agent":"Mozilla/5.0 (compatible; UnitedIdentity/1.0)",
        "Accept":"text/html,application/xhtml+xml"
      }
    });
    if(!r.ok) return false;
    const html=await r.text();
    return html.length>300 && /<article|tl_article|page_header|telegraph/i.test(html);
  }catch{
    return false;
  }
}

function asciiTitle(value=""){
  let s=String(value||"United Identity")
    .replace(/[Əə]/g,m=>m==="Ə"?"E":"e")
    .replace(/[Ğğ]/g,m=>m==="Ğ"?"G":"g")
    .replace(/[Çç]/g,m=>m==="Ç"?"C":"c")
    .replace(/[Şş]/g,m=>m==="Ş"?"S":"s")
    .replace(/[Öö]/g,m=>m==="Ö"?"O":"o")
    .replace(/[Üü]/g,m=>m==="Ü"?"U":"u")
    .replace(/[İı]/g,m=>m==="İ"?"I":"i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^\x20-\x7E]/g," ")
    .replace(/\s+/g," ")
    .trim();
  if(!s) s="United Identity Case Study";
  return s.slice(0,90);
}

