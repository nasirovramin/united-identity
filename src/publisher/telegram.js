export class TelegramPublisher {
  constructor(env){ this.env=env; }

  async publish(post){
    if(!this.env?.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN_missing");
    if(!this.env?.TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID_missing");
    if(post.detailsUrl && !/^https:\/\/telegra\.ph\//i.test(post.detailsUrl)){
      throw new Error("details_must_be_telegraph");
    }

    const caption=buildCaption(post);
    const media=(post.media||[]).filter(x=>x&&/^https?:\/\//i.test(x.url||""));
    if(!media.length) throw new Error("publish_media_missing");

    if(post.detailsUrl){
      const hero=media.find(x=>x.type==="image"||x.type==="gif")||media[0];
      return this.sendSingle(hero,caption);
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

  return [
    "🎬 <b>"+esc(post.title)+"</b>",
    ...(post.paragraphs||[]).slice(0,2).map(x=>esc(x)),
    post.agency?"<b>Agentlik:</b> "+esc(post.agency):"",
    post.hashtag||"#visualidentity",
    bottom
  ].filter(Boolean).join("\n\n");
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
