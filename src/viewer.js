const TELEGRAPH_API="https://api.telegra.ph/getPage/";

function html(body,{status=200,headers={}}={}){
  return new Response(body,{
    status,
    headers:{
      "content-type":"text/html;charset=UTF-8",
      "x-content-type-options":"nosniff",
      "referrer-policy":"no-referrer-when-downgrade",
      "content-security-policy":"default-src 'none'; img-src https: data:; media-src https:; frame-src https:; style-src 'unsafe-inline'; font-src https: data:; connect-src https:; base-uri 'none'; form-action 'none'; frame-ancestors *",
      ...headers
    }
  });
}

function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{"content-type":"application/json;charset=UTF-8"}
  });
}

export default {
  async fetch(req){
    const url=new URL(req.url);

    if(url.pathname==="/health"){
      return json({
        ok:true,
        service:"United Identity Article Viewer",
        storage:"none",
        backend:"Telegraph API"
      });
    }

    if(url.pathname==="/"||url.pathname===""){
      return html(shell("United Identity","Məqalə linki yanlışdır."));
    }

    if(!url.pathname.startsWith("/article/")){
      return html(shell("404","Səhifə tapılmadı."),{status:404});
    }

    const encoded=url.pathname.slice("/article/".length);
    let path="";
    try{ path=decodeURIComponent(encoded); }
    catch{ return html(shell("400","Məqalə linki düzgün deyil."),{status:400}); }

    if(!validPath(path)){
      return html(shell("400","Məqalə linki düzgün deyil."),{status:400});
    }

    const api=TELEGRAPH_API+encodeURIComponent(path)+"?return_content=true";
    let data;
    try{
      const r=await fetch(api,{
        headers:{
          "User-Agent":"Mozilla/5.0 (compatible; UnitedIdentityViewer/1.0)",
          "Accept":"application/json"
        }
      });
      if(!r.ok) throw new Error("Telegraph API HTTP "+r.status);
      data=await r.json();
    }catch{
      return html(shell("Məqalə açıla bilmədi","Telegraph məzmununa hazırda çıxış mümkün deyil."),{status:502});
    }

    if(!data?.ok||!data.result?.content){
      return html(shell("Məqalə tapılmadı","Telegraph məqaləsi mövcud deyil və ya silinib."),{status:404});
    }

    const page=data.result;
    const article=renderNodes(page.content);
    const title=visibleTitle(page.content)||page.title||"United Identity";
    const backUrl=safeBackUrl(url.searchParams.get("back"));

    return html(documentPage({
      title,
      author:page.author_name||"United Identity",
      article,
      backUrl
    }),{
      headers:{"cache-control":"public, max-age=300"}
    });
  }
};

