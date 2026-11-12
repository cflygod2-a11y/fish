// Personal collections follow the server's display queue and clock. No local award logic.
(() => {
  'use strict';
  const root=document.getElementById('personal-fishbook');
  if(!root)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const seasons={spring:'春',summer:'夏',autumn:'秋',winter:'冬'};
  const sprites=new Map();
  let current=null,showKey='',queue=[],serverAnchor=0,monoAnchor=0,lastClock=0,page=-1,lastPaint=-1,connected=true;
  let header,owner,count,body,footer,pageText,nextText,timer,grid,feature,ceremony,flight,flip,seal,caption,fx,fxCanvas;
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const ease=x=>1-Math.pow(1-clamp(x),3);
  const known=c=>Boolean(c?.unlocked)&&c.best_cm!==null&&Number.isFinite(Number(c.best_cm));
  const book=()=>current?.book||{cards:[],total:0,collected:0};
  const cards=()=>Array.isArray(book().cards)?book().cards:[];
  const ownerName=()=>String(current?.name||book().name||'钓友');
  const total=()=>number(book().total)||cards().length;
  function cardFor(name){return cards().find(c=>c.fish===name)||null;}
  function graphic(name,locked,width=144,height=88){
    const key=name+'|'+locked+'|'+width+'|'+height;
    if(!sprites.has(key)){
      const c=document.createElement('canvas');c.width=width;c.height=height;
      const g=c.getContext('2d');window.FishSprites?.draw(g,name,2,2,width-4,height-4);
      if(locked){g.globalCompositeOperation='source-in';g.fillStyle='#708c98';g.fillRect(0,0,width,height);g.globalCompositeOperation='source-over';}
      sprites.set(key,c);
    }
    const c=document.createElement('canvas');c.width=width;c.height=height;c.setAttribute('aria-hidden','true');
    c.getContext('2d').drawImage(sprites.get(key),0,0);return c;
  }
  function picture(c,large=false,forceKnown=false){
    const unlocked=forceKnown||known(c),p=node('div',large?'fb-ocean':'fb-picture');
    p.append(graphic(c?.fish||'',!unlocked,large?144:112,large?88:64));
    if(!unlocked)p.append(node('span','fb-question','?'));
    return p;
  }
  function featureCard(c,options={}){
    const unlocked=options.forceKnown||known(c),frame=node('article','fb-card'+(unlocked?'':' is-locked'));
    frame.setAttribute('aria-label',unlocked?String(c.fish)+'，'+(options.measureLabel||'个人最大')+' '+number(options.cm??c.best_cm).toFixed(1)+' 厘米':'未解锁鱼卡');
    if(unlocked)frame.dataset.rarity=c.rarity||current?.catch?.rarity||'常见';
    const cap=node('div','fb-card-cap');cap.append(node('span','',unlocked?(frame.dataset.rarity+' · 鱼卡'):'未解锁'),node('span','','WANXI'));frame.append(cap,picture(c,true,unlocked));
    const text=node('div','fb-card-text');text.append(node('h3','fb-fish',unlocked?c.fish:'???'));
    const available=Array.isArray(c.seasons)?c.seasons:[];
    text.append(node('div','fb-seasons',unlocked?(available.length===4?'四季可遇':available.map(s=>seasons[s]||'').join(' · ')+'季可遇'):'尚未钓获'));
    const record=node('div','fb-measure');record.append(node('span','fb-measure-label',options.measureLabel||'个人最大尺寸'));
    const size=node('b','fb-best',unlocked?number(options.cm??c.best_cm).toFixed(1):'—');if(unlocked)size.append(node('small','','cm'));record.append(size);text.append(record);
    const owned=node('div','fb-card-owner');owned.append(node('span','','收藏者 · '+ownerName()),node('span','',unlocked?'已收录':'待点亮'));text.append(owned);frame.append(text);
    return frame;
  }
  function updateQueue(){
    if(!nextText)return;
    const next=queue[0];
    if(next){const what=next.kind==='discovery'?'新鱼入册':next.kind==='record'?'个人新纪录':'鱼册';nextText.textContent='接下来：'+String(next.name||'钓友')+'的'+what;}
    else nextText.textContent='发送「查看」翻开自己的鱼册';
  }
  function shell(){
    root.replaceChildren();root.className='personal-fishbook';root.setAttribute('aria-label','观众个人鱼册');root.dataset.kind=current.kind;
    header=node('header','fb-header');
    const brand=node('div','fb-brand');brand.append(node('span','fb-mark','汐'));
    const identity=node('div','fb-identity');identity.append(node('span','fb-eyebrow','晚汐渔港 · 海洋收藏册'));
    owner=node('h2','fb-owner',ownerName()+'的鱼册');identity.append(owner);brand.append(identity);header.append(brand);
    const collection=node('div','fb-collection');collection.append(node('span','','已经相遇'));
    const tally=node('div');count=node('b','fb-count',String(number(book().collected)));tally.append(count,node('span','',' / '+total()+' 种'));collection.append(tally);header.append(collection);root.append(header);
    body=node('div','fb-body');root.append(body);
    footer=node('footer','fb-footer');pageText=node('span','fb-page');nextText=node('span','fb-next');nextText.setAttribute('aria-live','polite');timer=node('span','fb-timer');timer.setAttribute('aria-hidden','true');footer.append(pageText,nextText,timer);root.append(footer);updateQueue();
    page=-1;lastPaint=-1;
    if(current.kind==='album'){
      body.classList.add('fb-album-body');feature=node('div','fb-feature');const album=node('div','fb-album');
      const heading=node('div','fb-album-heading');heading.append(node('h3','','我的海洋收藏'),node('span','fb-range'));grid=node('div','fb-grid');album.append(heading,grid);body.append(feature,album);
    }else if(current.kind==='discovery')buildDiscovery();
    else if(current.kind==='record')buildRecord();
    else {
      body.classList.add('fb-single');const c=cardFor(current.fish)||cards()[0];if(c)body.append(featureCard(c));
      body.append(node('p','fb-single-note',c&&known(c)?(window.FishSprites?.info(c.fish)?.feature||'这一份相遇，已经收进你的鱼册。'):'海里还有一位朋友，等你来认识。'));
      pageText.textContent='个人鱼卡';
    }
  }
  function albumPage(index){
    page=index;grid.replaceChildren();const list=cards().slice(index*9,index*9+9);
    const featured=list.find(known)||list[0];feature.replaceChildren();if(featured)feature.append(featureCard(featured));
    for(let i=0;i<list.length;i++){
      const c=list[i],unlocked=known(c),tile=node('article','fb-tile'+(unlocked?'':' is-locked'));tile.dataset.cardIndex=String(index*9+i);
      tile.setAttribute('aria-label',unlocked?c.fish+'，个人最大 '+number(c.best_cm).toFixed(1)+' 厘米':'第 '+(index*9+i+1)+' 张鱼卡，未解锁');
      const cap=node('div','fb-tile-cap');cap.append(node('span','',String(index*9+i+1).padStart(3,'0')),node('span','',unlocked?c.rarity:''));tile.append(cap,picture(c));
      tile.append(node('h4','fb-tile-name',unlocked?c.fish:'???'),node('span','fb-tile-best',unlocked?number(c.best_cm).toFixed(1)+' cm':'—'));grid.append(tile);
    }
    const pages=Math.max(1,Math.ceil(cards().length/9));pageText.textContent='第 '+(index+1)+' / '+pages+' 页 · 自动翻页';
    root.querySelector('.fb-range').textContent=String(index*9+1).padStart(3,'0')+' — '+String(index*9+list.length).padStart(3,'0');
  }
  function catchCard(){
    const caught=current.catch||{};
    return cardFor(caught.fish||current.fish)||{fish:caught.fish||current.fish||'',rarity:caught.rarity||'常见',seasons:[],unlocked:true,best_cm:caught.cm};
  }
  function buildDiscovery(){
    const c=catchCard(),rarity=c.rarity;
    body.classList.add('fb-discovery-body');ceremony=node('div','fb-ceremony');ceremony.dataset.rarity=rarity;
    fxCanvas=document.createElement('canvas');fxCanvas.className='fb-effects';fxCanvas.setAttribute('aria-hidden','true');ceremony.append(fxCanvas);fx=fxCanvas.getContext('2d');
    const heading=node('div','fb-ceremony-heading');heading.append(node('span','','晚汐渔港 · 海洋新发现'),node('h3','',rarity==='神秘'?'神秘初遇':rarity==='传说'?'传说初遇':'新鱼入册'),node('p','',ownerName()+' · 首次钓获'));ceremony.append(heading);
    const space=node('div','fb-ceremony-space');flight=node('div','fb-flight');flip=node('div','fb-flip');
    const front=node('div','fb-front');front.append(featureCard(c,{forceKnown:true,cm:current.catch?.cm??c.best_cm,measureLabel:'本次钓获'}));seal=node('div','fb-seal','首次钓获');front.append(seal);
    const reverse=node('div','fb-reverse');reverse.append(node('span','fb-reverse-top','晚汐 · 海洋收藏'),picture({...c,unlocked:false},true),node('span','fb-reverse-bottom','等待点亮的一次相遇'));flip.append(front,reverse);flight.append(flip);space.append(flight);ceremony.append(space);
    caption=node('p','fb-ceremony-caption');ceremony.append(caption,node('div','fb-collection-add'));body.append(ceremony);pageText.textContent='首次入册';
  }
  function buildRecord(){
    const c=catchCard(),caught=current.catch||{};body.classList.add('fb-single','fb-record');
    const title=node('div','fb-record-heading');title.append(node('span','','个人新纪录'),node('h3','',ownerName()+'，这一尾更大了！'));body.append(title,featureCard(c,{forceKnown:true,cm:caught.cm??c.best_cm,measureLabel:'本次新纪录'}));
    const change=node('div','fb-record-change');change.append(node('span','fb-previous',number(caught.previous_cm).toFixed(1)+' cm'),node('span','','→'),node('b','fb-new-size',number(caught.cm).toFixed(1)+' cm'));body.append(change);pageText.textContent='纪录刷新';
  }
  function drawEffects(age,intro,flipTime,rarity){
    const w=ceremony.clientWidth>520?320:192,h=Math.max(1,Math.round(ceremony.clientHeight*w/Math.max(1,ceremony.clientWidth)));
    if(fxCanvas.width!==w||fxCanvas.height!==h){fxCanvas.width=w;fxCanvas.height=h;}
    fx.clearRect(0,0,w,h);if(reduced.matches)return;
    const scale=ceremony.clientWidth/w,cx=w/2,cy=(ceremony.querySelector('.fb-ceremony-heading').offsetHeight+170)/scale;
    const reveal=clamp((age-intro)/flipTime),color=rarity==='神秘'?'#d6bcf4':rarity==='传说'?'#f3d288':'#b5dfd2',count=rarity==='神秘'?50:rarity==='传说'?32:12;
    if(rarity==='神秘')for(let x=0;x<w;x+=3){const y=cy-55+Math.sin(x*.025+age*.7)*20+Math.sin(x*.06-age*.4)*8;fx.fillStyle='#7cdcc2';fx.globalAlpha=.12+reveal*.12;fx.fillRect(x,Math.round(y),3,4+Math.round(15*(1+Math.sin(x*.035))));fx.fillStyle='#b39dde';fx.fillRect(x,Math.round(y-12),3,8);}
    fx.save();fx.translate(cx,cy);fx.rotate(age*.025);fx.fillStyle=color;
    for(let i=0;i<16;i++){fx.rotate(Math.PI/8);fx.globalAlpha=.025+reveal*.045;fx.fillRect(-1,-145,2,105);}fx.restore();
    for(let i=0;i<count;i++){fx.fillStyle=i%3===0?color:'#8bc1d0';fx.globalAlpha=(.16+i%4*.1)*clamp(age/intro);fx.fillRect(Math.round((i*71.3+13)%w),Math.round(h-(i*47.7+age*(9+i%5))%h),i%7===0?2:1,i%7===0?2:1);}
    const burst=age-intro-flipTime*.36;
    if(burst>0&&burst<2.5)for(let i=0;i<count;i++){const angle=i*2.39996323,d=30+burst*(24+i%9*5),x=Math.round(cx+Math.cos(angle)*d),y=Math.round(cy+Math.sin(angle)*d*.8+burst*burst*5);fx.fillStyle=i%3===0?'#fff0bb':color;fx.globalAlpha=(1-burst/2.5)*.8;fx.fillRect(x,y,2,2);if(i%7===0){fx.fillRect(x-2,y+1,6,1);fx.fillRect(x+1,y-2,1,6);}}
    fx.globalAlpha=1;
  }
  function discoveryFrame(age,duration){
    const c=catchCard(),rarity=c.rarity;
    let intro=duration>=4.6?.9:duration>=4?.76:.58,flipTime=duration>=4.6?.7:duration>=4?.65:.5;
    const holdAt=intro+flipTime,settleAt=duration-.6;
    const phase=age<intro?'summon':age<holdAt?'reveal':age<settleAt?'hold':'settle';
    ceremony.dataset.phase=reduced.matches?'hold':phase;
    const title=phase==='summon'?'海里，好像来了位新朋友……':phase==='reveal'?'第一次见到你。':phase==='settle'?'这一份相遇，收进你的鱼册。':'阿喵：这张得珍藏好，喵～';
    if(caption.textContent!==title)caption.textContent=title;
    const before=Number.isFinite(Number(current.collection_before))?number(current.collection_before):Math.max(0,number(book().collected)-1),after=Number.isFinite(Number(current.collection_after))?number(current.collection_after):number(book().collected);
    count.textContent=String(age>=settleAt||reduced.matches?after:before);
    const add=ceremony.querySelector('.fb-collection-add');add.textContent='收藏 +1 · '+before+' → '+after+' / '+total();add.style.opacity=age>=holdAt||reduced.matches?'1':'0';
    if(reduced.matches){flip.style.transform='rotateY(0deg)';flight.style.transform='none';flight.style.opacity='1';seal.style.opacity='1';seal.style.transform='rotate(-9deg)';caption.textContent='已收入你的鱼册';return;}
    const lift=ease(age/intro),turn=ease((age-intro)/flipTime),stamp=clamp((age-holdAt-.12)/.38);
    flip.style.transform='rotateY('+(180*(1-turn))+'deg)';
    flight.style.opacity=String(lift);flight.style.transform='translateY('+(52*(1-lift))+'px) scale('+(.8+.2*lift)+') rotate('+(-5*(1-lift))+'deg)';
    seal.style.opacity=String(clamp(stamp*3));seal.style.transform='scale('+(1+.8*(1-ease(stamp)))+') rotate('+(-9-9*(1-ease(stamp)))+'deg)';
    if(age>=settleAt){const p=ease((age-settleAt)/.6);flight.style.transform='translateY('+(-195*p)+'px) translateX('+(ceremony.clientWidth*.24*p)+'px) scale('+(1-.85*p)+')';flight.style.opacity=String(1-p);}
    drawEffects(age,intro,flipTime,rarity);
  }
  function hide(bridge=false){
    root.classList.toggle('fb-between',bridge);
    if(bridge){root.hidden=false;document.body.classList.add('fishbook-active');root.style.opacity='1';root.style.transform='none';pageText.textContent='准备下一位';timer.textContent='';updateQueue();return;}
    root.hidden=true;document.body.classList.remove('fishbook-active');
  }
  function tick(now=performance.now()){
    const clock=Math.max(lastClock,serverAnchor+Math.max(0,now-monoAnchor)/1000);lastClock=clock;
    if(!current||clock<number(current.started_at)||clock>=number(current.ends_at)){
      // Hold only the layout across the next poll, not the expired card's reading time.
      hide(Boolean(connected&&current&&queue.length&&clock>=number(current.ends_at)&&clock<number(current.ends_at)+1.5));return;
    }
    root.classList.remove('fb-between');
    root.hidden=false;document.body.classList.add('fishbook-active');
    const age=Math.max(0,clock-number(current.started_at)),duration=number(current.duration)||number(current.ends_at)-number(current.started_at),remaining=Math.max(0,number(current.ends_at)-clock);
    timer.textContent=Math.ceil(remaining)+'s';
    let opacity=1,offset=0;
    if(!reduced.matches){opacity=Math.min(clamp(age/.3),clamp(remaining/.3));offset=14*(1-ease(age/.5))+8*(1-clamp(remaining/.3));}
    root.style.opacity=String(opacity);root.style.transform='translateY('+offset+'px)';
    if(current.kind==='album'){
      const elapsed=Math.max(0,clock-number(current.content_started_at??(number(current.started_at)+.5))),index=Math.min(Math.max(0,Math.ceil(cards().length/9)-1),Math.floor(elapsed/4));
      if(index!==page)albumPage(index);
      const phase=elapsed%4;grid.style.opacity=reduced.matches?'1':String(.35+.65*clamp(phase/.25));grid.style.transform=reduced.matches?'none':'translateX('+(8*(1-ease(phase/.25)))+'px)';
    }else if(current.kind==='discovery'&&(now-lastPaint>30||reduced.matches)){
      discoveryFrame(age,duration);lastPaint=now;
    }else if(current.kind==='record'){
      const caught=current.catch||{},start=number(caught.previous_cm),end=number(caught.cm),value=reduced.matches?end:start+(end-start)*ease(age/.9);
      const size=body.querySelector('.fb-best');if(size){const valueText=value.toFixed(1);if(size.firstChild?.nodeValue!==valueText)size.firstChild.nodeValue=valueText;}
      body.classList.toggle('is-record-settled',age>=.9||reduced.matches);
    }
  }
  function update(state,receivedAtMs=performance.now()){
    const payload=state?.fish_book||{};connected=true;serverAnchor=number(state?.server_time);monoAnchor=receivedAtMs;queue=Array.isArray(payload.queue)?payload.queue:[];
    current=payload.current||null;
    if(!current){showKey='';hide();return;}
    const key=String(current.id)+'|'+String(current.started_at)+'|'+current.kind+'|'+ownerName();
    if(key!==showKey){showKey=key;shell();}
    else if(owner){owner.textContent=ownerName()+'的鱼册';}
    updateQueue();lastPaint=-Infinity;tick(receivedAtMs);
  }
  window.FishBook=Object.freeze({update,tick,connectionLost(){connected=false;/* Existing display still expires on the last received server clock. */}});
})();
