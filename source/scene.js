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
  const catchDuration = 4.4;
  const castDuration = 1.2;
  // Time, body lean/lift, hands, and rod tip, in local sprite pixels.
  const castPoses = [
    [0,    0, 0,  4, -7,   9, -25],
    [.22,  1, 1,  9, -9,   9, -28],
    [.46, -2, 3, -2,-15, -13, -34],
    [.64,  2, 2,  7,-11,  27, -25],
    [.85,  1, 1,  6, -8,  18, -18],
    [1,    0, 0,  5, -7,  15, -17]
  ];
  // Seconds, lean/lift, rod hand, tip, and butt. End exactly at the rod rest.
  const retrievePoses = [
    [0,     0, 0,  5, -7, 15,-17,  5, -7],
    [.22,  -1, 1,  2,-10,  8,-27,  4, -6],
    [.65,  -2, 4, -1,-13, -6,-36,  1, -7],
    [1.15,  0, 5,  0,-15, -3,-39,  1, -8],
    [1.7,   0, 5,  9, -7,  8,-26,  9, -1]
  ];
  const sparkles = [[-1,-.3], [1,-.35], [-.55,-.95], [1,.25], [-1,.3]];
  const motionPreference=window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const seasons={
    spring:{
      sky:["#91b4ca","#a6c5d2","#b9d3d4","#d2ded8","#eee2cd","#f6e2c8"],
      cloud:["#e6d4d5","#fff0e3","#cbbfca"], sun:["#f5d5b6","#fff0cd"],
      hills:["#a0b6b2","#849e9b","#627f7f","#698b86"],
      sea:["#b8d0bc","#9ec4b1","#86b6a6","#70a99d","#5a9993","#49888a","#3b777e"],
      reflection:"#ffe9be", leaf:["#af798c","#dd98a9","#f6bac6","#ffdee1"], ripple:"#c4ded1"
    },
    summer:{
      sky:["#77b0ce","#88bfd7","#a3d0df","#bedde2","#d6e9df","#e4eddc"],
      cloud:["#d2e2e5","#f3f2e3","#afccd7"], sun:["#f4dfad","#fff4cd"],
      hills:["#8db7ac","#72a196","#537e78","#618e7b"],
      sea:["#b0d5bf","#95c9b7","#79b8ac","#61a99f","#4c9693","#3c8587","#307579"],
      reflection:"#f8edbd", leaf:["#385a58","#507565","#69927b","#89ae87"], ripple:"#bce3d6"
    },
    autumn:{
      sky:["#9992ac","#b19ab0","#d1a3a8","#e7afa0","#f1bb94","#f8cc99"],
      cloud:["#deb1af","#fed2b8","#c49da7"], sun:["#f4b584","#ffdaa5"],
      hills:["#b19a9f","#938b96","#7b777c","#837b7d"],
      sea:["#b4b8a5","#a1b1a0","#89a59a","#759c91","#638d88","#567e7d","#456f76"],
      reflection:"#ffdb95", leaf:["#a4574d","#c2714a","#df934f","#f4b75f"], ripple:"#c7c3a4"
    },
    winter:{
      sky:["#758eaf","#8fa6bf","#a4b8cc","#beccd8","#d0d9e0","#e0e5e6"],
      cloud:["#c6d1e2","#e9edf4","#aabbd1"], sun:["#d3dce6","#f2f0e4"],
      hills:["#a5b6c6","#8b9fb2","#6b8298","#7890a5"],
      sea:["#bccdd4","#a5bec9","#8eaaba","#7899ab","#62879c","#52798d","#446a80"],
      reflection:"#ebf1ed", leaf:["#6b7889","#8b9cad","#c4d6dd","#e9efed"], ripple:"#c2d8df"
    }
  };

  // Both the scene and HUD extrapolate the same server snapshot. No browser-local epoch.
  function sampleDay(state,timeMs) {
    const cycle=state?.day_cycle;
    const valid=Number.isFinite(cycle?.hour)&&cycle.hour>=0&&cycle.hour<24;
    const delta=valid&&Number.isFinite(state?.receivedAtMs)&&Number.isFinite(timeMs)
      ?Math.max(0,timeMs-state.receivedAtMs)/1000:0;
    const rate=Number.isFinite(cycle?.secondsPerHour)&&cycle.secondsPerHour>0?cycle.secondsPerHour:10;
    const day=Number.isFinite(cycle?.dayNumber)?Math.max(1,Math.floor(cycle.dayNumber)):1;
    const total=valid?(day-1)*24+cycle.hour+delta/rate:12;
    const hour=((total%24)+24)%24;
    const phase=hour>=5&&hour<8?'dawn':hour>=8&&hour<17?'day':hour>=17&&hour<20?'dusk':'night';
    const night=hour<5||hour>=20?1:hour<8?1-(hour-5)/3:hour<17?0:(hour-17)/3;
    return {hour,minute:Math.min(59,Math.floor((hour-Math.floor(hour))*60+1e-7)),
      dayNumber:Math.floor(total/24)+1,phase,label:{dawn:'清晨',day:'白天',dusk:'黄昏',night:'夜晚'}[phase],night};
  }
  window.HarborDayCycle=Object.freeze({sample:sampleDay});

  function mixColor(a,b,u) {
    const aa=parseInt(a.slice(1),16),bb=parseInt(b.slice(1),16);
    const channel=shift=>Math.round(((aa>>shift)&255)*(1-u)+((bb>>shift)&255)*u);
    return '#'+[16,8,0].map(shift=>channel(shift).toString(16).padStart(2,'0')).join('');
  }
  const nightPalette={
    sky:['#172641','#1d304d','#293d59','#3b5069','#53677c','#778794'],
    cloud:['#3d506c','#596b83','#2d405c'],sun:['#a9bdce','#e3ebcf'],
    hills:['#4d6575','#3c5667','#2c4857','#355363'],
    sea:['#607f8d','#4e7183','#3c6177','#31566e','#294c64','#234359','#203b51'],
    reflection:'#c5decb',leaf:['#3e4e61','#586576','#778a99','#a5b8be'],ripple:'#7499a5'
  };
  const dawnPalette={
    sky:['#747d9f','#9893af','#c0a5b4','#dfb9b7','#f1cbb7','#f8dcc2'],
    cloud:['#c5a9b9','#f9d7c8','#a392aa'],sun:['#f8c28e','#ffe9b5'],
    hills:['#9d9ba8','#868b99','#647b88','#73878b'],
    sea:['#b5b9b9','#9dafb0','#88a3a7','#739699','#60858c','#52757f','#476977'],
    reflection:'#ffddb1',leaf:['#766677','#a28b9a','#c3a2ae','#dfbdc2'],ripple:'#d1c9bf'
  };
  const duskPalette={
    sky:['#776184','#997693','#bd8b9d','#dda092','#f3b08c','#f9cb9a'],
    cloud:['#c996a3','#f8c4a5','#a07f97'],sun:['#ef986e','#ffcf8e'],
    hills:['#a08c99','#857e91','#666c7e','#727881'],
    sea:['#b0a4a5','#9b9ba1','#858e99','#71818e','#617581','#536a77','#46606e'],
    reflection:'#ffd099',leaf:['#725b69','#a47882','#c18f8a','#dfaf97'],ripple:'#c9b6b2'
  };
  function blendPalette(a,b,u) {
    const result={};
    for(const key of Object.keys(a)) result[key]=Array.isArray(a[key])
      ?a[key].map((c,i)=>mixColor(c,b[key][i],u)):mixColor(a[key],b[key],u);
    return result;
  }
  function daylightPalette(base,hour) {
    // Preserve the season's character even at night and during sunrise/sunset.
    const dawn=blendPalette(base,dawnPalette,.78),dusk=blendPalette(base,duskPalette,.86);
    const night=blendPalette(base,nightPalette,.94);
    const keys=[[0,night],[5,night],[6,dawn],[8,base],[16,base],[18,dusk],[20,night],[24,night]];
    for(let i=1;i<keys.length;i++) if(hour<=keys[i][0]){
      const [start,a]=keys[i-1],[end,b]=keys[i],u=(hour-start)/(end-start);
      return blendPalette(a,b,u*u*(3-2*u));
    }
    return night;
  }
  function skyBody(hour) {
    if(hour>=5.5&&hour<=18.5){
      const u=(hour-5.5)/13,altitude=Math.max(0,Math.sin(Math.PI*u));
      return {moon:false,x:48+270*u,y:76-57*altitude,radius:12+Math.round(3*(1-altitude)),
        reflectionStrength:Math.min(1,altitude*3)};
    }
    const u=((hour<5.5?hour+24:hour)-18.5)/11,altitude=Math.max(0,Math.sin(Math.PI*u));
    return {moon:true,x:52+268*u,y:74-54*altitude,radius:10,
      reflectionStrength:Math.min(1,altitude*3)};
  }

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
  function shadedDrawing(g,paint,night) {
    const board=layer(),ink=board.getContext('2d');
    paint(ink);
    ink.globalCompositeOperation='source-atop';
    ink.globalAlpha=night*.35;
    rect(ink,0,0,W,H,'#1b2c48');
    g.drawImage(board,0,0);
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
  // A near branch frames the water. Smaller trees repeat its colour on the far shore.
  function branch(g,key,colors) {
    const twig=key==="winter"?"#667385":"#755e63";
    poly(g,[[0,2],[11,8],[24,11],[34,12],[46,8],[57,8],[45,11],[34,14],[23,14],[10,12],[0,9]],twig);
    for(const [x,y,bx,by] of [[10,10,15,20],[13,17,22,22],[24,12,28,6],[34,13,45,20],[44,9,52,5],[51,9,62,12],[6,10,2,18]]) {
      line(g,x,y,bx,by,twig);
    }
    if(key==="winter"){
      line(g,0,2,12,8,colors[3]);line(g,12,8,23,11,colors[2]);
      line(g,32,12,45,8,colors[3]);rect(g,47,7,7,1,colors[2]);return;
    }
    const leaves=[[3,6],[7,9],[4,17],[15,19],[21,21],[22,10],[29,5],[32,12],[41,18],[46,20],[50,7],[54,5],[58,10],[63,12]];
    for(const [i,[x,y]] of leaves.entries()){
      if(key==="spring"){
        rect(g,x-2,y-1,5,3,colors[1]);rect(g,x-1,y-2,3,5,colors[2]);
        rect(g,x-1,y-2,2,1,colors[3]);rect(g,x+1,y,1,1,"#fff0bc");
      }else if(key==="summer"){
        poly(g,[[x-2,y],[x+4,y-1],[x+2,y+3],[x-1,y+5]],colors[i%2]);
        line(g,x-1,y+2,x+2,y,colors[2]);
      }else{
        poly(g,[[x-3,y-2],[x,y-1],[x+2,y-4],[x+3,y-1],[x+6,y-2],[x+4,y+1],[x+2,y+3],[x-1,y+2]],colors[1+i%3]);
        rect(g,x,y+1,2,1,colors[0]);
      }
    }
  }
  function shoreTree(g,x,y,key,colors) {
    rect(g,x,y-10,2,11,"#6e6065");
    line(g,x,y-4,x-5,y-10,"#77666a");line(g,x+1,y-6,x+6,y-13,"#77666a");
    if(key==="winter"){
      line(g,x-5,y-10,x-6,y-14,"#8793a1");line(g,x,y-10,x-2,y-17,"#8793a1");
      line(g,x+2,y-8,x+5,y-12,colors[3]);return;
    }
    ellipse(g,x-4,y-10,5,3,colors[0]);ellipse(g,x+4,y-12,5,4,colors[1]);
    ellipse(g,x-1,y-15,6,4,colors[1]);ellipse(g,x-2,y-16,4,2,colors[2]);
    rect(g,x-5,y-17,3,1,colors[3]);rect(g,x+4,y-13,3,1,colors[2]);
  }
  function background(key,palette,daylight) {
    const board=layer(), g=board.getContext("2d"), rnd=seed(842037);
    const skyEdges=[0,12,24,37,50,62,80], sky=palette.sky;
    sky.forEach((c,i)=>rect(g,0,skyEdges[i],W,skyEdges[i+1]-skyEdges[i],c));
    for(let i=1;i<sky.length;i++) {
      for(let j=0;j<21;j++) rect(g,rnd()*W,skyEdges[i]-2+rnd()*2,2+rnd()*17,1,sky[i]);
    }
    const stars=seed(78143),body=skyBody(daylight.hour);
    g.globalAlpha=Math.max(0,(daylight.night-.35)/.65)*.8;
    for(let i=0;i<42;i++){
      const x=Math.floor(stars()*W),y=Math.floor(stars()*43);
      rect(g,x,y,1,1,i%3?'#b8cddd':'#f5e5bb');
      if(i%13===0){rect(g,x-1,y,3,1,'#c9d7df');rect(g,x,y-1,1,3,'#c9d7df');}
    }
    g.globalAlpha=1;
    if(body.moon){
      // A hand-cut crescent leaves the sky untouched through its hollow.
      for(let y=-10;y<=10;y++){
        const outer=Math.floor(Math.sqrt(100-y*y));
        const inset=Math.sqrt(Math.max(0,100-(y+3)*(y+3)));
        const right=Math.min(outer,Math.floor(5-inset));
        rect(g,body.x-outer,body.y+y,right+outer,1,palette.sun[1]);
      }
    }else{
      ellipse(g,body.x,body.y,body.radius+2,body.radius+2,palette.sun[0]);
      ellipse(g,body.x,body.y,body.radius,body.radius,palette.sun[1]);
      rect(g,body.x-body.radius,body.y+body.radius*.5,body.radius*2,1,palette.sun[0]);
    }
    cloud(g,-15,11,1,...palette.cloud);cloud(g,69,22,.82,...palette.cloud);
    cloud(g,252,7,1.11,...palette.cloud);cloud(g,336,33,.65,...palette.cloud);
    rect(g,143,43,41,1,sky[4]);rect(g,159,45,21,1,sky[4]);
    poly(g,[[0,52],[15,44],[29,48],[46,40],[62,47],[74,44],[91,53],[115,49],[131,55],
      [152,49],[177,57],[197,54],[216,58],[240,49],[254,54],[273,43],[284,45],[299,36],
      [312,46],[325,42],[344,47],[356,40],[373,44],[384,40],[384,79],[0,79]],palette.hills[0]);
    if(key==="winter"){
      for(const [x,y] of [[46,40],[273,43],[299,36],[356,40]])
        poly(g,[[x-9,y+6],[x,y],[x+7,y+5],[x+3,y+4],[x+1,y+5],[x-2,y+3],[x-5,y+5]],"#e0e6e6");
    }
    poly(g,[[0,63],[14,57],[32,64],[47,61],[64,63],[80,56],[99,62],[115,56],[129,61],
      [147,59],[166,65],[185,62],[203,65],[221,61],[239,64],[256,56],[274,61],[291,53],
      [312,61],[332,54],[347,60],[362,52],[379,57],[384,54],[384,79],[0,79]],palette.hills[1]);
    poly(g,[[0,67],[17,61],[39,63],[49,57],[62,59],[72,58],[88,66],[96,67],[108,69],[126,74],
      [152,74],[160,77],[0,81]],palette.hills[2]);
    poly(g,[[252,76],[272,71],[292,69],[311,61],[331,67],[346,60],[365,56],[384,53],[384,80]],palette.hills[3]);
    for(let x=0;x<103;x+=2+Math.floor(rnd()*4)) {
      const y=Math.floor(68+Math.max(0,x-72)*.14);
      pine(g,x,y,3+Math.floor(rnd()*5),palette.hills[2]);
    }
    shadedDrawing(g,village,daylight.night);
    shoreTree(g,73,77,key,palette.leaf);shoreTree(g,89,79,key,palette.leaf);
    const depths=[78,86,96,111,130,152,176,205];
    const sea=palette.sea.map((color,i)=>[depths[i],depths[i+1]-depths[i],color]);
    sea.forEach(([y,h,c])=>rect(g,0,y,W,h,c));
    // Dither band joins and paint the breaking surface as short horizontal strokes.
    for(let i=1;i<sea.length;i++) {
      const [y,,c]=sea[i];
      for(let s=0;s<67;s++) rect(g,rnd()*W,y-2+rnd()*4,1+rnd()*8,1,s%2?c:sea[i-1][2]);
    }
    const bright=[palette.ripple,...palette.sea.slice(0,-1)],dark=palette.sea.slice(1).concat(palette.sea[6]);
    sea.forEach(([y,h],i)=>{
      for(let k=0;k<70;k++){
        const x=Math.floor(rnd()*W), yy=y+Math.floor(rnd()*h), length=1+Math.floor(rnd()*(i+3));
        rect(g,x,yy,length,1,k%5?dark[i]:bright[i]);
        if(i>3 && k%8===0) rect(g,x+length,yy-1,2,1,bright[i]);
      }
    });
    // The broken reflection follows the sun or moon across the water.
    for(let i=0;i<155;i++) {
      const d=rnd(), y=Math.floor(79+100*d), x=body.x+(rnd()-.5)*(13+72*d);
      g.globalAlpha=(.55-.32*d)*body.reflectionStrength;
      rect(g,x,y,1+Math.floor(rnd()*(8-4*d)),1,palette.reflection);
    }
    g.globalAlpha=1;
    // Fishing skiff on the horizon with a tiny lateen sail.
    poly(g,[[126,77],[137,77],[133,80],[129,80]],"#6f8586");
    rect(g,132,68,1,9,"#889493");poly(g,[[131,69],[131,76],[127,76]],"#dfbea3");
    rect(g,127,81,9,1,"#a1ae9f");
    shadedDrawing(g,lighthouse,daylight.night);
    shoreTree(g,355,77,key,palette.leaf);
    if(daylight.night>.02){
      // A low beam fades into the haze from the lantern room, clear of the fishing berths.
      g.globalAlpha=.08*daylight.night;
      poly(g,[[329,33],[256,29],[263,40],[329,35]],"#ffe4a7");
      g.globalAlpha=.11*daylight.night;
      poly(g,[[329,33],[290,32],[290,37],[329,35]],"#ffdfa0");
      g.globalAlpha=1;
      rect(g,329,33,4,2,"#fff1bf");
    }
    if(key==="winter") {
      poly(g,[[307,63],[312,56],[322,56],[325,60],[317,58],[311,62]],"#e6ece8");
      rect(g,327,29,9,1,"#eef2ea");
      for(const [x,y,w] of [[285,76,8],[303,73,8],[342,74,9],[357,78,4],[298,67,3],[300,61,3],[344,68,4]])
        rect(g,x,y,w,1,"#d2e4e3");
    }
    branch(g,key,palette.leaf);
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
  function furniture(key) {
    const board=layer(),g=board.getContext("2d"),rnd=seed(31374);
    dock(g,0,265,112,rnd);dock(g,66,384,163,rnd);
    crate(g,252,105);lantern(g,6,112);lantern(g,373,163);
    // A loop of line on the dock and a ladder disappearing into seawater.
    line(g,261,119,258,131,"#715d52");line(g,265,119,262,131,"#766655");
    for(let j=0;j<3;j++)rect(g,260-j,122+j*3,4,1,"#b19872");
    rect(g,72,157,5,6,"#715d50");rect(g,71,156,7,2,"#c29567");rect(g,72,160,5,1,"#b6a185");
    crate(g,355,156);
    if(key==="winter"){
      for(const [left,end,y] of [[0,265,112],[66,384,163]]){
        for(let x=left+1;x<end-10;x+=9+Math.floor(rnd()*14)){
          const width=4+Math.floor(rnd()*6);
          rect(g,x,y,width,2,"#d6e4e5");rect(g,x+1,y-1,width-3,1,"#f1f2e9");
          if(width>7)rect(g,x+2,y+2,1,2,"#bfd4d9");
        }
      }
      rect(g,252,104,9,2,"#e5edef");rect(g,355,155,8,2,"#e5edef");
    }else if(key==="autumn" || key==="spring"){
      const litter=key==="autumn"?["#b86645","#edb554"]:["#df99a4","#f7ccd1"];
      for(const [x,y] of [[3,115],[14,115],[127,113],[247,115],[72,166],[269,164],[353,166],[370,164]]){
        rect(g,x,y,3,1,litter[0]);rect(g,x+1,y-1,2,1,litter[1]);
      }
    }
    return board;
  }
  const weatherSeed=seed(32165);
  const motes=Array.from({length:76},()=>({
    x:weatherSeed()*W,y:weatherSeed()*H,phase:weatherSeed()*Math.PI*2,depth:weatherSeed()
  }));
  function wrap(value,span){return ((value%span)+span)%span;}
  function atmosphere(g,key,t,night) {
    if(key==="summer"){
      // Fireflies rest in daylight; they come out as the harbour gets dark.
      if(night<=.05)return;
      for(let i=0;i<30;i++){
        const p=motes[i];
        const pulse=Math.sin(t*(.75+p.depth)+p.phase);
        if(pulse<-.32)continue;
        const x=p.x+4*Math.sin(t*.32+p.phase);
        const y=81+p.y*.52+3*Math.sin(t*.61+p.phase);
        g.globalAlpha=(.12+.16*Math.max(0,pulse))*night;
        rect(g,x-1,y-1,3,3,"#ffdd82");
        if(p.depth>.7 && pulse>.45){
          rect(g,x-2,y,5,1,"#ffdd82");rect(g,x,y-2,1,5,"#ffdd82");
        }
        g.globalAlpha=(.64+.32*Math.max(0,pulse))*night;
        rect(g,x,y,1,1,"#fff6ab");
      }
      g.globalAlpha=1;
      return;
    }
    const snow=key==="winter", leaf=key==="autumn";
    const count=snow?76:leaf?25:37;
    for(let i=0;i<count;i++){
      const p=motes[i], wave=Math.sin(t*(.8+p.depth*.65)+p.phase);
      const drift=snow?2.5:leaf?10:7, fall=snow?9:leaf?8:6;
      const x=wrap(p.x+t*drift*(.55+p.depth)+wave*(2+p.depth*3),W+8)-4;
      const y=wrap(p.y+t*fall*(.5+p.depth)+Math.sin(t*.7+p.phase)*1.6,H+8)-4;
      if(snow){
        const size=p.depth>.82?2:1;
        rect(g,x,y,size,size,p.depth>.55?"#f4f5ef":"#d6e3eb");
      }else if(leaf){
        rect(g,x,y,wave>.3?3:2,1,p.depth>.4?"#cb7646":"#b65f47");
        rect(g,x+(wave>.3?1:0),y-1,2,1,"#edaa57");
        if(p.depth>.65){
          rect(g,x-1,y+1,2,1,"#9c6047");rect(g,x+2,y-2,2,1,"#f7be6b");
        }
      }else{
        rect(g,x,y,wave>.2?2:1,1,"#fae0d9");
        rect(g,x+(wave>.2?1:0),y+1,1,1,"#de9fae");
        if(p.depth>.72 && wave>-.45){
          rect(g,x+1,y-1,2,1,"#ffe7e5");rect(g,x+2,y,1,1,"#f3b5c5");
        }
      }
    }
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
  function anglerHead(g,x,y,coat) {
    rect(g,x-2,y-15,5,5,"#674f48");rect(g,x-1,y-14,4,4,"#e9b78b");
    rect(g,x+2,y-13,1,1,"#514b50");rect(g,x-1,y-11,2,1,"#c88e73");
    rect(g,x-3,y-16,6,2,coat);rect(g,x-4,y-14,9,1,"#47565a");
  }
  function parkedRod(g,x,y,gold) {
    line(g,x+9,y-1,x+8,y-26,gold?"#f5c66b":"#665b54");
    rect(g,x+8,y-7,2,5,"#514b48");rect(g,x+6,y-8,3,2,"#b6a18a");
    line(g,x+8,y-25,x+12,y-15,"#bcc5b5");
    rect(g,x+12,y-15,1,3,"#eebc7d");rect(g,x+11,y-13,3,2,"#bd6559");
    rect(g,x+7,y,5,1,"#736554");
  }
  function anglerBody(g,x,y,coat,lean=0,lift=0) {
    const bx=x+lean, by=y-lift;
    rect(g,bx-3,by-10,5,6,"#384a50");rect(g,bx-2,by-10,4,5,coat);
    anglerHead(g,bx,by,coat);
    rect(g,bx-3,by-4,7,2,"#4a5360");
    line(g,bx+2,by-3,x+3,y-1,"#485866");line(g,bx+3,by-3,x+4,y-1,"#485866");
    rect(g,x+2,y-1,4,1,"#635453");
  }
  function anglerHands(g,x,y,coat,handX,handY) {
    const elbowX=(x+2+handX)/2+1, elbowY=(y-9+handY)/2+2;
    line(g,x+1,y-9,elbowX,elbowY,coat);line(g,x+2,y-9,elbowX+1,elbowY,coat);
    line(g,elbowX,elbowY,handX,handY,"#d7a17b");
    rect(g,handX-1,handY-1,3,2,"#e9b78b");
    line(g,x-1,y-7,handX-2,handY+1,coat);rect(g,handX-2,handY,2,2,"#c99573");
  }
  function bobber(g,x,y) {
    rect(g,x,y-2,1,2,"#f6c693");rect(g,x-1,y,3,2,"#bd6559");
  }
  function angler(g,x,y,index,seat,t,receiving=null) {
    const coat=coats[index%coats.length], gold=false;
    anglerBody(g,x,y,coat);
    if(!seat.cast_due_at) {
      // Rest both hands on the lap while the pole is supported beside the chair.
      rect(g,x+1,y-9,2,4,coat);rect(g,x+2,y-6,3,2,"#d7a17b");
      if(receiving)catchArm(g,x,y,coat,-1,receiving.x,receiving.y);
      else rect(g,x-1,y-6,2,2,"#c99573");
      parkedRod(g,x,y,gold);
      return;
    }
    const castX=x+15, destination=x+21+(index%3);
    line(g,x+5,y-7,castX,y-17,gold?"#f5c66b":"#665b54");
    line(g,castX,y-17,castX+4,y-7,"#bcc5b5");
    line(g,castX+4,y-7,destination,y+12,"#a5b5a3");
    if(receiving) {
      catchArm(g,x,y,coat,1,x+5,y-7);
      catchArm(g,x,y,coat,-1,receiving.x,receiving.y);
    } else anglerHands(g,x,y,coat,x+5,y-7);
    const by=y+13+Math.floor((Math.sin(t*2+index)+1)*.8);
    rect(g,destination-2,by+2,5,1,"#acc0a5");bobber(g,destination,by);
  }
  function castingPose(age,duration) {
    const progress=Math.max(0,Math.min(1,age/duration));
    const next=castPoses.findIndex(p=>p[0]>=progress);
    const frame=Math.max(0,(next<0?castPoses.length-1:next)-1);
    const a=castPoses[frame], b=castPoses[frame+1];
    const blend=ease((progress-a[0])/(b[0]-a[0]));
    return a.map((value,i)=>value+(b[i]-value)*blend);
  }
  function castingAngler(g,x,y,index,seat,age,duration,receiving=null) {
    const progress=Math.max(0,Math.min(1,age/duration));
    const [,lean,lift,hx,hy,tx,ty]=castingPose(age,duration);
    const coat=coats[index%coats.length], gold=false;
    anglerBody(g,x,y,coat,Math.round(lean),Math.round(lift));
    line(g,x+hx,y+hy,x+tx,y+ty,gold?"#f5c66b":"#665b54");
    rect(g,x+hx-1,y+hy,2,3,"#514b48");
    if(receiving) {
      catchArm(g,x+lean,y-lift,coat,1,x+hx,y+hy);
      catchArm(g,x+lean,y-lift,coat,-1,receiving.x,receiving.y);
    } else anglerHands(g,x+lean,y-lift,coat,x+hx,y+hy);
    if(progress<.54) {
      const bx=x+tx+3, by=y+ty+10;
      line(g,x+tx,y+ty,bx,by,"#bcc5b5");bobber(g,bx,by);
      return;
    }
    const flight=Math.max(0,Math.min(1,(progress-.54)/.32));
    const destination=x+21+(index%3), startX=x+7, startY=y-20;
    const fx=(1-flight)*(1-flight)*startX+2*(1-flight)*flight*(x+37)+flight*flight*destination;
    const fy=(1-flight)*(1-flight)*startY+2*(1-flight)*flight*(y-36)+flight*flight*(y+13);
    const bendX=(x+tx+fx)/2+2, bendY=(y+ty+fy)/2+3;
    line(g,x+tx,y+ty,bendX,bendY,"#bcc5b5");line(g,bendX,bendY,fx,fy,"#bcc5b5");
    bobber(g,fx,fy);
    if(flight===1) {
      const spread=2+Math.round((progress-.86)*24);
      rect(g,destination-spread,y+15,spread*2+1,1,"#d2e1d3");
      rect(g,destination-spread,y+11,1,2,"#e2eade");
      rect(g,destination+spread,y+10,1,2,"#e2eade");
    }
  }
  function ease(value) {
    const t=Math.max(0,Math.min(1,value));
    return t*t*(3-2*t);
  }
  function castKey(seat) {
    return JSON.stringify([seat.name,seat.cast_started_at,seat.cast_due_at]);
  }
  function interpolatePose(poses,at) {
    const next=poses.findIndex(p=>p[0]>=at);
    const frame=Math.max(0,(next<0?poses.length-1:next)-1);
    const a=poses[frame], b=poses[frame+1], blend=ease((at-a[0])/(b[0]-a[0]));
    return a.map((value,i)=>value+(b[i]-value)*blend);
  }
  function catchTiming(age,duration) {
    // Preserve the pull, handoff and lowering motions; shorten the proud pause first.
    const scale=Math.min(1,duration/2.7), hold=Math.max(0,duration/scale-2.7);
    return {at:age/scale,holdEnd:2.2+hold,displayAge:(2.2+hold/2)*scale};
  }
  function catchPose(index,record,age,duration) {
    const {at,holdEnd}=catchTiming(age,duration);
    const width=Math.round(4+1.7*Math.sqrt(Math.max(10,Math.min(380,record.cm))));
    const [,lean,bodyLift,hx,hy,tx,ty,bx,by]=interpolatePose(retrievePoses,at);
    const lift=ease((at-1.7)/.5), lower=ease((at-holdEnd)/.5);
    const destination=21+(index%3);
    const [,fishX,fishY,angle]=interpolatePose([
      [.22,destination,13+width/2,-.75],
      [.65,destination+1,3,-.65],
      [1.15,7,-9,-.12],
      [1.7,3,-12,0]
    ],at);
    return {at,width,lean,lift:(bodyLift+2*lift)*(1-lower),hx,hy,tx,ty,bx,by,
      fishX:fishX*(1-lift)*(1-lower)+2*lower,
      fishY:(fishY-22*lift)*(1-lower)-6*lower,angle,
      fade:1-ease((at-holdEnd-.15)/.35),lower,
      sparkle:lift*(1-lower),destination};
  }
  function catchArm(g,x,y,coat,side,handX,handY) {
    const sx=x+side*2, sy=y-9;
    const ex=(sx+handX)/2+side*2, ey=(sy+handY)/2+2;
    line(g,sx,sy,ex,ey,coat);line(g,sx+1,sy,ex+1,ey,coat);
    line(g,ex,ey,handX,handY,"#d7a17b");
    rect(g,handX-1,handY-1,3,2,"#e9b78b");
  }
  function celebrateCatch(g,x,y,index,record,age,duration=catchDuration,seat={},receiving=null) {
    const coat=coats[index%coats.length], pose=catchPose(index,record,age,duration);
    const {at,width,lean,lift,hx,hy,tx,ty,bx,by,fishX,fishY,angle,fade,lower,destination}=pose;
    const bodyX=x+Math.round(lean), bodyY=y-Math.round(lift);
    const gold=false;
    const grip=Math.min(5,Math.round(width*.24));
    const mouthX=fishX+Math.cos(angle)*width*.42, mouthY=fishY+Math.sin(angle)*width*.42;
    const park=ease((at-1.15)/.55);

    // Keep the rod in the angler's hand until it is physically lowered into its rest.
    if(at>=1.7) parkedRod(g,x,y,false);
    anglerBody(g,x,y,coat,Math.round(lean),Math.round(lift));
    if(at<1.7) {
      const bow=2*Math.sin(Math.PI*Math.min(1,at/1.15));
      const rodColor=gold?"#f5c66b":"#665b54";
      line(g,x+bx,y+by,x+(hx+tx)/2+bow,y+(hy+ty)/2,rodColor);
      line(g,x+(hx+tx)/2+bow,y+(hy+ty)/2,x+tx,y+ty,rodColor);
      if(at>0)rect(g,x+hx-1,y+hy,2,3,"#514b48");
      // The float dips on the bite; the taut line then brings the fish to the free hand.
      const hooked=ease((at-.16)/.20);
      let endX=destination+(mouthX-destination)*hooked;
      let endY=13+(mouthY-13)*hooked;
      endX+=(12-endX)*park;endY+=(-13-endY)*park;
      const slack=1-ease(at/.22);
      const bendX=(tx+endX)/2+(19-(15+destination)/2)*slack;
      const bendY=(ty+endY)/2-5*slack;
      line(g,x+tx,y+ty,x+bendX,y+bendY,"#bcc5b5");
      line(g,x+bendX,y+bendY,x+endX,y+endY,"#a5b5a3");
      bobber(g,x+endX,y+endY-(1-park)*hooked*4);
      if(at<.28)rect(g,x+destination-2,y+15,5,1,"#acc0a5");
    }

    // One hand winds the reel, then reaches under the fish while the other parks the rod.
    const take=ease((at-.65)/.5), release=ease((at-1.7)/.25);
    const supportY=fishY+Math.round(width*.17);
    const leftX=(hx-2)*(1-take)+(fishX-grip)*take;
    const leftY=(hy+1)*(1-take)+supportY*take;
    const rightX=hx*(1-release)+(fishX+grip)*release;
    const rightY=hy*(1-release)+supportY*release;
    if(at<.65) {
      if(receiving) {
        catchArm(g,bodyX,bodyY,coat,1,x+hx,y+hy);
        catchArm(g,bodyX,bodyY,coat,-1,receiving.x,receiving.y);
      } else {
        anglerHands(g,bodyX,bodyY,coat,x+hx,y+hy);
        const wind=Math.sin(Math.PI*at/.65)*2;
        rect(g,x+hx-2+Math.cos(at*25)*wind,y+hy+1+Math.sin(at*25)*wind,2,2,"#e9b78b");
      }
    } else {
      catchArm(g,bodyX,bodyY,coat,-1,receiving?receiving.x:x+leftX*(1-lower),receiving?receiving.y:y+leftY*(1-lower)-5*lower);
      // Once the rod is parked, the right hand supports the fish while the left accepts the parcel.
      const support=receiving&&at>=1.7;
      catchArm(g,bodyX,bodyY,coat,1,x+(support?fishX+grip:rightX)*(1-lower)+3*lower,
        y+(support?supportY:rightY)*(1-lower)-5*lower);
    }

    // Draw the same fish throughout. The water clips its first appearance as it rises.
    if(at>.22) {
      g.save();g.globalAlpha=fade;
      if(at<.8) {g.beginPath();g.rect(0,0,W,y+13);g.clip();}
      g.translate(Math.round(x+fishX),Math.round(y+fishY));g.rotate(angle);
      window.FishSprites.draw(g,record.fish,-width/2,-width/2,width,width);
      g.restore();
    }
    if(at>.32 && at<.86) {
      const splash=(at-.32)/.54, spread=2+Math.round(splash*6);
      g.save();g.globalAlpha=1-splash;
      rect(g,x+destination-spread,y+14,spread*2+1,1,"#d2e1d3");
      rect(g,x+destination-spread,y+11-Math.sin(splash*Math.PI)*3,1,2,"#e2eade");
      rect(g,x+destination+spread,y+10-Math.sin(splash*Math.PI)*4,1,2,"#e2eade");
      g.restore();
    }
    const sparkling=pose.sparkle>0 && (record.rarity==="稀有" || record.rarity==="传说" || record.rarity==="神秘");
    if(sparkling) {
      g.save();
      sparkles.forEach(([dx,dy],i)=>{
        const twinkle=(1+Math.sin(age*10+i*2.2))/2;
        const sx=x+fishX+dx*(width/2+2), sy=y+fishY+dy*(width/2+2);
        const radius=twinkle>.65?2:1;
        g.globalAlpha=pose.sparkle*(.35+.65*twinkle);
        rect(g,sx-radius,sy,2*radius+1,1,"#ffd477");
        rect(g,sx,sy-radius,1,2*radius+1,"#ffd477");
        rect(g,sx,sy,1,1,"#fff5c9");
      });
      g.restore();
    }
    const headTop=bodyY-16;
    if(at<=.22) return headTop;
    const fishTop=y+fishY-width/2*(Math.abs(Math.sin(angle))+Math.abs(Math.cos(angle)));
    return Math.min(headTop,fishTop-(sparkling?5:0));
  }
  function updateCatchState(scene,state,time) {
    if(scene.state===state) return;
    const firstSnapshot=!scene.state;
    const previousSeats=scene.seats;
    scene.state=state;
    scene.seats=new Map((state?.seats || []).map(seat=>[seat.id,seat]));
    scene.labels.forEach((label,index)=>{
      const name=scene.seats.get(index+1)?.name || "";
      label.textContent=name;
      label.title=name;
      label.hidden=!name;
    });
    const caught=new Map();
    for(const record of state?.catches || []) {
      const seat=scene.seats.get(record.seat);
      if(seat?.name && seat.name===record.name && seat.last_catch_at===record.caught_at) {
        const previous=scene.caught.get(seat.id);
        if(previous?.record.id===record.id) {
          // A manual next cast can arrive while this fish is still being displayed.
          // Only trim the hold, leaving the ongoing handoff and the full lowering motion.
          if(seat.cast_due_at>0 && !previousSeats.get(seat.id)?.cast_due_at) {
            const age=time-previous.start;
            previous.duration=Math.min(previous.duration,Math.max(2.7,age+.5,
              age+seat.cast_due_at-state.server_time-castDuration-.2));
          }
          caught.set(seat.id,previous);
        } else if(state.server_time-record.caught_at<catchDuration) {
          // Leave time for the next cast; shorten the display pause before speeding up the pull.
          const duration=seat.cast_due_at>0?Math.max(.4,Math.min(3.1,seat.cast_due_at-state.server_time-castDuration-.2)):catchDuration;
          const alreadySeen=firstSnapshot?Math.max(state.server_time-record.caught_at,catchTiming(0,duration).displayAge):0;
          caught.set(seat.id,{record,start:time-alreadySeen,duration});
        }
      }
    }
    scene.caught=caught;
    const casts=new Map();
    for(const seat of scene.seats.values()) {
      if(!seat.name || !(seat.cast_due_at>0))continue;
      // The timestamp pair follows a cast when its angler moves into a VIP seat.
      const key=castKey(seat);
      const previous=scene.casts.get(key);
      if(previous) {
        casts.set(key,previous);
        continue;
      }
      const recent=seat.cast_started_at>0 && state.server_time-seat.cast_started_at<2;
      const celebration=caught.get(seat.id);
      const start=celebration?Math.max(time,celebration.start+celebration.duration):time;
      const remaining=seat.cast_due_at-state.server_time-(start-time);
      // A refreshed page or a resumed old cast starts in its current holding pose.
      const play=!firstSnapshot && recent && remaining>.15;
      casts.set(key,{start:play?start:-Infinity,duration:Math.min(castDuration,Math.max(.2,remaining-.1))});
    }
    scene.casts=casts;
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

  // A small supply skiff occupies the open water left of the lower pier.
  // Its cat-eared deckhand uses the same integer pixels as the seated anglers.
  function baitPack(g,x,y,turn=0) {
    g.save();g.translate(Math.round(x),Math.round(y));g.rotate((turn%4)*Math.PI/2);
    rect(g,-3,-5,6,2,"#6c574c");rect(g,-2,-5,4,1,"#eac987");
    rect(g,-4,-3,8,7,"#6c574c");rect(g,-3,-3,6,6,"#d2a96b");
    rect(g,-2,-2,5,4,"#f2d597");rect(g,-1,-1,3,2,"#4d8680");
    rect(g,-2,-1,1,1,"#4d8680");rect(g,1,-1,1,1,"#ebefd2");
    rect(g,-3,2,5,1,"#b48554");g.restore();
  }
  function npcHand(g,sx,sy,hx,hy) {
    const elbowX=(sx+hx)/2,elbowY=(sy+hy)/2+2;
    line(g,sx,sy,elbowX,elbowY,"#426d70");
    line(g,sx+1,sy,elbowX+1,elbowY,"#8ebeb0");
    line(g,elbowX,elbowY,hx,hy,"#d7a579");
    rect(g,hx-1,hy-1,3,3,"#edc496");
  }
  function npcArmPose(frame) {
    const active=frame?.active,age=frame?.age||0;
    if(active?.delivery&&!frame.reduced) {
      const [,hx,hy]=interpolatePose([
        [0,7,-8],[.25,1,-11],[.55,-7,-21],[.76,12,-22],[1.05,15,-16],[1.7,8,-7]
      ],age);
      return [hx,hy];
    }
    if(active?.kind==='join'&&age<2&&!frame.reduced)return [10,-19+Math.round(Math.sin(age*12)*2)];
    if(active?.kind==='catch'&&age<2&&!frame.reduced)return [8,-19];
    return [7,-7];
  }
  function baitSkiff(g,t,frame) {
    const bob=frame?.reduced?0:Math.round(Math.sin(t*.9)),x=31,y=179+bob;
    rect(g,8,y+13,51,1,"#93b7ab");rect(g,15,y+15,36,1,"#7ea599");
    line(g,58,y+1,70,158,"#8a7964");
    poly(g,[[6,y-1],[12,y+1],[56,y+1],[63,y-4],[58,y+9],[49,y+12],[17,y+12],[9,y+7]],"#4e5752");
    poly(g,[[9,y+2],[55,y+2],[60,y-1],[55,y+8],[47,y+10],[18,y+10],[12,y+6]],"#a97951");
    rect(g,13,y+3,42,2,"#d5aa74");rect(g,18,y+7,32,1,"#795b48");
    rect(g,12,y,44,2,"#ecc58a");rect(g,15,y-2,39,2,"#827052");
    // Supply bin and a rolled blanket make the skiff read as a working boat.
    rect(g,43,y-7,10,7,"#765b48");rect(g,44,y-6,8,5,"#bc8c59");
    rect(g,43,y-7,10,1,"#e3b477");rect(g,48,y-6,1,6,"#e3b477");
    rect(g,14,y-5,9,4,"#406c6c");rect(g,15,y-6,6,1,"#8eb4a5");
    rect(g,19,y-5,1,4,"#b2c9ad");
    const lean=frame?.active?.delivery&&frame.age<.76&&!frame.reduced?-1:0,bx=x+lean;
    // A curved cat tail and long hair sit behind a practical sailor's apron.
    // The tail only sways a single pixel; ears and face stay readable while throwing.
    const tail=frame?.reduced?0:Math.round(Math.sin(t*1.35));
    line(g,bx-3,y-6,bx-9,y-7,"#4c424a");
    line(g,bx-9,y-7,bx-12+tail,y-10,"#4c424a");
    line(g,bx-12+tail,y-10,bx-12+tail,y-16,"#4c424a");
    line(g,bx-12+tail,y-16,bx-8+tail,y-17,"#4c424a");
    line(g,bx-3,y-7,bx-9,y-8,"#8b6461");
    line(g,bx-9,y-8,bx-11+tail,y-11,"#8b6461");
    line(g,bx-11+tail,y-11,bx-11+tail,y-15,"#8b6461");
    rect(g,bx-10+tail,y-17,3,2,"#eed7b4");
    rect(g,bx-5,y-22,10,14,"#4c424a");
    rect(g,bx-6,y-18,3,10,"#4c424a");
    rect(g,bx-7,y-11,3,4,"#4c424a");
    rect(g,bx-5,y-19,2,8,"#8b6461");
    rect(g,bx-6,y-10,2,2,"#ae8070");
    // Boots, sleeves, collar and a small apron pocket keep her a working boatkeeper.
    rect(g,bx-4,y-4,3,4,"#374b54");rect(g,bx+1,y-4,3,4,"#374b54");
    rect(g,bx-5,y-1,4,2,"#644e43");rect(g,bx+1,y-1,5,2,"#644e43");
    rect(g,bx-4,y-13,9,10,"#426d70");rect(g,bx-3,y-12,7,8,"#8ebeb0");
    rect(g,bx-2,y-9,5,5,"#eee2b9");rect(g,bx-1,y-7,3,2,"#b7ac85");
    line(g,bx-3,y-12,bx,y-10,"#f2e7c8");line(g,bx+3,y-12,bx,y-10,"#f2e7c8");
    rect(g,bx,y-10,2,2,"#c47a79");
    // Two pointed ears replace the hat; warm inner pixels distinguish them from hair.
    poly(g,[[bx-5,y-27],[bx-1,y-23],[bx-1,y-21],[bx-5,y-21]],"#4c424a");
    poly(g,[[bx+5,y-27],[bx+6,y-21],[bx+2,y-21],[bx+2,y-23]],"#4c424a");
    rect(g,bx-4,y-25,1,3,"#d69b91");rect(g,bx-3,y-23,1,2,"#edc4ad");
    rect(g,bx+4,y-24,1,3,"#d69b91");rect(g,bx+5,y-23,1,2,"#edc4ad");
    rect(g,bx-3,y-23,7,3,"#674e50");rect(g,bx-2,y-22,6,1,"#ae8070");
    rect(g,bx-2,y-20,6,6,"#edc496");rect(g,bx+4,y-18,1,3,"#edc496");
    rect(g,bx-3,y-21,3,4,"#674e50");rect(g,bx,y-21,2,2,"#674e50");
    rect(g,bx+2,y-18,1,2,"#344e50");rect(g,bx+1,y-15,2,1,"#c38b7d");
    rect(g,bx+4,y-19,1,1,"#d79a8c");
    // A small coral hair tie reads even when the sprite is shown at native size.
    rect(g,bx-5,y-13,2,2,"#d7928e");rect(g,bx-6,y-14,1,1,"#f2beaa");
    const [hx,hy]=npcArmPose(frame);
    npcHand(g,bx+3,y-12,x+hx,y+hy);
    npcHand(g,bx-4,y-12,bx-4,y-6);
    if(frame?.active?.delivery&&frame.age<.76&&!frame.reduced)baitPack(g,x+hx,y+hy-3,0);
    else if(!frame?.active)rect(g,bx-5,y-7,3,2,"#d5ae76");
    // A tiny lantern identifies the supply boat after dark in every season.
    rect(g,12,y-18,1,16,"#5e5a4e");line(g,12,y-18,17,y-18,"#5e5a4e");
    rect(g,16,y-17,4,5,"#956649");rect(g,17,y-16,2,3,"#f2d38d");
    return {x,y,release:{x:x+12,y:y-25},basket:{x:48,y:y-10}};
  }
  function deliveryRecipient(frame,scene,elapsed) {
    if(!frame?.active?.delivery||!frame.recipient)return null;
    const [x,y]=spots[frame.recipient.id-1]||[];if(x===undefined)return null;
    let bodyX=x,bodyY=y,poseName='waiting';
    const caught=scene.caught.get(frame.recipient.id),cast=scene.casts.get(castKey(frame.recipient));
    if(caught&&elapsed-caught.start<caught.duration) {
      const age=frame.reduced?catchTiming(0,caught.duration).displayAge:elapsed-caught.start;
      const pose=catchPose(frame.recipient.id-1,caught.record,age,caught.duration);
      bodyX+=Math.round(pose.lean);bodyY-=Math.round(pose.lift);poseName='catch';
    } else if(cast&&elapsed>=cast.start&&elapsed-cast.start<cast.duration&&!frame.reduced) {
      const [,lean,lift]=castingPose(elapsed-cast.start,cast.duration);
      bodyX+=Math.round(lean);bodyY-=Math.round(lift);poseName='casting';
    } else if(!frame.recipient.cast_due_at)poseName='idle';
    const lower=frame.reduced?1:ease((frame.age-2.6)/.8);
    const raise=frame.reduced?1:ease((frame.age-1.55)/.52);
    return {seat:frame.recipient.id,poseName,receiving:frame.age>=1.55&&frame.age<=3.85,
      x:bodyX-1-6*raise+lower*3,y:bodyY-6-6*raise+lower*7,
      endpoint:{x:bodyX-7,y:bodyY-14}};
  }
  function deliveryPack(g,frame,boat,receiver) {
    if(!frame?.active?.delivery)return;
    const {age,recipient,reduced,active}=frame;
    const hand=receiver?.receiving?receiver:null,spot=recipient?spots[recipient.id-1]:null;
    const endpoint=receiver?receiver.endpoint:boat.basket;
    if(reduced) {
      baitPack(g,endpoint.x,endpoint.y,0);return;
    }
    if(age<.76)return;
    if(age<2.16) {
      const u=Math.min(1,(age-.76)/1.4),sx=boat.release.x,sy=boat.release.y;
      const arch=Math.min(48,17+Math.abs(endpoint.x-sx)*.1);
      const cx=(sx+endpoint.x)/2,cy=Math.min(sy,endpoint.y)-arch;
      const at=t=>({x:(1-t)*(1-t)*sx+2*(1-t)*t*cx+t*t*endpoint.x,
        y:(1-t)*(1-t)*sy+2*(1-t)*t*cy+t*t*endpoint.y});
      for(let i=1;i<4;i++) {const trail=at(Math.max(0,u-i*.035));rect(g,trail.x,trail.y,1,1,i===1?"#f3d696":"#bdc6a2");}
      const point=at(u);baitPack(g,point.x,point.y,Math.floor(u*4));
    } else {
      const position=hand?{x:hand.x,y:hand.y-2}:endpoint;
      g.save();g.globalAlpha=1-ease((age-3.5)/.4);baitPack(g,position.x,position.y,0);g.restore();
      if(spot&&age<3.6) {
        const yy=spot[1]-29-Math.floor((age-2.16)*2),xx=spot[0]-9;
        line(g,xx,yy+2,xx+4,yy+2,"#ffedb4");line(g,xx+2,yy,xx+2,yy+4,"#ffedb4");
        text(g,String(Math.min(999,Number(active.casts)||10)),xx+6,yy,"#ffedb4");
      }
    }
  }

  function nightLights(g,night,boatY) {
    if(night<=0)return;
    for(const [x,y] of [[10,104],[377,155],[18,boatY-15]]){
      g.globalAlpha=.065*night;ellipse(g,x,y,13,10,'#ffcc80');
      g.globalAlpha=.12*night;ellipse(g,x,y,7,6,'#ffcd84');
      g.globalAlpha=.85*night;rect(g,x-1,y-2,2,3,'#ffedb1');
    }
    g.globalAlpha=.18*night;
    rect(g,4,112,18,1,'#ffd28d');rect(g,367,163,16,1,'#ffd28d');rect(g,13,boatY+1,16,1,'#ffd28d');
    g.globalAlpha=1;
  }

  window.drawFishingScene = function(canvas,state,timeMs,labelLayer) {
    if(!canvas || !canvas.getContext) return;
    let scene=views.get(canvas);
    if(!scene) {
      canvas.width=W; canvas.height=H; canvas.style.imageRendering="pixelated";
      const labels=labelLayer?spots.map(([x],index)=>{
        const label=document.createElement("span");
        label.className=index>=10?"angler-label vip":"angler-label";
        label.style.left=x/W*100+"%";
        label.hidden=true;
        return label;
      }):[];
      if(labelLayer) labelLayer.replaceChildren(...labels);
      scene={g:canvas.getContext("2d"),front:layer(),season:null,ripples:[],seats:new Map(),caught:new Map(),casts:new Map(),npc:window.HarborNPC?.create(),labels,labelLayer};
      const rnd=seed(92014);
      for(let i=0;i<47;i++) scene.ripples.push([Math.floor(rnd()*W),91+Math.floor(rnd()*112),1+Math.floor(rnd()*8),rnd()*6.28]);
      views.set(canvas,scene);
    }
    let g=scene.g; if(!g)return;
    const key=Object.hasOwn(seasons,state?.season?.key)?state.season.key:"spring";
    const daylight=sampleDay(state,timeMs),lightStep=Math.floor(daylight.hour*40)/40;
    if(scene.season!==key){
      scene.dock=furniture(key);scene.season=key;scene.lightStep=null;
    }
    if(scene.lightStep!==lightStep){
      scene.palette=daylightPalette(seasons[key],lightStep);
      scene.back=background(key,scene.palette,{...daylight,hour:lightStep});scene.lightStep=lightStep;
    }
    const palette=scene.palette;
    const elapsed=(timeMs || 0)/1000;
    const t=motionPreference?.matches?4:elapsed;
    updateCatchState(scene,state,elapsed);
    let npcFrame=null;
    if(scene.npc) {
      window.HarborNPC.update(scene.npc,state,timeMs||0);
      const busy=new Set();
      for(const [id,animation] of scene.caught)if(elapsed-animation.start<animation.duration)busy.add(id);
      for(const seat of scene.seats.values()) {
        const cast=scene.casts.get(castKey(seat));
        if(cast&&elapsed>=cast.start&&elapsed-cast.start<cast.duration)busy.add(seat.id);
      }
      npcFrame=window.HarborNPC.frame(scene.npc,state,timeMs||0,{busy,reduced:motionPreference?.matches});
    }
    g.imageSmoothingEnabled=false;
    g.drawImage(scene.back,0,0);
    for(const [x,y,w,phase] of scene.ripples) {
      if(Math.sin(t*.85+phase+y)>.1) {
        const dx=Math.round(2*Math.sin(t*.45+phase));
        rect(g,x+dx,y,w,1,y>155?palette.sea[4]:palette.ripple);
      }
    }
    for(let i=0;i<3&&daylight.night<.8;i++) {
      const bx=Math.floor((91+i*13+t*1.7)%(W+24))-10, by=20+Math.round(3*Math.sin(t*.21+i*.6))+i%2*3;
      bird(g,bx,by,Math.sin(t*2.7+i)>0);
    }
    atmosphere(g,key,t,daylight.night);
    // Tint the transparent foreground without dimming the sky a second time.
    g=scene.front.getContext('2d');g.clearRect(0,0,W,H);g.imageSmoothingEnabled=false;
    g.drawImage(scene.dock,0,0);
    const npcBoat=baitSkiff(g,t,npcFrame);
    const delivery=deliveryRecipient(npcFrame,scene,elapsed);
    const receiver=delivery?.receiving?delivery:null;
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
    // Keep lower-row names readable when the short-lived NPC bubble crosses them.
    const labelArea=scene.labels.length?scene.labelLayer.getBoundingClientRect():null;
    const speechPanel=labelArea?document.getElementById('npc-dialogue'):null;
    const speechRect=speechPanel&&!speechPanel.hidden?speechPanel.getBoundingClientRect():null;
    const bubble=speechRect&&labelArea.width>0&&labelArea.height>0?{
      left:(speechRect.left-labelArea.left)/labelArea.width*W,
      right:(speechRect.right-labelArea.left)/labelArea.width*W,
      top:(speechRect.top-labelArea.top)/labelArea.height*H,
      bottom:(speechRect.bottom-labelArea.top)/labelArea.height*H
    }:null;
    spots.forEach(([x,y],idx)=>{
      const id=idx+1, seat=scene.seats.get(id)||{}, vip=seat.vip || id>=11;
      chair(g,x,y,vip);
      const catchAnimation=scene.caught.get(id);
      const cast=scene.casts.get(castKey(seat));
      let labelY=y-(idx<6?25:21);
      if(catchAnimation && window.FishSprites && elapsed-catchAnimation.start<catchAnimation.duration) {
        const age=motionPreference?.matches?catchTiming(0,catchAnimation.duration).displayAge:elapsed-catchAnimation.start;
        labelY=Math.min(labelY,celebrateCatch(g,x,y,idx,catchAnimation.record,age,catchAnimation.duration,seat,receiver?.seat===id?receiver:null)-3);
      } else if(seat.name && cast && elapsed>=cast.start && elapsed-cast.start<cast.duration && !motionPreference?.matches) {
        castingAngler(g,x,y,idx,seat,elapsed-cast.start,cast.duration,receiver?.seat===id?receiver:null);
      } else if(seat.name) {
        angler(g,x,y,idx,seat,t,receiver?.seat===id?receiver:null);
      }
      const label=scene.labels[idx];
      if(label && !label.hidden) {
        if(bubble) {
          const half=label.offsetWidth/labelArea.width*W/2;
          const height=label.offsetHeight/labelArea.height*H;
          if(x+half>bubble.left-2&&x-half<bubble.right+2&&labelY>bubble.top-2&&labelY-height<bubble.bottom+2) {
            const raised=Math.min(labelY,bubble.top-3);
            // On narrow screens the bubble is taller relative to the canvas. Use the
            // clear water under the lower pier instead of covering an upper-row angler.
            labelY=idx>=6&&raised-height<112?y+27:raised;
          }
        }
        const top=labelY/H*100+"%";
        if(label.style.top!==top) label.style.top=top;
      }
      numberPlate(g,x,y,id,vip,Boolean(seat.name));
    });
    deliveryPack(g,npcFrame,npcBoat,delivery);
    g.save();g.globalCompositeOperation='source-atop';g.globalAlpha=daylight.night*.3;
    rect(g,0,0,W,H,'#223650');g.restore();
    scene.g.drawImage(scene.front,0,0);
    nightLights(scene.g,daylight.night,npcBoat.y);
  };
})();
