// Clean buffer between source/control layer and publishing core.
export class CleanBuffer {
  constructor(env){this.env=env}
  async put(item){
    const id=item.id||crypto.randomUUID();
    const clean={...item,id,bufferedAt:new Date().toISOString(),status:"ready"};
    await this.env.IDENTITY_KV.put("buffer:ready:"+id,JSON.stringify(clean),{expirationTtl:60*60*24*7});
    return clean;
  }
  async reject(item,reasons=[]){
    const id=item?.id||crypto.randomUUID();
    await this.env.IDENTITY_KV.put("buffer:rejected:"+id,JSON.stringify({id,url:item?.url||"",reasons,at:new Date().toISOString()}),{expirationTtl:60*60*24*3});
  }
}
