import { farmSnapshot, chooseAdvice } from './ghost.mjs';

export function createGhost(getGame) {
  const root=document.getElementById('ghost'), bubble=document.getElementById('ghost-bubble');
  const words=document.getElementById('ghost-words'), source=document.getElementById('ghost-source');
  const ask=document.getElementById('ghost-ask'), dismiss=document.getElementById('ghost-dismiss');
  let run=null, seen=new Map(), shown=null, last=-100, until=0, request=null, generation=0;
  let calls=0, lastRequest=-100, nextJoke=48, jokeIndex=0, auto=true, urgentKey='';
  const cancel=()=>{generation++;request?.abort();request=null;};
  function show(tip,label='Built-in tip') {
    shown=tip;words.textContent=tip.text;source.textContent=label;
    root.classList.toggle('urgent',tip.urgent);bubble.hidden=false;
    const g=getGame();last=g.elapsed;until=g.elapsed+(tip.urgent?12:14);seen.set(tip.id,g.elapsed);
    document.getElementById('ghost-alert').textContent=tip.urgent?tip.text:'';
  }
  function reset(g) {
    cancel();run=g;seen=new Map();shown=null;last=-100;until=0;calls=0;lastRequest=-100;
    nextJoke=48;jokeIndex=0;urgentKey='';bubble.hidden=true;root.hidden=true;
  }
  async function speak(manual=false,joke=false,intro=false) {
    const g=getGame(), snapshot=farmSnapshot(g), tip=chooseAdvice(snapshot,{joke,intro,variant:jokeIndex});
    cancel();show(tip);if(joke)jokeIndex++;
    if(tip.urgent||calls>=10||g.elapsed-lastRequest<15) return;
    calls++;lastRequest=g.elapsed;request=new AbortController();const controller=request, token=generation;
    source.textContent='Built-in tip · Caren is thinking…';
    const timeout=setTimeout(()=>controller.abort(),6500);
    try {
      const res=await fetch('/api/advice',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({snapshot,topic:tip.id}),signal:controller.signal});
      if(!res.ok)throw Error('Unavailable');
      const data=await res.json(), current=getGame();
      // A delayed answer must never overwrite a new warning, dismissed bubble or new run.
      const nowTip=chooseAdvice(farmSnapshot(current),{joke,intro,variant:(jokeIndex+3)%4});
      if(generation!==token||current!==g||!current.running||current.paused||current.finished||nowTip.id!==tip.id||nowTip.text!==tip.text||nowTip.urgent)return;
      if(data.source==='ai'&&typeof data.text==='string'&&data.text.trim()&&data.text.length<=260){
        show({...tip,text:data.text},'AI dialogue · GPT-6 Luna');
      }else source.textContent='Built-in tip';
    } catch {if(generation===token)source.textContent='Built-in tip · AI unavailable';}
    finally {clearTimeout(timeout);if(generation===token){request=null;if(source.textContent.includes('thinking'))source.textContent='Built-in tip';}}
  }
  ask.onclick=()=>{const g=getGame();if(g.running&&!g.paused&&!g.finished)speak(true);};
  dismiss.onclick=()=>{cancel();bubble.hidden=true;until=0;ask.focus();};
  const toggle=document.getElementById('ghost-auto');
  toggle.onchange=()=>{auto=toggle.checked;};
  return {reset:()=>reset(getGame()), tick(){
    const g=getGame();if(run!==g)reset(g);
    root.hidden=!g.running||g.finished;
    ask.disabled=g.paused||!!request||g.elapsed-last<3;
    if(!g.running||g.finished){cancel();return;}
    if(g.paused){if(request){cancel();source.textContent='Built-in tip';}return;}
    const snapshot=farmSnapshot(g), tip=chooseAdvice(snapshot);
    const key=tip.urgent?`${tip.id}:${snapshot.crowPlot}`:'';
    const elapsedSince=g.elapsed-(seen.get(tip.id)??-100);
    if(tip.urgent&&(key!==urgentKey||elapsedSince>=18)){
      cancel();show(tip,'Farm alert · built-in');urgentKey=key;return;
    }
    if(!tip.urgent&&urgentKey){urgentKey='';cancel();bubble.hidden=true;last=g.elapsed-15;}
    if(shown?.urgent&&shown.id!==tip.id){bubble.hidden=true;cancel();}
    if(g.elapsed>until)bubble.hidden=true;
    if(!auto||tip.urgent)return;
    if(!seen.has('intro')&&g.elapsed<5){speak(false,false,true);return;}
    if(request||g.elapsed-last<24)return;
    const joke=g.elapsed>=nextJoke&&!['dry','wet','hot','cold','refill'].includes(tip.id);
    if(joke){nextJoke=g.elapsed+55;speak(false,true);}
    else if(elapsedSince>=55)speak();
  }};
}
