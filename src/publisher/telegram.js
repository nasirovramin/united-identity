export class TelegramPublisher {
  constructor(env){ this.env=env; }

  async publish(post){
    if(!this.env?.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN_missing");
    if(!this.env?.TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID_missing");
    if(post.detailsUrl && !isDetailsUrl(post.detailsUrl)){
      throw new Error("details_link_invalid");
    }

    const caption=buildCaption(post);
    const media=(post.media||[]).filter(x=>x&&/^https?:\/\//i.test(x.url||""));
    if(!media.length) throw new Error("publish_media_missing");

    if(post.detailsUrl){
      const hero=media.find(x=>x.type==="image"||x.type==="gif")||media[0];
      const sent=await this.sendSingle(hero,caption);
      const finalDetails=viewerWithBack(post.detailsUrl,this.env.TELEGRAM_CHAT_ID,sent.message_id);
      if(finalDetails!==post.detailsUrl){
        const finalCaption=buildCaption({...post,detailsUrl:finalDetails});
        await callTelegram(this.env.TELEGRAM_BOT_TOKEN,"editMessageCaption",{
          chat_id:this.env.TELEGRAM_CHAT_ID,
          message_id:sent.message_id,
          caption:finalCaption,
          parse_mode:"HTML"
        });
      }
      return {...sent,detailsUrl:finalDetails};
    }

    return this.sendAlbum(media.slice(0,10),caption);
  }

  async sendSingle(asset,caption){
    const method=asset.type==="video"?"sendVideo":"sendPhoto";
    const field=asset.type==="video"?"video":"photo";
    const payload={
      chat_id:this.env.TELEGRAM_CHAT_ID,
      [field]:asset.url,
      caption,
      parse_mode:"HTML"
    };
    return callTelegram(this.env.TELEGRAM_BOT_TOKEN,method,payload);
  }

  async sendAlbum(media,caption){
    if(media.length===1) return this.sendSingle(media[0],caption);
    const items=media.map((x,i)=>({
      type:x.type==="video"?"video":"photo",
      media:x.url,
      ...(i===0?{caption,parse_mode:"HTML"}:{})
    }));
    return callTelegram(this.env.TELEGRAM_BOT_TOKEN,"sendMediaGroup",{
      chat_id:this.env.TELEGRAM_CHAT_ID,
      media:items
    });
  }
}

function buildCaption(post){
  const bottom=[
    post.detailsUrl?'<a href="'+esc(post.detailsUrl)+'">Ətraflı</a>':"",
    '<a href="'+esc(post.sourceUrl)+'">Mənbə: '+esc(post.sourceName)+'</a>'
  ].filter(Boolean).join("     ");

  const title=shorten(post.title,180);
  const paragraphs=(post.paragraphs||[])
    .slice(0,2)
    .map(x=>shorten(x,250))
    .filter(Boolean);

  return [
    "🎬 <b>"+esc(title)+"</b>",
    ...paragraphs.map(x=>esc(x)),
    post.agency?"<b>Agentlik:</b> "+esc(shorten(post.agency,100)):"",
    post.hashtag||"#visualidentity",
    bottom
  ].filter(Boolean).join("\n\n");
}

function shorten(value="",limit=250){
  const s=String(value).replace(/\s+/g," ").trim();
  if(s.length<=limit) return s;
  const cut=s.slice(0,limit-1);
  const at=cut.lastIndexOf(" ");
  return (at>limit*0.65?cut.slice(0,at):cut).trim()+"…";
}

async function callTelegram(token,method,payload){
  const r=await fetch("https://api.telegram.org/bot"+token+"/"+method,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(payload)
  });
  const data=await r.json();
  if(!data.ok) throw new Error("Telegram "+method+": "+JSON.stringify(data));
  return data.result;
}

function esc(value=""){
  return String(value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function isDetailsUrl(value=""){
  return /^https:\/\/(?:telegra\.ph\/|united-identity-viewer\.nasirovramin\.workers\.dev\/article\/)/i.test(String(value));
}

function viewerWithBack(detailsUrl,chatId,messageId){
  try{
    const u=new URL(String(detailsUrl||""));
    if(u.hostname!=="united-identity-viewer.nasirovramin.workers.dev") return detailsUrl;
    const cid=String(chatId||"").replace(/^-100/,"");
    if(!/^\d+$/.test(cid)||!/^\d+$/.test(String(messageId||""))) return detailsUrl;
    u.searchParams.set("back","https://t.me/c/"+cid+"/"+messageId);
    return u.toString();
  }catch{return detailsUrl}
}
