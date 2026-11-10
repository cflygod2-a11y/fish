/* Hand-drawn pixel art for the fishing harbour. All coordinates are logical pixels. */
(() => {
  "use strict";
  const W = 384, H = 204;
  const views = new WeakMap();
  const spots = [
    [24, 112], [66, 112], [108, 112], [150, 112], [192, 112], [234, 112],
    [94, 163], [142, 163], [190, 163], [238, 163], [286, 163], [334, 163]
  ];
  const patterns = {
    "#": ["01010","11111","01010","11111","01010"],
    "0": ["111","101","101","101","111"], "1": ["010","110","010","010","111"],
    "2": ["111","001","111","100","111"], "3": ["111","001","111","001","111"],
    "4": ["101","101","111","001","001"], "5": ["111","100","111","001","111"],
    "6": ["111","100","111","101","111"], "7": ["111","001","010","010","010"],
    "8": ["111","101","111","101","111"], "9": ["111","101","111","001","111"]
  };
  const coats = ["#e18969", "#81b9ab", "#f6bc68", "#97a4cb", "#a4af76", "#d28a98"];

  function seed(value) {
    let n = value >>> 0;
    return () => ((n = (Math.imul(1664525, n) + 1013904223) >>> 0) / 4294967296);
  }
  function rect(g,x,y,w,h,c) {
    if (w<=0 || h<=0) return;
    g.fillStyle=c;
    g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));
  }
  function line(g,x,y,bx,by,c) {
    x=Math.round(x); y=Math.round(y); bx=Math.round(bx); by=Math.round(by);
    const dx=Math.abs(bx-x), dy=Math.abs(by-y), sx=x<bx?1:-1, sy=y<by?1:-1;
    let err=dx-dy;
    g.fillStyle=c;
    while(true) {
      g.fillRect(x,y,1,1);
      if(x===bx && y===by) break;
      const e=err*2;
      if(e>-dy) {err-=dy;x+=sx;}
      if(e<dx) {err+=dx;y+=sy;}
    }
  }
  // Scanline fills preserve the stair-step edges even when rendered at a larger scale.
  function poly(g,pts,c) {
    const ys=pts.map(p=>p[1]), low=Math.floor(Math.min(...ys)), high=Math.ceil(Math.max(...ys));
    g.fillStyle=c;
    for (let y=low; y<high; y++) {
      const intersections=[];
      for(let a=0,b=pts.length-1; a<pts.length; b=a++) {
        const [x1,y1]=pts[b], [x2,y2]=pts[a], mid=y+.5;
        if ((y1<=mid && mid<y2) || (y2<=mid && mid<y1))
          intersections.push(x1+(mid-y1)*(x2-x1)/(y2-y1));
      }
      intersections.sort((a,b)=>a-b);
      for(let i=0;i+1<intersections.length;i+=2) {
        const left=Math.round(intersections[i]), right=Math.round(intersections[i+1]);
        g.fillRect(left,y,right-left,1);
      }
    }
  }
  function ellipse(g,x,y,rx,ry,c) {
    for(let j=-ry;j<=ry;j++) {
      const half=Math.floor(rx*Math.sqrt(Math.max(0,1-(j*j)/(ry*ry))));
      rect(g,x-half,y+j,half*2+1,1,c);
    }
  }
  function text(g,label,x,y,c) {
    for(const ch of label) {
      const glyph=patterns[ch]; if(!glyph) continue;
      glyph.forEach((row,dy)=>[...row].forEach((pixel,dx)=>{
        if(pixel==="1") rect(g,x+dx,y+dy,1,1,c);
      }));
      x+=glyph[0].length+1;
    }
  }
  function cloud(g,x,y,s,shade,light,edge) {
    const pts=[[0,9],[8,9],[8,7],[14,7],[14,5],[20,5],[20,2],[29,2],[29,0],
      [38,0],[38,2],[44,2],[44,5],[51,5],[51,7],[66,7],[66,9],[74,9],
      [74,11],[57,11],[57,13],[27,13],[27,12],[7,12],[7,11],[0,11]];
    poly(g,pts.map(([a,b])=>[x+a*s,y+b*s]),shade);
    rect(g,x+14*s,y+5*s,11*s,s,light);rect(g,x+20*s,y+2*s,10*s,s,light);
    rect(g,x+29*s,y,9*s,s,light);rect(g,x+40*s,y+7*s,15*s,s,light);
    rect(g,x+3*s,y+11*s,32*s,s,edge);rect(g,x+54*s,y+12*s,12*s,s,edge);
  }
  function layer() {
    const canvas=document.createElement("canvas");
    canvas.width=W; canvas.height=H;
    return canvas;
  }
  function pine(g,x,y,h,base,shine) {
    rect(g,x,y-h,1,h+1,base);
    poly(g,[[x,y-h],[x+2,y-h*.55],[x+1,y-h*.55],[x+4,y-h*.24],[x+2,y-h*.24],
      [x+5,y],[x-5,y],[x-2,y-h*.25],[x-4,y-h*.25],[x-1,y-h*.56],[x-2,y-h*.56]],base);
    if(shine) line(g,x-1,y-h*.5,x-3,y-h*.34,shine);
  }
  function village(g) {
    const colors=["#586779","#68667c","#6e667a"];
    [[3,5,8],[14,7,9],[23,6,6],[34,8,9],[49,6,7],[60,5,5]].forEach(([x,w,h],i)=>{
      const y=79-Math.floor(h/3);
      rect(g,x,y-h,w,h,colors[i%3]);
      poly(g,[[x-2,y-h],[x+1,y-h-3],[x+w-3,y-h-4],[x+w+2,y-h]],"#5c5d71");
      rect(g,x+2,y-h+2,2,2,"#f5bc83"); rect(g,x+w-2,y-h+2,1,2,"#bca09d");
    });
  }
  function lighthouse(g) {
    // A sea-worn basalt islet, with a tiled keeper's cottage and sunset-facing tower.
    poly(g,[[271,81],[278,77],[284,77],[288,72],[302,72],[314,70],[329,68],
      [339,71],[348,72],[351,76],[362,76],[369,82],[359,87],[335,88],[314,85],[291,86]],"#435b62");
    poly(g,[[278,80],[289,73],[299,75],[307,72],[317,72],[323,70],[332,70],
      [335,73],[324,75],[316,78],[299,78],[291,80]],"#7e8a79");
    poly(g,[[282,83],[300,77],[315,79],[321,76],[325,77],[316,82],[303,81],[299,84]],"#586f71");
    poly(g,[[337,75],[345,73],[355,79],[350,80],[346,77],[339,79]],"#627771");
    rect(g,310,62,14,11,"#dfb287"); rect(g,320,62,4,11,"#a98177");
    poly(g,[[307,63],[312,56],[322,56],[327,63]],"#a45e5f");
    rect(g,314,66,3,4,"#78656b"); rect(g,319,65,2,3,"#f3ca8c");
    rect(g,319,53,2,4,"#8d6c71");
    poly(g,[[328,40],[335,40],[338,72],[325,72]],"#edcf9b");
    poly(g,[[333,40],[335,40],[338,72],[333,72]],"#b99e8a");
    poly(g,[[327,53],[336,53],[337,59],[326,59]],"#b86964");
    rect(g,333,53,3,6,"#965763"); rect(g,330,44,2,4,"#516272");
    rect(g,330,65,3,7,"#4b5d68");rect(g,330,65,2,1,"#e1aa83");
    rect(g,325,38,13,3,"#52616b"); rect(g,326,37,11,1,"#e4c198");
    rect(g,328,31,7,6,"#465567"); rect(g,329,32,5,4,"#ffdc9c");
    rect(g,331,32,1,4,"#e89967");rect(g,326,30,11,2,"#5b586b");
    poly(g,[[325,30],[330,26],[333,26],[338,30]],"#9d625f");
    line(g,331,26,331,23,"#575b66");
    pine(g,302,73,16,"#435e60","#688477");pine(g,296,74,10,"#506d66");
    pine(g,346,76,13,"#46675f","#728776");
    for(const [x,y,w] of [[274,85,15],[299,87,15],[325,89,17],[350,87,14]]) rect(g,x,y,w,1,"#bed1ad");
  }
  function background() {
    const board=layer(), g=board.getContext("2d"), rnd=seed(842037);
    const sky=[[0,12,"#9292ac"],[12,12,"#ac9ab0"],[24,13,"#cca4ac"],[37,13,"#e3afaa"],
      [50,12,"#efbca0"],[62,18,"#f7c99f"]];
    sky.forEach(([y,h,c])=>rect(g,0,y,W,h,c));
    for(const [y,base] of [[11,"#a69ab0"],[23,"#bd9dae"],[36,"#d9aaa9"],[49,"#edb6a3"]]) {
      for(let j=0;j<21;j++) rect(g,rnd()*W,y+rnd()*4,2+rnd()*17,1,base);
    }
    ellipse(g,205,44,20,20,"#f4ba94");ellipse(g,205,44,17,17,"#ffdaa5");
    rect(g,186,51,39,1,"#f8c39b");
    cloud(g,-15,11,1,"#c3a5b6","#ddbac1","#b39aae");
    cloud(g,69,22,.82,"#e6bbc0","#fbd1c1","#cea6b0");
    cloud(g,252,7,1.11,"#cfacb8","#e6c0c1","#bf9cac");
    cloud(g,336,33,.65,"#ebc0b5","#f8cfbb","#d5a9ab");
    rect(g,143,43,41,1,"#eab7ad");rect(g,159,45,21,1,"#f2c1ac");
    rect(g,202,2,17,1,"#b2a0b3");rect(g,218,3,8,1,"#b8a2b3");
    poly(g,[[0,52],[15,44],[29,48],[46,40],[62,47],[74,44],[91,53],[115,49],[131,55],
      [152,49],[177,57],[197,54],[216,58],[240,49],[254,54],[273,43],[284,45],[299,36],
      [312,46],[325,42],[344,47],[356,40],[373,44],[384,40],[384,79],[0,79]],"#ae9ba8");
    poly(g,[[0,63],[14,57],[32,64],[47,61],[64,63],[80,56],[99,62],[115,56],[129,61],
      [147,59],[166,65],[185,62],[203,65],[221,61],[239,64],[256,56],[274,61],[291,53],
      [312,61],[332,54],[347,60],[362,52],[379,57],[384,54],[384,79],[0,79]],"#9290a1");
    poly(g,[[0,67],[17,61],[39,63],[49,57],[62,59],[72,58],[88,66],[96,67],[108,69],[126,74],
      [152,74],[160,77],[0,81]],"#687a84");
    poly(g,[[252,76],[272,71],[292,69],[311,61],[331,67],[346,60],[365,56],[384,53],[384,80]],"#72838a");
    for(let x=0;x<103;x+=2+Math.floor(rnd()*4)) {
      const y=Math.floor(68+Math.max(0,x-72)*.14);
      pine(g,x,y,3+Math.floor(rnd()*5),"#697b83");
    }
    village(g);
    const sea=[[78,8,"#a8b6a5"],[86,10,"#92b0a0"],[96,15,"#7aa69b"],[111,19,"#689b94"],
      [130,22,"#588d89"],[152,24,"#497e7d"],[176,29,"#3d7076"]];
    sea.forEach(([y,h,c])=>rect(g,0,y,W,h,c));
    // Dither band joins and paint the breaking surface as short horizontal strokes.
    for(let i=1;i<sea.length;i++) {
      const [y,,c]=sea[i];
      for(let s=0;s<67;s++) rect(g,rnd()*W,y-2+rnd()*4,1+rnd()*8,1,s%2?c:sea[i-1][2]);
    }
    const bright=["#c5c5aa","#a8bc9f","#9bb5a0","#85a99a","#67988e","#61918b","#52828a"];
    const dark=["#98ac9f","#87a79c","#77a195","#67948b","#50847e","#477a7b","#386970"];
    sea.forEach(([y,h],i)=>{
      for(let k=0;k<70;k++){
        const x=Math.floor(rnd()*W), yy=y+Math.floor(rnd()*h), length=1+Math.floor(rnd()*(i+3));
        rect(g,x,yy,length,1,k%5?dark[i]:bright[i]);
        if(i>3 && k%8===0) rect(g,x+length,yy-1,2,1,bright[i]);
      }
    });
    // Narrow golden light lane, broken by the wind.
    for(let i=0;i<155;i++) {
      const d=rnd(), y=Math.floor(79+100*d), x=205+(rnd()-.5)*(13+72*d);
      rect(g,x,y,1+Math.floor(rnd()*(8-4*d)),1,
        d<.15?"#e4c6a0":d<.36?"#c9bc9b":d<.68?"#a7ae91":"#879e8d");
    }
    // Fishing skiff on the horizon with a tiny lateen sail.
    poly(g,[[126,77],[137,77],[133,80],[129,80]],"#6f8586");
    rect(g,132,68,1,9,"#889493");poly(g,[[131,69],[131,76],[127,76]],"#dfbea3");
    rect(g,127,81,9,1,"#a1ae9f");
    lighthouse(g);
    return board;
  }
  function crate(g,x,y) {
    rect(g,x,y,10,8,"#594a48");rect(g,x+1,y+1,8,6,"#b47f5c");rect(g,x+1,y+2,8,1,"#d89e76");
    line(g,x+1,y+6,x+8,y+1,"#8c634f");rect(g,x+4,y+1,1,6,"#987157");
  }
  function lantern(g,x,y) {
    rect(g,x-1,y-13,2,13,"#594d51");rect(g,x-1,y-14,8,1,"#6d5b59");
    rect(g,x+4,y-13,1,3,"#554d4d");rect(g,x+2,y-11,5,1,"#625057");
    rect(g,x+2,y-10,5,5,"#bb8d62");rect(g,x+3,y-10,3,4,"#ffe6a3");
    rect(g,x+2,y-5,5,1,"#695354");
  }
  function dock(g,x,end,y,rnd) {
    // Cast shadows and wet pile feet sit below the plank apron.
    rect(g,x+2,y+10,end-x,3,"#486c69");
    for(let n=x+8;n<end-2;n+=37) {
      rect(g,n+2,y+6,4,17,"#466e6c");rect(g,n+1,y+22,7,1,"#70978a");
      rect(g,n,y+7,5,12,"#604e49");rect(g,n+1,y+8,2,9,"#936d54");
      rect(g,n,y+17,5,3,"#5f6558");rect(g,n-1,y+20,8,1,"#88a392");
      line(g,n+4,y+12,n+11,y+6,"#705b4b");
    }
    rect(g,x,y-1,end-x,9,"#5c514b");
    rect(g,x,y,end-x,5,"#c18a60");
    rect(g,x,y,end-x,1,"#deac79");
    for(let a=x+1;a<end-1;a+=5) {
      const shade=["#c59268","#d6a170","#b98761","#c8976b"][Math.floor(rnd()*4)];
      rect(g,a,y,4,5,shade);rect(g,a,y,4,1,"#e2af7c");
      rect(g,a+4,y+1,1,4,"#9e7457");
      if(rnd()>.5)rect(g,a+1,y+3,2,1,"#af815d");
    }
    rect(g,x,y+5,end-x,1,"#9a7159");rect(g,x,y+6,end-x,2,"#765848");
    for(let a=x+3;a<end-1;a+=15) rect(g,a,y+6,1,1,"#c3956c");
    for(const p of [x+1,end-4]) {
      rect(g,p,y-4,4,11,"#76604c");rect(g,p,y-5,4,1,"#ddaf7a");rect(g,p+1,y-3,1,7,"#bd9168");
    }
  }
  function sailboat(g,dx,dy) {
    const P=(pts,c)=>poly(g,pts.map(([x,y])=>[x+dx,y+dy]),c);
    const R=(x,y,w,h,c)=>rect(g,dx+x,dy+y,w,h,c);
    P([[-18,1],[18,0],[13,6],[-10,7]],"#496766");R(-10,7,19,1,"#82a99a");
    P([[-19,-3],[18,-3],[15,1],[10,4],[-11,4],[-17,0]],"#6b5d59");
    R(-16,-3,32,1,"#f1bd87");R(-11,1,23,1,"#9e7c65");
    R(-1,-29,1,26,"#756965");
    P([[-2,-28],[-2,-8],[-16,-7]],"#e1b194");
    P([[-4,-22],[-3,-9],[-10,-9]],"#e8c4a2");
    P([[1,-25],[12,-8],[1,-7]],"#bd8778");R(0,-29,6,2,"#c16e67");
    R(-6,-6,14,3,"#91725e");R(-5,-6,13,1,"#ceb38a");
  }
  function furniture() {
    const board=layer(),g=board.getContext("2d"),rnd=seed(31374);
    dock(g,0,265,112,rnd);dock(g,66,384,163,rnd);
    crate(g,252,105);lantern(g,6,112);lantern(g,373,163);
    // A loop of line on the dock and a ladder disappearing into seawater.
    line(g,261,119,258,131,"#715d52");line(g,265,119,262,131,"#766655");
    for(let j=0;j<3;j++)rect(g,260-j,122+j*3,4,1,"#b19872");
    rect(g,72,157,5,6,"#715d50");rect(g,71,156,7,2,"#c29567");rect(g,72,160,5,1,"#b6a185");
    crate(g,355,156);
    return board;
  }
  function chair(g,x,y,vip) {
    const outline=vip?"#755737":"#67564d", wood=vip?"#d4a14f":"#94745e";
    rect(g,x-6,y-9,2,9,outline); rect(g,x-5,y-9,2,4,wood);
    rect(g,x-4,y-4,9,2,outline);rect(g,x-4,y-5,9,1,vip?"#eabd69":"#c19d79");
    rect(g,x+3,y-3,2,3,wood);
    if(vip) {
      rect(g,x-6,y-12,3,6,"#b55860");rect(g,x-7,y-13,5,1,"#f9c56b");
      rect(g,x-7,y-14,1,2,"#f9c56b");rect(g,x-3,y-14,1,2,"#f9c56b");
      rect(g,x-5,y-15,1,2,"#ffe094");rect(g,x-4,y-6,7,1,"#943f4e");
    }
  }
  function angler(g,x,y,index,seat,t) {
    const coat=coats[index%coats.length], gold=Number(seat.rod_ready)>0;
    rect(g,x-3,y-10,5,6,"#384a50");rect(g,x-2,y-10,4,5,coat);
    rect(g,x-2,y-15,5,5,"#674f48");rect(g,x-1,y-14,4,4,"#e9b78b");
    rect(g,x+2,y-13,1,1,"#514b50");rect(g,x-1,y-11,2,1,"#c88e73");
    rect(g,x-3,y-16,6,2,coat);rect(g,x-4,y-14,9,1,"#47565a");
    rect(g,x-3,y-4,7,2,"#4a5360");rect(g,x+2,y-3,2,3,"#485866");rect(g,x+2,y-1,4,1,"#635453");
    rect(g,x+2,y-8,4,2,"#d7a17b");rect(g,x+1,y-9,2,3,coat);
    const castX=x+15, destination=x+21+(index%3);
    line(g,x+5,y-7,castX,y-17,gold?"#f5c66b":"#665b54");
    line(g,castX,y-17,castX+4,y-7,"#aab5a1");
    line(g,castX+4,y-7,destination,y+12,"#a5b5a3");
    const by=y+13+Math.floor((Math.sin(t*2+index)+1)*.8);
    rect(g,destination-2,by+2,5,1,"#acc0a5");
    rect(g,destination,by-2,1,2,"#f6c693");rect(g,destination-1,by,3,2,"#bd6559");
  }
  function landedFish(g,x,y,record,age) {
    const duration=2.6;
    if(!window.FishSprites || age<0 || age>=duration) return;
    const progress=age/duration;
    const arc=Math.sin(progress*Math.PI);
    // A full-width catch still fits between neighbouring casts in the six-seat row.
    const size=Math.min(1,Math.sqrt(Math.max(0,record.cm)/380));
    const width=Math.round(26+8*size), height=Math.round(16+3*size);
    const centerX=x+20+Math.round(4*progress), waterY=y+30;
    const top=waterY-Math.round(11*arc)-Math.floor(height/2);
    rect(g,centerX-6,waterY+4,13,1,"#527e79");
    if(progress<.3 || progress>.73) {
      rect(g,centerX-9,waterY+3,5,1,"#d4d4b5");
      rect(g,centerX+5,waterY+2,4,1,"#dedcbd");
      rect(g,centerX-8,waterY,1,2,"#c4cec0");
    }
    window.FishSprites.draw(g,record.fish,centerX-Math.floor(width/2),top,width,height);
  }
  function updateCatchState(scene,state,time) {
    if(scene.state===state) return;
    scene.state=state;
    scene.snapshotTime=time;
    scene.seats=new Map((state?.seats || []).map(seat=>[seat.id,seat]));
    scene.caught=new Map();
    for(const record of state?.catches || []) {
      const seat=scene.seats.get(record.seat);
      if(seat?.name && seat.name===record.name && seat.last_catch_at===record.caught_at) {
        scene.caught.set(seat.id,record);
      }
    }
  }
  function numberPlate(g,x,y,id,vip,active) {
    const width=id<10?14:18, left=x-Math.floor(width/2);
    rect(g,left,y+6,width,9,"#405350");rect(g,left+1,y+6,width-2,1,vip?"#eac676":"#b9aa80");
    rect(g,left+1,y+7,width-2,6,vip?"#70593a":active?"#3b6762":"#4b6059");
    text(g,"#"+id,left+2,y+8,vip?"#ffe3a4":active?"#f6f2ca":"#e3dfb9");
  }
  function bird(g,x,y,wing) {
    const c="#706b79";
    if (wing) {rect(g,x-4,y-1,2,1,c);rect(g,x-2,y,2,1,c);rect(g,x,y+1,1,1,c);rect(g,x+1,y,2,1,c);rect(g,x+3,y-1,1,1,c);}
    else {rect(g,x-4,y+1,2,1,c);rect(g,x-2,y,2,1,c);rect(g,x,y+1,1,1,c);rect(g,x+1,y,3,1,c);}
  }

  window.drawFishingScene = function(canvas,state,timeMs) {
    if(!canvas || !canvas.getContext) return;
    let scene=views.get(canvas);
    if(!scene) {
      canvas.width=W; canvas.height=H; canvas.style.imageRendering="pixelated";
      scene={g:canvas.getContext("2d"),back:background(),dock:furniture(),ripples:[],seats:new Map(),caught:new Map()};
      const rnd=seed(92014);
      for(let i=0;i<47;i++) scene.ripples.push([Math.floor(rnd()*W),91+Math.floor(rnd()*112),1+Math.floor(rnd()*8),rnd()*6.28]);
      views.set(canvas,scene);
    }
    const g=scene.g; if(!g)return;
    const t=(timeMs || 0)/1000;
    updateCatchState(scene,state,t);
    g.imageSmoothingEnabled=false;
    g.drawImage(scene.back,0,0);
    for(const [x,y,w,phase] of scene.ripples) {
      if(Math.sin(t*.85+phase+y)>.1) {
        const dx=Math.round(2*Math.sin(t*.45+phase));
        rect(g,x+dx,y,w,1,y>155?"#65918b":"#a0b4a1");
      }
    }
    for(let i=0;i<3;i++) {
      const bx=Math.floor((91+i*13+t*1.7)%(W+24))-10, by=20+Math.round(3*Math.sin(t*.21+i*.6))+i%2*3;
      bird(g,bx,by,Math.sin(t*2.7+i)>0);
    }
    sailboat(g,37+Math.round(Math.sin(t*.45)),157+Math.round(Math.sin(t*.95)));
    g.drawImage(scene.dock,0,0);
    // A wild sardine briefly breaks the open water, away from all twelve hooks.
    const wildPhase=(t%8.5)/.78;
    if(wildPhase<1 && window.FishSprites) {
      const x=302+Math.round(17*wildPhase), waterY=127;
      const jump=Math.round(10*Math.sin(Math.PI*wildPhase));
      g.save();
      g.beginPath(); g.rect(x,waterY-12,15,12); g.clip();
      window.FishSprites.draw(g,"沙丁鱼",x,waterY-jump,15,7);
      g.restore();
      if(wildPhase<.22 || wildPhase>.72) rect(g,x+2,waterY,8,1,"#c0cab2");
    }
    spots.forEach(([x,y],idx)=>{
      const id=idx+1, seat=scene.seats.get(id)||{}, vip=seat.vip || id>=11;
      chair(g,x,y,vip);
      if(seat.name) angler(g,x,y,idx,seat,t);
      const record=scene.caught.get(id);
      if(record) landedFish(g,x,y,record,(state.server_time-record.caught_at)+(t-scene.snapshotTime));
      numberPlate(g,x,y,id,vip,Boolean(seat.name));
    });
  };
})();
