export class TelegraphService {
  constructor(env){this.env=env}

  async createFromBlocks({title,blocks,sourceUrl,sourceName,agency}){
    const token=await this.getToken();
    const nodes=[];

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

    const body=new URLSearchParams({
      access_token:token,
      title:String(title||"United Identity").slice(0,250),
      author_name:"United Identity",
      content:JSON.stringify(nodes),
      return_content:"false"
    });

    const r=await fetch("https://api.telegra.ph/createPage",{method:"POST",body});
    const d=await r.json();
    if(!d.ok||!d.result?.url) throw new Error("Telegraph createPage failed: "+JSON.stringify(d));
    return d.result.url;
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
