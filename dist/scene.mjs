import { nearestPlot, WORLD, CROPS } from './engine.mjs';
import { fitWorld, screenToWorld } from './viewport.mjs';
import { createArt } from './art.mjs';
import { drawLandscape } from './landscape.mjs';

export function createRenderer(canvas, dock) {
  const ctx=canvas.getContext('2d');
  const art=createArt(ctx);
  const {rect,ellipse,poly,line,gradient,shadow}=art;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let game,view,clapFlash=0;

  // This is a cache of our own geometry, not an imported background image.
  // Buildings, crops, people, windmills, water movement and weather remain objects.
  const terrain=document.createElement('canvas');
  const terrainScale=1.5,terrainOrigin={x:-200,y:-120};
  terrain.width=2072*terrainScale;terrain.height=1220*terrainScale;
  const terrainCtx=terrain.getContext('2d');
  terrainCtx.scale(terrainScale,terrainScale);terrainCtx.translate(-terrainOrigin.x,-terrainOrigin.y);
  drawLandscape(terrainCtx);

  function resize() {
    const bounds=canvas.getBoundingClientRect();
    view={...fitWorld(bounds.width,bounds.height,dock.getBoundingClientRect().top),width:bounds.width,height:bounds.height,dpr:Math.min(window.devicePixelRatio||1,2)};
    canvas.width=Math.round(bounds.width*view.dpr);canvas.height=Math.round(bounds.height*view.dpr);
  }
  const observer=new ResizeObserver(resize);
  observer.observe(canvas);observer.observe(dock);window.addEventListener('resize',resize);resize();

  function skyAndGround(time,left,top,right,bottom) {
    rect(left,top,right-left,bottom-top,gradient(0,-150,0,290,[[0,'#65baf0'],[.65,'#a4d9ec'],[1,'#d5e7d7']]));
    rect(left,280,right-left,Math.max(0,bottom-280),gradient(0,280,0,1100,[[0,'#94bf50'],[.5,'#92bd48'],[1,'#80ad40']]));
    // Soft clouds, lit on top, frame the peaks rather than obscuring them.
    for(let i=0;i<8;i++){
      const x=-100+i*245+Math.sin(time*.025+i)*12,y=62+(i*31)%58;
      ellipse(x,y+8,58,11,'#b9dae5');ellipse(x-24,y,28,14,'#f5f8e9');ellipse(x+4,y-8,33,21,'#fcfbed');ellipse(x+36,y+1,28,13,'#edf4e6');ellipse(x+4,y+7,55,10,'#edf5e5');
    }
    rect(left,265,Math.max(0,100-left),Math.max(0,bottom-265),gradient(0,265,170,1000,[[0,'#309daf'],[.5,'#35b5bd'],[1,'#218f9f']]));
    ctx.drawImage(terrain,terrainOrigin.x,terrainOrigin.y,terrain.width/terrainScale,terrain.height/terrainScale);
    if(bottom>1098){
      poly([[left,1098],[158,1098],[170,1300],[137,bottom],[left,bottom]],'#dccb96');
      poly([[left,1098],[135,1098],[147,1300],[114,bottom],[left,bottom]],'#44bbc0');
      poly([[left,1098],[108,1098],[120,1300],[87,bottom],[left,bottom]],gradient(0,265,170,1000,[[0,'#309daf'],[.5,'#35b5bd'],[1,'#218f9f']]));
    }
    for(let i=0;i<14;i++){
      const x=10+(i*47)%120,y=330+i*40;
      line([[x+Math.sin(time+i)*3,y],[x+17+Math.sin(time+i)*3,y+1]],'#b9efe066',2);
    }
  }
  function plotOverlay(plot,time) {
    if(plot.crop){
      for(let row=0;row<2;row++)for(let col=0;col<3;col++){
        if(row*3+col>=Math.ceil(6*(1-plot.crowLoss/CROPS[plot.crop].yield)))continue;
        art.plant(plot.crop,plot.x+(col-1)*26+(row?3:0),plot.y-6+row*19,plot.growth,plot.health,time,game.stormActive?5:.75);
      }
      rect(plot.x-34,plot.y+31,68,5,'#574c31',3);
      rect(plot.x-34,plot.y+31,68*plot.growth,5,plot.growth>=1?'#f9dc7e':'#a9d75c',3);
      if(plot.health<90){rect(plot.x-30,plot.y+38,60,3,'#704a31');rect(plot.x-30,plot.y+38,.6*plot.health,3,'#e8a766');}
    }
    if(plot.protected){
        shadow(plot.x,plot.y+26,50,10,.15);
        line([[plot.x-45,plot.y+26],[plot.x-45,plot.y-21],[plot.x,plot.y-50],[plot.x+45,plot.y-21],[plot.x+45,plot.y+26]],'#a47f48',4);
        poly([[plot.x-48,plot.y-20],[plot.x,plot.y-51],[plot.x+48,plot.y-20],[plot.x+39,plot.y+3],[plot.x-39,plot.y+3]],'#779d8de0','#536e55',2);
        poly([[plot.x-48,plot.y-20],[plot.x,plot.y-51],[plot.x,plot.y+3],[plot.x-39,plot.y+3]],'#a3c3a8db');
        line([[plot.x,plot.y-50],[plot.x,plot.y+4]],'#e4e0b5',2);
    }
  }
  function birds(time) {
    if(!game.crows)return;
    const p=game.plots[game.crows.target];
    for(let i=0;i<3;i++){
      const x=p.x-27+i*26,y=p.y-39+Math.sin(time*4+i)*4;
      shadow(x,y+35,9,3,.12);ellipse(x,y,9,6,'#435052');ellipse(x+6,y-5,5,5,'#39454b');ellipse(x+8,y-6,1.2,1.2,'#f4e7c1');
      poly([[x+10,y-5],[x+17,y-2],[x+10,y-1]],'#cba55a');
      line([[x-3,y-1],[x-16,y-11+Math.sin(time*9+i)*6]],'#58626a',5);
    }
  }
  function weather(time,left,top,right,bottom) {
    const width=right-left,height=bottom-top;
    if(game.night){
      rect(left,top,width,height,'#243d6959');ellipse(1250,72,21,21,'#ffedbc');ellipse(1258,64,19,19,'#9db9c2');
      for(let i=0;i<23;i++)ellipse(155+i*63,22+(i*29)%95,1.6,1.6,'#fff1c9');
    }
    if(game.rain>.1||game.stormActive){
      rect(left,top,width,height,game.stormActive?'#2845536b':'#607f8b10');
      const drops=game.stormActive?180:Math.round(game.rain*110);
      for(let i=0;i<drops;i++){
        const x=(i*137+time*(game.stormActive?720:22))%1900-100,y=(i*83+time*400)%1100-50;
        line([[x,y],[x+(game.stormActive?32:3),y+19]],'#e3f4e282',1.6);
      }
    }
    if(game.stormActive){
      const t=reducedMotion.matches?0:game.stormElapsed,front=(t*230)%2300-450;
      rect(front-350,165,700,800,gradient(front-350,0,front+350,0,[[0,'#d5ede900'],[.5,'#cee4dc65'],[1,'#d5ede900']]));
      for(let i=0;i<36;i++){
        const y=210+(i*71)%680,x=(time*690+i*93)%1950-180;
        ctx.strokeStyle=i%2?'#f7f7d966':'#d3e6df99';ctx.lineWidth=i%3+1;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+65,y-25,x+120,y+18,x+215,y-8);ctx.stroke();
        if(i%3===0){ctx.save();ctx.translate(x+120,y);ctx.rotate(time*7+i);ellipse(0,0,7,3,'#cab76a');ctx.restore();}
      }
    }
    if(performance.now()<clapFlash){
      ctx.strokeStyle='#fff1b5';ctx.lineWidth=3;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(game.player.x,game.player.y-18,25+i*16,0,Math.PI*2);ctx.stroke();}
    }
    if(game.paused)rect(left,top,width,height,'#294c340c');
  }
  function draw(time) {
    ctx.setTransform(view.dpr,0,0,view.dpr,0,0);ctx.clearRect(0,0,view.width,view.height);
    ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
    const left=-view.x/view.scale-1,top=-view.y/view.scale-1;
    const right=(view.width-view.x)/view.scale+1,bottom=(view.height-view.y)/view.scale+1;
    skyAndGround(time,left,top,right,bottom);
    art.boatAndDock(time);
    art.windmill(411,270,time,game.windmills>0,0);
    art.windmill(540,270,time,game.windmills>1,1);
    art.windmill(665,270,time,game.windmills>2,2);
    art.building(864,345,'home');
    art.building(373,474,'lockedBlue');art.chain(373,433,94);
    art.building(1402,474,'lockedPurple');art.chain(1402,433,94);
    art.building(329,659,'market');
    art.building(1430,659,'bakery');if(!game.bakery)art.chain(1430,623,97);
    art.barrel(445,671,.85);art.crate(1360,723,.8,'bread');
    // Beds are constructed individually. Crops and the player share depth sorting.
    game.plots.forEach((plot,index)=>art.plotBed(plot,index));
    const selected=nearestPlot(game);
    if(selected>=0){
      const p=game.plots[selected];ctx.strokeStyle='#fff1ad';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(p.x,p.y+4,56,37,0,0,Math.PI*2);ctx.stroke();
    }
    if(game.target){ctx.strokeStyle='#fff2ba';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(game.target.x,game.target.y,12,6,0,0,Math.PI*2);ctx.stroke();}
    const objects=game.plots.filter(p=>p.crop||p.protected).map(p=>({y:p.y+15,draw:()=>plotOverlay(p,time)}));
    objects.push({y:game.player.y,draw:()=>art.farmer(game.player.x,game.player.y,time,game.player.moving)});
    objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
    // Match the shop's plot numbers, just inside the front stone border.
    ctx.save();
    ctx.font="bold 14px 'Trebuchet MS',sans-serif";ctx.textAlign='center';ctx.textBaseline='alphabetic';
    ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle='#64452d';ctx.fillStyle='#fff0c7';
    game.plots.forEach((plot,index)=>{
      const number=String(index+1);
      ctx.strokeText(number,plot.x,plot.y+23);ctx.fillText(number,plot.x,plot.y+23);
    });
    ctx.restore();
    birds(time);weather(time,left,top,right,bottom);
    ctx.restore();
  }
  return {
    render(state,time,flash){game=state;clapFlash=flash;draw(reducedMotion.matches?0:time);},
    position(x,y){return{x:view.x+x*view.scale,y:view.y+y*view.scale,scale:view.scale};},
    point(clientX,clientY){const b=canvas.getBoundingClientRect();return screenToWorld(clientX-b.left,clientY-b.top,view);}
  };
}
