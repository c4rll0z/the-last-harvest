// Shared hosted request handling. The build embeds policy and assets, never secrets.
export function validateSnapshot(value, policy) {
  function clean(v,s) {
    if(s==='bool'){if(typeof v!=='boolean')throw Error('invalid');return v;}
    if(Array.isArray(s)){if(typeof v!=='number'||!Number.isFinite(v)||v<s[0]||v>s[1])throw Error('invalid');return v;}
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error('invalid');
    return Object.fromEntries(Object.entries(s).map(([k,t])=>[k,clean(v[k],t)]));
  }
  const result=clean(value,policy.schema);
  if(!Array.isArray(value.plots)||value.plots.length>24)throw Error('invalid');
  result.plots=value.plots.map(p=>{
    if(![null,'lettuce','wheat','berries','corn','tomatoes'].includes(p.crop))throw Error('invalid');
    return {...clean(p,{number:[1,24],growth:[0,100],moisture:[0,100],health:[0,100],sheltered:'bool',stormSafe:'bool'}),crop:p.crop};
  });
  const quests=['firstHarvest','firstSale','firstPlot','firstStore','crowPatrol','berryHarvest','berryCentury'];
  if(!Array.isArray(value.readyQuests)||value.readyQuests.length>7||value.readyQuests.some(q=>!quests.includes(q)))throw Error('invalid');
  result.readyQuests=value.readyQuests;
  return result;
}
export function responsePayload(snapshot,topic,policy,model=policy.model) {
  return {model,instructions:policy.instructions,input:JSON.stringify({topic,snapshot}),
    store:false,reasoning:{effort:'none'},max_output_tokens:150,
    text:{format:{type:'json_schema',name:'farmer_caren',strict:true,schema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}}};
}
export function extractAdvice(data) {
  if(data.status!=='completed')throw Error('incomplete');
  const output=data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  const text=JSON.parse(output).text;
  if(typeof text!=='string'||!text.trim()||text.length>260)throw Error('invalid');
  return text.trim();
}
export function createAdviceHandler(policy,fetcher=fetch) {
  const usage=new Map();
  const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  return async(request,env)=>{
    if(request.method!=='POST')return json(405,{source:'builtin'});
    const url=new URL(request.url),origin=request.headers.get('origin');
    if(origin!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))return json(403,{source:'builtin'});
    // The private Sites access boundary authenticates visitors. Do not expose this route publicly.
    if(!env.OPENAI_API_KEY)return json(200,{source:'builtin'});
    if(Number(request.headers.get('content-length'))>12000)return json(413,{source:'builtin'});
    let body,snapshot;
    try {
      const reader=request.body.getReader();let bytes=0,chunks=[];
      while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>12000){await reader.cancel();return json(413,{source:'builtin'});}chunks.push(value);}
      const raw=new Uint8Array(bytes);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
      body=JSON.parse(new TextDecoder().decode(raw));snapshot=validateSnapshot(body.snapshot,policy);
      if(!policy.topics.includes(body.topic))throw Error('invalid');
    }catch{return json(400,{source:'builtin'});}
    if(snapshot.storm||snapshot.warning||snapshot.crowPlot)return json(200,{source:'builtin'});
    const now=Date.now(),id=request.headers.get('oai-authenticated-user-id')||'owner-private';
    for(const [k,v] of usage)if(now-v.start>=3600000)usage.delete(k);
    const u=usage.get(id)||{start:now,last:0,count:0};
    if(now-u.last<15000||u.count>=60)return json(429,{source:'builtin'});
    u.last=now;u.count++;usage.set(id,u);
    try {
      const result=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(responsePayload(snapshot,body.topic,policy,env.OPENAI_MODEL||policy.model)),signal:AbortSignal.timeout(5500)});
      if(!result.ok)throw Error('upstream');
      return json(200,{source:'ai',text:extractAdvice(await result.json())});
    }catch{return json(200,{source:'builtin'});}
  };
}