function validPath(path){
  return path.length>0 && path.length<512 && !path.includes("..") && !/[?#]/.test(path);
}

function visibleTitle(nodes){
  for(const n of nodes||[]){
    if(n&&typeof n==="object"&&["h3","h4"].includes(n.tag)){
      const t=textContent(n).trim();
      if(t) return t;
    }
  }
  return "";
}

function textContent(node){
  if(typeof node==="string") return node;
  if(!node||typeof node!=="object") return "";
  return (node.children||[]).map(textContent).join("");
}

function renderNodes(nodes){
  return (nodes||[]).map(renderNode).join("");
}

function renderNode(node){
  if(typeof node==="string") return esc(node);
  if(!node||typeof node!=="object") return "";

  const tag=String(node.tag||"").toLowerCase();
  const children=renderNodes(node.children||[]);
  const attrs=node.attrs||{};

  switch(tag){
    case "p": return "<p>"+children+"</p>";
    case "h3": return "<h1>"+children+"</h1>";
    case "h4": return "<h2>"+children+"</h2>";
    case "strong": return "<strong>"+children+"</strong>";
    case "em": return "<em>"+children+"</em>";
    case "blockquote": return "<blockquote>"+children+"</blockquote>";
    case "hr": return "<hr>";
    case "br": return "<br>";
    case "figure": return "<figure>"+children+"</figure>";
    case "figcaption": return "<figcaption>"+children+"</figcaption>";
    case "a": {
      const label=textContent(node).trim();
      if(/^Mənbə:/i.test(label)) return "";
      const href=safeUrl(attrs.href);
      return href
        ?'<a href="'+escAttr(href)+'" target="_blank" rel="noopener noreferrer">'+children+"</a>"
        :children;
    }
    case "img": {
      const src=safeUrl(attrs.src);
      return src?'<img src="'+escAttr(src)+'" loading="lazy" alt="">':"";
    }
    case "video": {
      const src=safeUrl(attrs.src);
      return src?'<video src="'+escAttr(src)+'" controls playsinline preload="metadata"></video>':"";
    }
    case "iframe": {
      const src=safeUrl(attrs.src);
      return src?'<div class="embed"><iframe src="'+escAttr(src)+'" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>':"";
    }
    default:
      return children;
  }
}

function safeBackUrl(value){
  if(!value) return "";
  try{
    const u=new URL(String(value));
    if(u.protocol!=="https:"||u.hostname!=="t.me") return "";
    if(!/^\/c\/\d+\/\d+$/.test(u.pathname) && !/^\/[A-Za-z0-9_]{5,}\/\d+$/.test(u.pathname)) return "";
    return u.toString();
  }catch{return ""}
}

function safeUrl(value){
  try{
    const u=new URL(String(value||""));
    return /^https?:$/.test(u.protocol)?u.toString():"";
  }catch{return ""}
}

function documentPage({title,author,article,backUrl=""}){
  return '<!doctype html><html lang="az"><head>'+
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="color-scheme" content="light">'+
    '<title>'+esc(title)+'</title>'+
    '<style>'+
    'html{background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}'+
    'body{margin:0}main{width:min(820px,calc(100% - 32px));margin:0 auto;padding:42px 0 72px}'+
    '.brand{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777;margin-bottom:32px}'+
    'h1{font-size:clamp(30px,6vw,54px);line-height:1.02;letter-spacing:-.035em;margin:0 0 26px}'+
    'h2{font-size:24px;line-height:1.2;margin:36px 0 14px}'+
    'p,blockquote{font-size:18px;line-height:1.62;margin:0 0 24px}'+
    'blockquote{border-left:3px solid #111;padding-left:18px}'+
    'figure{margin:34px 0}img,video{display:block;width:100%;height:auto;border-radius:2px}'+
    '.embed{position:relative;width:100%;aspect-ratio:16/9}.embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}'+
    'figcaption{font-size:13px;line-height:1.4;color:#777;margin-top:8px}hr{border:0;border-top:1px solid #ddd;margin:38px 0}'+
    'a{color:inherit;text-decoration:underline;text-underline-offset:3px}'+
    '.author{font-size:13px;color:#777;margin-top:-14px;margin-bottom:32px}'+
    '.back{margin-top:42px;padding-top:22px;border-top:1px solid #ddd;font-size:16px;font-weight:600}'+
    '@media(max-width:560px){main{width:min(100% - 22px,820px);padding-top:24px}p,blockquote{font-size:17px}figure{margin:26px 0}}'+
    '</style></head><body><main><div class="brand">United Identity</div>'+
    (author?'<div class="author">'+esc(author)+'</div>':"")+
    '<article>'+article+'</article>'+
    (backUrl?'<div class="back"><a href="'+escAttr(backUrl)+'">← Kanala geri qayıt</a></div>':"")+
    '</main></body></html>';
}

function shell(title,message){
  return documentPage({
    title,
    author:"",
    article:"<h1>"+esc(title)+"</h1><p>"+esc(message)+"</p>"
  });
}

function esc(value=""){
  return String(value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function escAttr(value=""){
  return esc(value).replace(/"/g,"&quot;");
}
