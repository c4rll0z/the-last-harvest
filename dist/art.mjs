// Original, code-drawn farm objects. The visual reference is not loaded by the game.
// All objects use the same low-angle projection, warm outlines, upper-left light,
// shaded right faces and soft ground shadows.
export function createArt(ctx) {
  const P = {
    grass: '#8dbe48', darkGrass: '#6b9f3c', lightGrass: '#abd15a',
    outline: '#705535', stone: '#cfbd92', stoneTop: '#f2dfb3', stoneSide: '#a48e68',
    wood: '#9a6638', woodLight: '#d49b57', woodDark: '#71502f', cream: '#fff0c7',
  };
  function rect(x,y,w,h,color,r=0) {
    ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill();
  }
  function ellipse(x,y,rx,ry,color) {
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
  }
  function poly(points,color,stroke=null,width=2) {
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke();}
  }
  function line(points,color,width=2) {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
  }
  function text(value,x,y,size=12,color=P.outline) {
    ctx.font=`bold ${size}px 'Trebuchet MS',sans-serif`;ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(value,x,y);
  }
  function gradient(x,y,x2,y2,colors) {
    const g=ctx.createLinearGradient(x,y,x2,y2);colors.forEach(([stop,color])=>g.addColorStop(stop,color));return g;
  }
  function shadow(x,y,rx,ry,alpha=.16) {ellipse(x+9,y+7,rx,ry,`rgba(42,74,34,${alpha})`);}
  function stone(x,y,w=24,h=13,variation=0) {
    rect(x,y+5,w,h,P.stoneSide,4);rect(x,y,w,h,variation%2?'#d9c79f':P.stone,4);
    rect(x+2,y+1,w-4,h*.42,variation%2?'#f0dfb9':P.stoneTop,3);
    line([[x+3,y+h-2],[x+w-3,y+h-2]],'#b9a278',1);
  }
  function path(points,width=38) {
    line(points,'#6d913a',width+8);line(points,'#b49a70',width+3);line(points,'#e3cba0',width);
    for(let j=1;j<points.length;j++){
      const [ax,ay]=points[j-1],[bx,by]=points[j],dist=Math.hypot(bx-ax,by-ay),steps=Math.ceil(dist/18);
      const nx=-(by-ay)/dist,ny=(bx-ax)/dist;
      for(let i=0;i<steps;i++){
        const t=(i+.5)/steps,x=ax+(bx-ax)*t,y=ay+(by-ay)*t;
        for(let lane=-1;lane<=1;lane++){
          const ox=x+nx*lane*width*.27,oy=y+ny*lane*width*.27;
          ctx.save();ctx.translate(ox,oy);ctx.rotate(Math.atan2(by-ay,bx-ax));
          rect(-7,-width*.11,14,width*.23,(i+lane+j)%3?'#eedbb7':'#dbc297',3);
          line([[-5,-width*.09],[5,-width*.09]],'#fff0d0',1);ctx.restore();
        }
      }
    }
  }
  function wall(points) {
    for(let j=1;j<points.length;j++){
      const [ax,ay]=points[j-1],[bx,by]=points[j],steps=Math.ceil(Math.hypot(bx-ax,by-ay)/24);
      for(let i=0;i<steps;i++){
        const x=ax+(bx-ax)*i/steps,y=ay+(by-ay)*i/steps;
        stone(x-13,y-8,27,15,i);stone(x-13,y-21,27,14,i+1);
      }
    }
  }
  function pillar(x,y) {
    shadow(x,y,20,8);rect(x-13,y-39,26,43,'#b5a785',4);rect(x-13,y-39,17,42,'#e4d7b5',4);
    stone(x-17,y-47,34,13,0);ellipse(x,y-52,11,10,'#fbefd0');ellipse(x+4,y-49,7,6,'#ddd0af');
  }
  function flower(x,y,color='#fff2ca',s=1) {
    line([[x,y+4],[x,y-4]],'#5b8b36',s);for(let i=0;i<5;i++)ellipse(x+Math.cos(i*1.256)*3*s,y-4+Math.sin(i*1.256)*2.4*s,2.2*s,2*s,color);ellipse(x,y-4,1.7*s,1.7*s,'#efbe42');
  }
  function shrub(x,y,s=1,flowers=false) {
    shadow(x,y,24*s,8*s,.12);ellipse(x-12*s,y-8*s,16*s,13*s,'#4b8539');ellipse(x+9*s,y-10*s,20*s,15*s,'#6c9e38');ellipse(x-2*s,y-19*s,17*s,12*s,'#9ac347');
    if(flowers)for(let i=0;i<5;i++)flower(x+(i*13%33-16)*s,y-(i*7%20)*s,i%2?'#ffe9be':'#eaa08c',s*.8);
  }
  function tree(x,y,s=1,pine=false,time=0) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);shadow(0,0,40,14);
    const sway=Math.sin(time*1.6+x)*1.2;
    poly([[-9,0],[-5,-72],[8,-72],[13,1]],'#8e6237',P.woodDark,2);
    line([[-3,-5],[-1,-64]],'#bd8950',3);
    line([[2,-36],[-22,-62]],'#986b3b',7);line([[2,-51],[25,-77]],'#986b3b',7);
    ctx.translate(sway,0);
    if(pine){
      for(let i=0;i<3;i++){
        const yy=-38-i*27,w=43-i*9;
        poly([[-w,yy],[0,yy-66],[w,yy],[10,yy+7]],i===0?'#41804b':i===1?'#529154':'#67a25e','#396747',2);
        poly([[-w+5,yy-2],[0,yy-62],[0,yy+2]],i===0?'#61a25b':i===1?'#78b166':'#94c178');
      }
    }else{
      ellipse(-22,-65,33,34,'#487e33');ellipse(25,-65,33,37,'#487e33');ellipse(0,-91,44,36,'#578d30');
      ellipse(-24,-78,31,30,'#80ae37');ellipse(23,-86,31,29,'#75a42e');ellipse(0,-106,32,25,'#a7c747');
      ellipse(-17,-100,20,15,'#bed95b');ellipse(30,-72,15,14,'#9fc449');ellipse(0,-69,27,19,'#81ad36');
      for(const [a,b] of [[-36,-76],[-21,-94],[14,-105],[34,-78],[-4,-67]]){ellipse(a,b,5,3,'#d4df75');}
      if(Math.round(x)%3===0)for(const [a,b] of [[-29,-69],[19,-94],[32,-60],[-2,-80]]){ellipse(a,b,5,5,'#edba42');ellipse(a-1,b-2,2,2,'#ffe88c');}
    }
    ctx.restore();
  }
  function rock(x,y,s=1) {
    shadow(x,y,20*s,6*s);poly([[x-23*s,y],[x-14*s,y-17*s],[x+4*s,y-24*s],[x+22*s,y-8*s],[x+19*s,y+4*s],[x-9*s,y+6*s]],'#a7b6a2','#748b7d',2);
    poly([[x-23*s,y],[x-14*s,y-17*s],[x+4*s,y-24*s],[x+1*s,y-4*s]],'#d3d5b8');poly([[x+1*s,y-4*s],[x+4*s,y-24*s],[x+22*s,y-8*s],[x+19*s,y+4*s]],'#91a396');
  }
  function barrel(x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);shadow(0,0,17,6);
    rect(-15,-34,30,33,'#ab743b',6);rect(-11,-33,7,31,'#d99d51',3);
    for(const dx of [-7,0,7])line([[dx,-29],[dx,0]],'#885e32',1);
    ellipse(0,-33,15,5,'#e1ac61');ellipse(0,-33,11,3,'#9c743e');
    rect(-15,-25,30,4,'#686c5b',1);rect(-15,-8,30,4,'#686c5b',1);ctx.restore();
  }
  function crate(x,y,s=1,produce='lettuce') {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);shadow(0,0,22,6);
    poly([[-22,-16],[12,-16],[23,-10],[23,9],[-22,9]],'#a16e3b',P.woodDark,1.5);
    poly([[-22,-16],[12,-16],[23,-10],[-10,-10]],'#d3a15b');
    rect(-20,-7,32,13,'#c08a48',1);line([[-18,0],[11,0]],'#eac07c',2);
    for(let i=0;i<4;i++){const xx=-13+i*9;ellipse(xx,-14,6,6,produce==='bread'?'#e9b45c':produce==='tomatoes'?'#de7441':'#86ad3e');ellipse(xx-1,-16,3,2,produce==='bread'?'#ffe2a1':'#c4d967');}
    ctx.restore();
  }
  function windowPane(x,y,w=25,h=31,arched=true) {
    rect(x-3,y-3,w+6,h+6,'#b87d41',arched?[13,13,3,3]:3);
    rect(x,y,w,h,gradient(x,y,x+w,y+h,[[0,'#8fd9e5'],[1,'#458995']]),arched?[10,10,1,1]:1);
    line([[x+3,y+7],[x+w-4,y+3]],'#d2f4e9',2);rect(x+w/2-1,y,3,h,'#ffe7b4');rect(x,y+h*.5,w,3,'#ffe7b4');
    rect(x-5,y+h+1,w+10,5,'#fff0cf',2);
  }
  function roof(x,y,w,h,palette) {
    const [light,mid,dark]=palette;
    // Gable front and receding right roof plane give every building the same depth.
    const ridge=[x-w*.04,y-h],right=[x+w*.59,y+4],backRidge=[x+w*.13,y-h-12];
    poly([[x-w*.59,y+4],ridge,[x+w*.43,y+4]],mid,P.outline,3);
    poly([ridge,backRidge,[x+w*.64,y-8],right,[x+w*.43,y+4]],dark,P.outline,3);
    poly([[x-w*.56,y],ridge,[x-w*.02,y-h+9],[x-w*.43,y+1]],light);
    for(let row=1;row<5;row++){
      const yy=y-h+row*h/5,half=(row/5)*w*.52;
      line([[x-w*.04-half,yy],[x-w*.04+half*.88,yy]],dark,2);
      for(let col=0;col<row+1;col++){
        const xx=x-w*.04-half+(col+.45)*2*half/(row+1);
        line([[xx,yy],[xx+5,yy+h/6]],'#fff1cb38',2);
      }
    }
    line([[x-w*.6,y+5],[x+w*.44,y+5]],'#fff0c5',5);
    line([[x+w*.44,y+5],[x+w*.64,y-7]],'#d4b381',4);
    line([[x-w*.6,y+10],[x+w*.44,y+10]],'#7c5231',4);
  }
  function building(x,y,kind='market') {
    const home=kind==='home',locked=kind==='lockedBlue'||kind==='lockedPurple';
    const w=home?155:150,h=home?119:118,xx=x-w/2,roofY=y-h;
    shadow(x+10,y+5,w*.72,20);
    // Foundation top and its two shaded faces.
    poly([[xx-14,y-12],[x+w*.56,y-12],[x+w*.7,y+1],[x+w*.52,y+12],[xx-20,y+12]],'#a6a081');
    rect(xx-16,y-6,w+31,13,'#d1bd8f',4);rect(xx-16,y-6,w+31,5,'#f1deb2',3);
    rect(xx,roofY,w,h,gradient(xx,roofY,xx+w,y,[[0,'#fff0c6'],[.72,'#ebc987'],[1,'#d9ae6c']]),5);
    poly([[xx+w,roofY],[xx+w+22,roofY-10],[xx+w+22,y-8],[xx+w,y]],'#c99b5c',P.outline,2);
    for(let yy=roofY+19;yy<y-8;yy+=22){line([[xx+3,yy],[xx+w-3,yy]],'#d5b277',1);}
    rect(xx+5,roofY,8,h,'#be8548',2);rect(xx+w-13,roofY,8,h,'#ad773f',2);
    const palette=kind==='lockedBlue'?['#6bbde1','#3e8fbb','#326d9a']:kind==='lockedPurple'?['#b79bd5','#9270b9','#6d5594']:['#f39b50','#dc7141','#ad4e32'];
    rect(x+w*.26,roofY-48,18,42,'#bd9676',2);rect(x+w*.26-3,roofY-51,24,8,'#f2dcc0',2);
    roof(x,roofY-1,w+13,home?65:57,palette);
    poly([[x-30,roofY+1],[x,roofY-29],[x+32,roofY+1]],'#ffe7ad','#bb8046',2);
    windowPane(x-10,roofY-20,21,23);
    if(locked){
      rect(xx+24,roofY+33,w-48,h-34,'#785135',4);rect(xx+28,roofY+37,w-56,h-41,'#ba8249',3);
      for(let i=1;i<7;i++)line([[xx+28+i*(w-56)/7,roofY+38],[xx+28+i*(w-56)/7,y-6]],'#996534',2);
      line([[xx+28,roofY+39],[xx+w-28,y-8]],'#e1ad68',7);line([[xx+w-28,roofY+39],[xx+28,y-8]],'#e1ad68',7);
      rect(x-2,roofY+37,4,h-40,'#7b542f');
    } else if(home){
      rect(x-20,y-65,40,65,'#be8243',[21,21,0,0]);rect(x-15,y-60,30,60,'#7e5838',[16,16,0,0]);rect(x-12,y-57,10,54,'#ab7745',[12,8,0,0]);ellipse(x+9,y-30,3,3,'#f2d280');
      windowPane(xx+15,roofY+26,27,35);windowPane(xx+w-42,roofY+26,27,35);
      rect(x-30,y+3,60,9,'#baa88a',2);rect(x-36,y+11,72,8,'#e8d7b3',2);
      rect(xx+9,roofY+70,40,12,'#be7d3d',2);shrub(xx+28,roofY+69,.45,true);
      rect(xx+w-47,roofY+70,40,12,'#be7d3d',2);shrub(xx+w-29,roofY+69,.45,true);
    } else {
      rect(xx+17,roofY+43,w-34,h-54,'#7a7046',3);rect(xx+22,roofY+46,w-44,h-60,'#465b41',3);
      for(let i=0;i<4;i++){rect(xx+22+i*27,roofY+48,3,h-65,'#bca36c');}
      const awning=kind==='bakery'?'#d97d43':'#78a047';
      for(let i=0;i<8;i++){
        const ax=xx-7+i*(w+14)/8,aw=(w+14)/8;
        poly([[ax+6,roofY+39],[ax+aw+6,roofY+39],[ax+aw,roofY+65],[ax,roofY+65]],i%2?'#fff3cc':awning,P.outline,.65);
        rect(ax,roofY+64,aw,12,i%2?'#fce9b6':awning,[0,0,8,8]);
      }
      line([[xx-9,roofY+76],[xx-9,y]],P.wood,5);line([[xx+w+9,roofY+76],[xx+w+9,y]],P.wood,5);
      rect(xx+10,y-21,w-20,22,'#b18443',3);rect(xx+6,y-24,w-12,7,'#ecc383',2);
      crate(xx+37,y-23,.72,kind==='bakery'?'bread':'lettuce');crate(xx+83,y-23,.72,kind==='bakery'?'bread':'tomatoes');
      rect(x-49,roofY+13,98,24,'#fff0c9',7);line([[x-43,roofY+16],[x+43,roofY+16]],'#fbe5ae',2);text(kind==='bakery'?'BAKERY':'MARKET',x,roofY+29,12,'#7f4e28');
    }
    // Lanterns, flower pots, and stored produce use the same palette and outlines.
    for(const side of [-1,1]){
      const lx=x+side*(w/2-5);line([[lx,roofY+26],[lx+side*9,roofY+26],[lx+side*9,roofY+38]],'#755b35',3);
      rect(lx+side*9-5,roofY+35,10,14,'#ad7735',3);rect(lx+side*9-3,roofY+37,6,10,'#ffe59c',2);
      if(!home){rect(x+side*(w/2+9)-10,y-14,20,18,'#bf7d43',[1,1,6,6]);shrub(x+side*(w/2+9),y-15,.5,true);}
    }
    if(home){barrel(x+w*.69,y-4,.8);crate(x+w*.76,y-5,.85,'bread');}
  }
  function chain(x,y,w=96) {
    for(const direction of [-1,1]) {
      line([[x-w/2,y-direction*25],[x+w/2,y+direction*25]],'#5f5843',7);
      for(let i=0;i<10;i++){
        ctx.save();ctx.translate(x-w/2+i*w/9,y-direction*25+i*direction*50/9);ctx.rotate(direction*.48);
        ctx.strokeStyle='#e9e3ce';ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(0,0,7,3.7,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      }
    }
    ctx.strokeStyle='#9d702b';ctx.lineWidth=6;ctx.beginPath();ctx.arc(x,y-8,10,Math.PI,0);ctx.stroke();
    ctx.strokeStyle='#fce2a3';ctx.lineWidth=3;ctx.stroke();
    rect(x-15,y-9,30,27,'#bb812d',5);rect(x-12,y-8,24,22,'#f5c75a',4);ellipse(x,y+1,3,3,'#815b29');rect(x-2,y+2,4,7,'#815b29',1);
  }
  function windmill(x,y,time,built=true,index=0) {
    if(!built){
      shadow(x,y,39,12,.1);ellipse(x,y,35,11,'#b4c57c');
      ctx.save();ctx.setLineDash([5,5]);ctx.strokeStyle='#e2edb9';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y,36,12,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      for(const side of [-1,1]){rect(x+side*30-3,y-20,6,24,'#b58c53',2);rect(x+side*30-3,y-20,6,6,'#e6c68c',2);}
      return;
    }
    ctx.save();ctx.translate(x,y);shadow(0,0,43,14);
    ellipse(0,4,37,13,'#a4916a');ellipse(0,-1,37,11,'#e7d6af');
    poly([[-25,-2],[-17,-70],[15,-77],[28,-3]],'#f4e6bf',P.outline,2);
    poly([[5,-73],[15,-77],[28,-3],[8,3]],'#c6ae7e');
    for(let yy=-16;yy>-66;yy-=17)line([[-22-yy*.05,yy],[23+yy*.1,yy]],'#d6c293',1.5);
    rect(-7,-28,15,27,'#8e673b',[8,8,0,0]);rect(-4,-26,4,23,'#b78b4d',[4,4,0,0]);
    poly([[-24,-70],[0,-99],[26,-75]],'#d4743e',P.outline,2);poly([[-24,-70],[0,-99],[3,-74]],'#f2a153');
    windowPane(-5,-56,11,14);
    ctx.save();ctx.translate(0,-74);ctx.rotate(time*.42+index*.4);
    for(let i=0;i<4;i++){
      ctx.rotate(Math.PI/2);rect(-2.5,-69,5,69,'#8f6538',1);rect(-12,-67,24,40,'#b2864e',2);rect(-9,-64,18,34,'#fff2d0',1);
      for(let j=1;j<4;j++)line([[-9,-64+j*8],[9,-64+j*8]],'#bb9459',1.5);line([[0,-65],[0,-29]],'#bb9459',1.5);
    }
    ellipse(0,0,9,9,'#b47b3f');ellipse(-2,-2,5,5,'#f0c582');ctx.restore();
    if(index===0){for(let i=0;i<5;i++)flower(-29+i*14,3+(i%2)*3,'#fff0ce',.8);}
    ctx.restore();
  }
  function boatAndDock(time=0) {
    // Waterline uses the same 2.5D faces as paths and buildings.
    const y=470;shadow(114,y+18,92,13,.12);
    for(const x of [36,80,124,168,208]){
      rect(x-5,y+12,10,46,'#815f37',3);rect(x-4,y+11,4,44,'#bd9358',2);
    }
    poly([[30,y],[192,y],[220,y+26],[45,y+26]],'#825b35',P.woodDark,2);
    for(let i=0;i<9;i++)poly([[31+i*18,y],[47+i*18,y],[73+i*18,y+17],[57+i*18,y+17]],i%2?'#d5a462':'#c99452',P.woodDark,1);
    line([[46,y+18],[216,y+18]],'#edc382',3);
    for(const x of [35,207]){rect(x-6,y-20,12,53,'#a4723c',4);ellipse(x,y-20,7,3,'#eac185');}
    ctx.save();ctx.translate(111,426+Math.sin(time*.8)*1.2);
    ellipse(0,18,57,12,'#0d8f9d55');poly([[-59,-3],[-40,25],[28,31],[58,8],[55,-9]],'#758f91','#486e70',2);
    poly([[-59,-3],[-37,6],[34,11],[55,-9],[27,-18],[-35,-17]],'#cdd6c0','#567e7c',2);
    poly([[-43,-6],[-30,0],[25,4],[42,-8],[25,-14],[-28,-14]],'#6f8c86');
    rect(-23,-47,49,46,'#a3b9ae',5);poly([[26,-47],[39,-39],[39,0],[26,-1]],'#7f9c97');
    rect(-28,-51,59,8,'#dce2c5',4);windowPane(-12,-40,25,20,false);rect(4,-69,12,18,'#779694',3);rect(1,-73,18,6,'#cdd6ba',3);
    line([[-57,-2],[-40,15],[28,20],[57,7]],'#e5e6c9',4);ellipse(-35,13,8,10,'#c1cbbc');ellipse(-35,13,4,6,'#6e9795');ctx.restore();
    rect(208,369,6,108,'#996d3c',2);line([[205,375],[230,375],[230,389]],'#886239',4);rect(220,387,18,28,'#b7853d',4);rect(223,390,12,20,'#ffe49a',3);
  }
  function plotBed(plot,index) {
    const {x,y}=plot,front=51+(Math.floor(index%12/3))*1.3,back=front-7;
    shadow(x,y+29,front+4,10,.13);
    poly([[x-back,y-32],[x+back,y-32],[x+front,y+24],[x+front,y+34],[x-front,y+34],[x-front,y+24]],'#99815b',P.outline,1.5);
    poly([[x-back,y-32],[x+back,y-32],[x+front,y+24],[x-front,y+24]],'#c7b185');
    // Back stones first, soil, then front stones. Receding edges are shorter.
    for(let i=0;i<6;i++)stone(x-back+i*(back*2)/6,y-36,(back*2)/6-1,9,i);
    const soil=plot.moisture>89?'#688b73':plot.moisture<18?'#b18b59':'#a57546';
    poly([[x-back+6,y-26],[x+back-6,y-26],[x+front-7,y+23],[x-front+7,y+23]],soil);
    for(let row=0;row<4;row++){
      const yy=y-18+row*11,ww=back-11+row*2;
      line([[x-ww,yy],[x+ww,yy]],plot.moisture>89?'#507d6c':'#865b36',4);
      line([[x-ww,yy-3],[x+ww,yy-3]],plot.moisture<18?'#c4a16e':'#bd9056',2);
      for(let j=0;j<5;j++)ellipse(x-ww+9+j*(ww*2-14)/5,yy-2,2.5,1.5,plot.moisture>89?'#9ac1a0':'#d0a368');
    }
    for(let i=0;i<4;i++){
      const t=i/4,xx=back+(front-back)*t,yy=y-27+i*14;
      stone(x-xx-2,yy,10,12,i);stone(x+xx-8,yy,10,12,i+1);
    }
    for(let i=0;i<7;i++)stone(x-front+i*front*2/7,y+25,front*2/7-1,10,i+1);
    if(!plot.owned)poly([[x-back+5,y-25],[x+back-5,y-25],[x+front-6,y+23],[x-front+6,y+23]],'#644e3520');
    if(plot.moisture>89)ellipse(x+7,y+15,32,8,'#8ed6d173');
  }
  function plant(crop,x,y,growth,health,time,wind=1) {
    const size=.28+growth*.72,sick=health<35;
    ctx.save();ctx.translate(x+Math.sin(time*1.8+x)*wind,y);ctx.scale(size,size);
    shadow(0,3,13,4,.13);
    const leaf=sick?'#aaa059':'#659c37',light=sick?'#c1af6c':'#a4cf57',dark=sick?'#8c844e':'#3f7c34';
    if(crop==='lettuce'){
      ellipse(0,-3,14,10,dark);ellipse(-8,-8,9,10,leaf);ellipse(8,-8,9,10,leaf);ellipse(-3,-13,10,10,light);ellipse(4,-11,8,8,'#c5e17c');
      line([[-10,-7],[-4,-11],[2,-6],[8,-11]],'#d2e8a0',1.4);line([[0,-17],[1,-10]],'#ebedb3',1.3);
    }else if(crop==='wheat'){
      for(let stem=-1;stem<=1;stem++){
        const xx=stem*7,top=-28-Math.abs(stem)*4;line([[xx*.6,3],[xx,top]],growth>.65?'#aa852c':dark,2);
        for(let grain=0;grain<4;grain++){
          ellipse(xx-3,top+grain*4,4,2.5,growth>.65?'#e7b83f':leaf);ellipse(xx+3,top+grain*4-2,4,2.5,growth>.65?'#ffe18a':light);
        }
        line([[xx,top-6],[xx,top]],'#f5da7f',1);
      }
    }else if(crop==='corn'){
      line([[0,3],[0,-36]],dark,3);poly([[0,-9],[-16,-21],[-11,-23],[0,-17]],leaf);poly([[0,-17],[16,-29],[10,-28],[0,-24]],light);
      ellipse(-3,-20,6,12,growth>.65?'#edc64e':leaf);ellipse(-4,-22,3,8,growth>.65?'#ffe28c':light);
      for(let i=0;i<4;i++)line([[-7,-28+i*5],[0,-28+i*5]],'#bd9e3b',.8);
      line([[0,-35],[-5,-42],[0,-39],[5,-44]],'#e8cd70',1.5);
    }else{
      line([[0,2],[0,-24]],dark,2);ellipse(-8,-11,10,6,leaf);ellipse(8,-15,10,6,leaf);ellipse(-2,-23,8,5,light);
      if(growth>.55){
        for(const [xx,yy] of [[-8,-5],[8,-9],[1,-17]]){
          const color=growth>.9?(crop==='tomatoes'?'#e36e3c':'#d65347'):'#b6c66d';
          if(crop==='tomatoes')ellipse(xx,yy,6,6,color);else poly([[xx-6,yy-4],[xx+5,yy-4],[xx+4,yy+2],[xx,yy+7],[xx-4,yy+2]],color,'#9e573a',.7);
          ellipse(xx-2,yy-2,2,2,growth>.9?'#fba17a':'#d5df9e');poly([[xx-5,yy-5],[xx,yy-7],[xx+5,yy-5],[xx,yy-3]],leaf);
        }
      }else flower(2,-21,'#fff0be',.8);
    }
    ctx.restore();
  }
  function farmer(x,y,time,moving=false) {
    const step=moving?Math.sin(time*13)*4:0;
    shadow(x,y+2,15,6,.22);ctx.save();ctx.translate(x,y);
    rect(-9,-10,8,15+step,'#46575b',3);rect(2,-10,8,15-step,'#46575b',3);
    rect(-10,1+step,10,6,'#80623a',3);rect(2,1-step,11,6,'#80623a',3);
    rect(-14,-33,28,27,'#e6b55c',8);rect(-8,-26,17,21,'#658fa0',4);rect(-9,-33,4,16,'#799faa',2);rect(5,-33,4,16,'#799faa',2);
    ellipse(-14,-17-step,5,8,'#e3b589');ellipse(15,-17+step,5,8,'#e3b589');
    ellipse(0,-42,13,14,'#e9be8d');ellipse(5,-39,7,10,'#d6a373');
    rect(-12,-51,23,9,'#7b5838',4);ellipse(-12,-41,4,5,'#e8ba84');ellipse(11,-40,3,4,'#e4af7a');
    ellipse(4,-42,1.5,2,'#4e4737');line([[2,-35],[7,-34]],'#a67551',1.5);
    ellipse(0,-53,23,7,'#aa803d');ellipse(-1,-55,23,6,'#f4d88a');rect(-13,-70,26,16,'#dfbd6f',[9,9,3,3]);rect(-13,-59,26,5,'#a7783c',2);
    line([[-8,-67],[6,-67]],'#ffe6a1',2);ctx.restore();
  }
  return {P,rect,ellipse,poly,line,text,gradient,shadow,stone,path,wall,pillar,flower,shrub,tree,rock,barrel,crate,building,chain,windmill,boatAndDock,plotBed,plant,farmer};
}
