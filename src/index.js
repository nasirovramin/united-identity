function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{"content-type":"application/json;charset=UTF-8"}
  });
}

export default {
  async fetch(req){
    const path=new URL(req.url).pathname;

    if(path==="/health"){
      return json({
        ok:true,
        status:"source_layer_empty",
        webSources:0,
        telegramSources:0,
        linkedinSources:0,
        automaticScanning:false,
        publishing:false
      });
    }

    if(path==="/sources"){
      return json({
        web:[],
        telegram:[],
        linkedin:[]
      });
    }

    return new Response(
      "United Identity mənbə sistemi sıfırlanıb. Hazırda heç bir mənbə qoşulu deyil.",
      {headers:{"content-type":"text/plain;charset=UTF-8"}}
    );
  }
};
