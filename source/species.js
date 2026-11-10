// Original low-resolution sprites for the catch book, leaderboard and dock.
// Every design is drawn facing right on its own grid. Keep these grids unscaled
// until the complete sprite is drawn, so tiny fins retain crisp silhouettes.
(() => {
  'use strict';

  const species = [
    {
      name: '沙丁鱼', rarity: '常见', feature: '细长银腹，蓝背上排着一列墨点',
      colors: ['#23384c','#486884','#71a9bb','#b5dce4','#f3f2e2','#376b81','#9caabe'],
      paint({p,l,d,eye}) {
        p('fin', '2,14 0,7 7,11 11,11 12,14 6,15 1,18');
        p('shade', '16,10 18,5 22,8 24,10'); p('light', '18,8 19,6 20,8');
        p('base', '7,12 12,10 21,8 29,7 36,8 41,10 44,11 41,13 35,15 26,16 16,15 11,14 7,14');
        p('light', '10,13 20,11 32,10 40,11 39,13 31,15 20,15');
        p('belly', '11,13 22,13 32,12 38,12 35,14 26,15 18,14');
        l('shine', '16,10 23,9 30,8 33,8');
        d('shade', '15,12 19,11 23,11 27,10 31,10');
        l('shade','35,10 34,12 35,13');
        p('fin', '29,12 31,12 27,15'); p('base','17,15 19,17 20,15');
        eye(39,10,'belly',false); l('shade','41,12 43,11');
      }
    },
    {
      name: '竹荚鱼', rarity: '常见', feature: '大眼、金色侧线和深叉黄尾',
      colors: ['#283f43','#396865','#72a696','#b7d8b9','#f2ecc6','#bea950','#ffe196'],
      paint({p,l,d,eye}) {
        p('fin','1,3 6,7 10,12 12,14 8,15 1,22 3,16 5,13 2,10');
        l('shine','2,5 7,11'); l('shade','2,20 7,14 8,14');
        p('shade','13,11 14,7 20,6 22,8 23,9');
        p('fin','24,8 25,2 28,5 31,7');
        p('base','8,13 14,11 20,8 28,6 34,7 39,9 42,12 41,14 34,17 27,19 20,18 13,15 8,15');
        p('light','12,14 20,13 28,10 35,10 40,12 40,14 34,16 26,18 19,17');
        p('belly','18,16 23,15 30,14 38,13 36,15 29,17 23,18');
        l('fin','9,13 18,13 23,11 29,10 32,10');
        l('shine','10,14 18,14 23,12 29,11');
        d('shade','13,13 15,13 17,13'); p('fin','19,17 21,21 25,18');
        p('base','30,12 32,13 26,16'); d('edge','31,10 32,10 31,11');
        eye(36,11,'shine',true); d('shade','40,13 41,12');
      }
    },
    {
      name: '银鲳', rarity: '常见', feature: '近菱形的银盘身，背鳍和腹鳍像两弯月牙',
      colors: ['#3d435c','#69718c','#9da8b8','#cdd3df','#fff4dd','#8c91aa','#dce9ed'],
      paint({p,l,d,eye}) {
        p('fin','1,8 5,11 9,14 8,17 4,19 1,22 3,15');
        p('shade','6,12 13,2 19,2 24,6 19,9 12,11');
        l('shine','9,9 14,3 17,3');
        p('fin','7,18 14,23 18,23 14,26 10,25 6,22');
        p('base','6,13 12,10 17,5 23,5 29,9 31,13 32,15 29,18 25,22 21,24 15,23 11,20 7,17 5,16');
        p('light','10,13 18,7 23,7 27,9 29,12 29,16 25,20 20,22 16,21 11,18');
        p('belly','13,17 20,15 27,13 29,14 27,18 22,21 17,20');
        l('shine','11,13 17,9 21,8 24,8');
        l('base','25,10 23,13 24,16 26,17'); p('shade','22,14 20,17 15,18 19,14');
        d('shine','18,10 20,11 17,12 15,14'); eye(28,11,'shine',false);
        d('shade','30,15 31,14');
      }
    },
    {
      name: '花鲈', rarity: '少见', feature: '锯齿状背鳍、粗壮下颌和背上的黑斑',
      colors: ['#293d40','#425f58','#859782','#aebd9c','#e3dfbb','#596f60','#d5d8ad'],
      paint({p,l,d,eye}) {
        p('fin','1,8 6,9 11,12 12,18 7,18 2,21 3,15');
        l('base','3,10 7,12'); l('base','4,18 8,17');
        p('shade','10,11 12,8 15,7 20,7 23,9 19,12');
        p('fin','18,10 19,5 21,7 23,2 25,6 27,1 29,5 31,2 33,8');
        p('base','8,13 14,10 21,8 30,7 35,9 39,12 45,13 43,15 39,16 44,16 46,15 46,18 41,20 33,21 26,21 19,20 12,17 8,16');
        p('light','12,15 19,14 26,13 33,12 38,14 37,17 43,17 42,19 32,20 22,19');
        p('belly','19,18 28,17 35,17 37,19 40,19 36,20 27,20');
        p('fin','13,17 16,22 21,21 22,19'); p('fin','29,20 28,23 32,21');
        l('base','13,16 19,16 23,15');
        p('shade','33,14 31,17 26,18 28,15');
        l('shade','35,12 34,15 35,17'); l('edge','40,16 43,15');
        for (const [x,y] of [[16,11],[20,10],[23,12],[26,9],[30,10],[14,13],[19,13],[27,12]]) {
          d('shade', x+','+y+' '+(x+1)+','+y);
        }
        eye(39,13,'shine',false);
      }
    },
    {
      name: '真鲷', rarity: '少见', feature: '拱额配红色棘冠，粉金鳞上闪着蓝点',
      colors: ['#503745','#aa5d63','#d98277','#f0ad8d','#ffdfb2','#b75e64','#a6e4da'],
      paint({p,l,d,eye}) {
        p('fin','0,7 5,10 9,12 10,15 6,17 1,22 2,16 3,13');
        l('light','2,9 6,12'); l('light','3,18 7,15');
        p('fin','9,11 12,7 14,5 15,6 18,2 19,4 21,0 22,3 24,0 25,3 27,1 29,5 30,8');
        p('base','8,12 13,9 18,5 23,4 28,5 31,7 34,12 34,15 35,16 32,17 31,20 26,23 20,23 15,20 12,17 8,16');
        p('light','12,13 17,9 22,7 28,8 31,11 32,14 30,17 25,21 19,21 15,18');
        p('belly','14,16 20,16 25,14 30,14 30,17 24,21 20,21');
        p('fin','13,18 12,22 14,22 20,23 20,20'); p('fin','23,21 23,26 27,22');
        p('shade','26,14 22,18 18,18 22,15');
        l('shade','29,9 27,12 28,16 30,17');
        d('shine','15,12 18,9 22,7 23,10 20,12 25,8 14,14');
        d('light','17,7 20,5 23,4 26,4'); eye(31,12,'belly',false);
        l('shade','32,16 34,15');
      }
    },
    {
      name: '蓝点马鲛', rarity: '少见', feature: '矛尖形的长身和尖嘴，侧腹排列钴蓝斑点',
      colors: ['#273d54','#3a5c79','#548fa5','#9ac4c4','#e6e6cf','#426878','#8cdde0'],
      paint({p,l,d,eye}) {
        p('fin','0,3 3,5 8,12 8,14 3,18 0,21 2,15 4,12 2,8');
        p('shade','18,10 20,6 23,6 23,10'); p('base','27,9 29,3 32,6 34,9');
        p('base','6,12 12,12 17,11 22,9 32,7 39,8 45,10 51,13 46,15 39,16 32,17 25,17 18,15 12,14 6,14');
        p('light','12,13 19,12 30,10 37,9 44,11 46,13 43,14 31,16 24,16 17,14');
        p('belly','15,14 25,13 35,12 47,12 47,13 37,15 28,16 23,15');
        p('fin','24,16 22,19 27,17'); p('shade','37,12 33,15 30,15 34,12');
        d('shade','13,11 15,10 17,10 14,15 16,16 18,16');
        for(const [x,y] of [[19,12],[23,11],[27,10],[31,10],[35,9],[22,13],[26,12],[30,12],[34,11]]) {
          d('shade',x+','+y+' '+(x+1)+','+y);
        }
        l('shine','26,9 32,8 37,8'); eye(43,11,'belly',false);
        l('shade','46,13 49,13');
      }
    },
    {
      name: '红石斑', rarity: '稀有', feature: '圆扇尾、厚唇，朱红身体上覆着珊瑚色斑块',
      colors: ['#503741','#8b4a4c','#b96350','#df9068','#f3c393','#ad594e','#ffb578'],
      paint({p,l,d,eye}) {
        p('fin','1,9 5,9 10,12 12,15 9,18 6,21 2,21 0,19 0,12');
        l('light','2,11 7,13'); l('light','2,15 7,15'); l('light','3,19 7,17');
        p('shade','8,13 10,7 13,5 15,6 17,3 19,5 22,1 24,4 26,1 28,5 30,3 32,7 34,7 34,11');
        p('base','8,13 13,9 19,7 25,6 31,7 35,9 37,12 40,13 41,15 38,16 40,17 41,19 37,21 31,21 26,23 19,23 14,21 12,18 8,17');
        p('light','12,16 17,13 25,11 31,11 34,13 34,16 38,18 39,19 31,20 24,22 17,21');
        p('belly','20,20 25,18 32,17 34,19 29,21 22,22');
        p('fin','12,18 11,21 13,23 20,23 20,21'); p('fin','25,21 26,25 30,24 31,21');
        for (const [x,y] of [[15,10],[21,8],[28,9],[13,14],[20,13],[25,11],[17,17],[23,16]]) {
          p('shade',[[x,y],[x+2,y-1],[x+3,y+1],[x+2,y+2],[x,y+2]]);
          d('shine',(x+1)+','+(y+1));
        }
        p('fin','31,13 30,16 27,19 24,19 25,16 28,14');
        l('shade','33,11 32,14 33,16'); l('edge','36,16 39,15');
        l('shine','36,18 39,18'); eye(35,12,'belly',false);
      }
    },
    {
      name: '黄鳍金枪鱼', rarity: '稀有', feature: '纺锤形蓝身，背腹两把金色镰刀向尾部弯去',
      colors: ['#25394a','#345672','#528498','#a1c5bd','#efe6c1','#e7ad43','#ffe486'],
      paint({p,l,d,eye}) {
        p('shade','1,2 4,5 9,12 10,14 5,20 1,24 3,18 5,14 3,9');
        p('fin','11,1 18,4 24,9 26,10 19,11 17,8 14,5');
        l('shine','12,2 17,4 22,8');
        p('base','24,9 27,4 30,7 31,10');
        p('fin','11,26 16,21 19,17 26,18 23,21 18,22');
        l('shine','13,25 19,21 23,20');
        p('base','7,13 12,12 17,10 23,8 29,7 35,8 39,10 44,13 46,14 43,16 37,18 32,20 26,21 21,20 15,17 11,15 7,15');
        p('light','12,14 19,13 27,11 34,11 41,13 43,15 37,17 29,19 23,19 17,17');
        p('belly','16,16 24,15 34,13 42,14 37,16 30,18 24,19 20,18');
        p('shade','34,13 32,14 26,18 21,19 25,16 30,13');
        p('fin','12,12 13,10 14,11'); p('fin','15,11 16,9 17,10');
        d('fin','12,16 14,17 16,18');
        l('shine','17,13 26,11 34,10'); l('shade','36,10 35,13 36,15');
        eye(40,12,'belly',false); d('shade','43,15 44,14');
      }
    },
    {
      name: '珍珠鳐', rarity: '稀有', feature: '俯看的双翼像风筝，细鞭尾从翼后拖出',
      colors: ['#344457','#495b7e','#737eaa','#aaa9ca','#ece0ca','#6d709a','#bce1dc'],
      paint({p,l,d,eye}) {
        l('shade','0,21 3,22 6,22 9,20 12,17 16,16 22,16');
        l('base','5,22 8,21 12,18 17,17 21,16');
        p('base','15,17 20,13 21,6 21,1 24,2 27,5 31,9 35,11 39,14 41,15 39,17 35,18 31,22 27,26 24,30 22,31 22,25 21,21 18,19');
        p('shade','17,17 23,15 30,14 36,15 38,17 31,21 25,27 23,29 23,23 21,19');
        p('light','22,3 24,5 29,10 33,12 29,12 26,10 23,7');
        p('base','21,18 25,16 33,15 39,16 34,18 29,20 24,25 24,21');
        p('light','20,16 25,14 35,13 39,15 33,15 26,15');
        l('belly','25,5 28,8 32,11'); l('light','25,26 29,22 34,18');
        d('shine','24,6 24,10 26,12 22,12 29,10 31,12 24,19 27,18 26,22 30,18 30,20 32,16');
        eye(35,13,'belly',false); eye(35,17,'belly',false);
      }
    },
    {
      name: '星纹旗鱼', rarity: '传说', feature: '长吻像一柄剑，高举的帆形背鳍布满星纹',
      colors: ['#27334e','#384c7d','#4d789f','#7ab4c2','#dbe4ce','#5b649b','#ffdf94'],
      paint({p,l,d,eye}) {
        p('shade','1,14 3,15 7,21 8,23 5,28 1,31 3,26 4,23');
        p('fin','10,21 13,13 17,8 23,3 29,0 30,1 29,5 31,4 31,8 33,7 33,11 35,10 34,14 29,16 17,19');
        p('base','12,19 16,13 20,9 24,6 27,5 24,10 21,10 18,15 15,16');
        l('light','14,14 19,8 25,3 29,1');
        d('shine','17,14 22,10 26,7 27,12 31,9 20,15');
        l('belly','23,6 23,8'); l('belly','22,7 24,7');
        p('base','6,22 11,20 17,18 24,15 30,13 36,12 40,12 45,10 54,7 56,7 47,11 40,14 37,17 31,18 24,20 14,22 7,24');
        p('light','10,22 17,20 26,17 35,14 40,13 37,16 32,17 24,19 14,22');
        p('belly','15,21 23,18 32,16 36,15 33,17 26,19');
        p('shade','34,16 31,20 25,24 20,25 27,20 29,17');
        p('fin','15,22 12,25 18,23'); l('light','40,13 47,10 53,8');
        d('shine','23,16 26,15 29,14'); eye(37,13,'shine',false);
      }
    },
    {
      name: '金鳞皇带鱼', rarity: '传说', feature: '长身弯成金缎带，头顶拖着朱红冠丝',
      colors: ['#514451','#a06359','#c89955','#edc777','#ffebaa','#d7665c','#fff3bf'],
      paint({p,l,d,eye}) {
        p('fin','0,7 3,7 8,10 14,15 21,17 27,16 34,11 40,8 47,7 53,9 54,11 47,10 41,11 34,15 27,19 19,20 12,18 6,12');
        p('base','1,8 7,10 14,15 20,17 25,17 29,15 35,11 41,9 47,9 51,10 54,12 53,15 49,16 44,15 40,15 35,17 29,21 24,23 19,23 14,21 10,17 6,12');
        p('light','8,12 14,16 19,18 24,18 29,17 35,13 40,11 46,10 50,11 51,14 45,14 40,13 34,16 28,20 24,22 19,22 14,20');
        l('belly','2,9 6,11 12,17 18,20 24,21 29,19 35,15 41,12 47,12');
        l('shade','4,7 5,9'); l('fin','9,9 12,13 17,16'); l('fin','24,16 28,15 34,10 39,8');
        l('fin','49,10 48,6 44,3 40,2 37,3'); l('fin','50,9 50,5 48,2 45,0');
        l('light','47,5 43,3'); d('shine','10,14 18,18 21,19 28,18 34,14 38,13 43,11');
        l('shade','47,12 47,14 48,15'); l('fin','48,15 46,18 43,20');
        l('fin','46,15 43,17 40,18'); eye(51,12,'shine',false);
        d('shade','52,14 53,13');
      }
    }
  ];

  // Small integer grids make art direction independent of the viewport's DPR.
  // Polygon interiors and Bresenham strokes both target the same pixel matrix.
  const colorNames = ['edge','shade','base','light','belly','fin','shine'];
  const byName = new Map(species.map(entry => [entry.name, entry]));
  const cache = new Map();
  function makeSprite(item) {
    const W=64, H=40;
    const pixels = new Uint8Array(W*H);
    const color = Object.fromEntries(colorNames.map((k,i)=>[k,i+1]));
    function points(coords) {
      return typeof coords === 'string' ? coords.split(' ').map(pair=>pair.split(',').map(Number)) : coords;
    }
    function dot(fill,x,y) {
      if (x>=0 && y>=0 && x<W && y<H) pixels[y*W+x]=color[fill];
    }
    function segment(fill,start,end) {
      let [x,y]=start;
      const [ex,ey]=end, dx=Math.abs(ex-x), dy=-Math.abs(ey-y);
      const sx=x<ex?1:-1, sy=y<ey?1:-1;
      let err=dx+dy;
      while(true) {
        dot(fill,x,y);
        if(x===ex && y===ey) break;
        const e=2*err;
        if(e>=dy){err+=dy;x+=sx;}
        if(e<=dx){err+=dx;y+=sy;}
      }
    }
    function l(fill,coords) {
      const ps=points(coords);
      for(let i=1;i<ps.length;i++) segment(fill, ps[i-1],ps[i]);
    }
    function p(fill,coords) {
      const ps=points(coords);
      const ys=ps.map(point=>point[1]);
      for(let y=Math.min(...ys);y<=Math.max(...ys);y++) {
        const scan=y+.5, xs=[];
        for(let i=0;i<ps.length;i++) {
          const [x1,y1]=ps[i],[x2,y2]=ps[(i+1)%ps.length];
          if((y1<=scan && y2>scan)||(y2<=scan && y1>scan)) xs.push(x1+(x2-x1)*(scan-y1)/(y2-y1));
        }
        xs.sort((a,b)=>a-b);
        for(let i=0;i+1<xs.length;i+=2) {
          for(let x=Math.ceil(xs[i]);x<=Math.floor(xs[i+1]);x++) dot(fill,x,y);
        }
      }
      l(fill,[...ps,ps[0]]);
    }
    function d(fill,coords) { for(const [x,y] of points(coords)) dot(fill,x,y); }
    function eye(x,y,ring,large) {
      dot(ring,x,y-1);dot(ring,x-1,y);dot(ring,x+1,y);dot(ring,x,y+1);
      dot('edge',x,y);
      if(large){dot('edge',x+1,y);dot('edge',x,y+1);dot('belly',x-1,y-1);}
    }
    item.paint({p,l,d,eye});
    let minX=W, minY=H, maxX=0,maxY=0;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(pixels[y*W+x]) {
      minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
    }
    const sprite=document.createElement('canvas');
    sprite.width=maxX-minX+3; sprite.height=maxY-minY+3;
    const ctx=sprite.getContext('2d');
    const image=ctx.createImageData(sprite.width,sprite.height);
    const rgba=item.colors.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).concat(255));
    const at=(x,y)=>(x>=0&&x<W&&y>=0&&y<H) ? pixels[y*W+x] : 0;
    for(let y=0;y<sprite.height;y++) for(let x=0;x<sprite.width;x++) {
      const gx=minX+x-1, gy=minY+y-1;
      let ink=at(gx,gy);
      if(!ink && (at(gx-1,gy)||at(gx+1,gy)||at(gx,gy-1)||at(gx,gy+1))) ink=color.edge;
      if(ink) image.data.set(rgba[ink-1], (y*sprite.width+x)*4);
    }
    ctx.putImageData(image,0,0);
    return sprite;
  }
  function draw(ctx,name,x,y,width,height,options={}) {
    const item=byName.get(name);
    if(!item || !(width>0 && height>0)) return false;
    if(!cache.has(name)) cache.set(name,makeSprite(item));
    const image=cache.get(name);
    const scale=Math.min(width/image.width,height/image.height);
    const w=Math.max(1,Math.round(image.width*scale));
    const h=Math.max(1,Math.round(image.height*scale));
    const left=Math.round(x+(width-w)/2),top=Math.round(y+(height-h)/2);
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    if(options.flip){ctx.translate(left+w,top);ctx.scale(-1,1);ctx.drawImage(image,0,0,w,h);}
    else ctx.drawImage(image,left,top,w,h);
    ctx.restore();
    return true;
  }
  function info(name) {
    const item=byName.get(name);
    return item ? {name:item.name,rarity:item.rarity,feature:item.feature} : null;
  }
  window.FishSprites=Object.freeze({draw,info,names:Object.freeze(species.map(item=>item.name))});
})();
