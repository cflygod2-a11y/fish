/* The harbour catgirl is presentation only: every bait credit is settled by the server. */
(() => {
  'use strict';
  const speechSeconds = 4.2;
  const lines = {
    join: [
      '{name}，坐稳！鱼还在赶路。',
      '欢迎{name}！别踩我的尾巴。',
      '{name}来了，耳朵竖起来啦！',
      '{name}，竿归你，鱼香归我！',
      '欢迎{name}！今天争取晒鱼！',
      '{name}，板凳热乎，鱼还没醒！'
    ],
    bait: [
      '{name}，接稳！这可不是零食。',
      '{name}，鱼饵到，帽子别接！',
      '看这边，{name}！补给飞来咯！',
      '{name}，接包！海鸥可盯着呢。',
      '{name}，鱼饵有份，点心另算。',
      '开饭？开钓！{name}，接好！'
    ],
    stash: [
      '{name}，鱼饵寄船上，我不偷吃。',
      '{name}，包收好了，坐下再钓。',
      '{name}人没坐，鱼饵先报到！',
      '给{name}留好了，海鸥免谈！',
      '{name}，你的补给已靠岸。'
    ],
    legendary: [
      '{name}，这竿够我夸一天！',
      '{name}钓到传说了！耳朵抖抖。',
      '{name}，图鉴压轴都请来了！',
      '传说上岸！{name}，合个影！',
      '{name}，鱼归你，我只闻闻！'
    ],
    mystery: [
      '{name}，这鱼我得现学！',
      '{name}，阿喵今天长见识了！',
      '图鉴呢？{name}钓来新课题了！',
      '{name}，先容我合上下巴。',
      '{name}，这鱼自带神秘感！'
    ],
    giant: [
      '{name}慢点举，小船紧张了！',
      '{name}，这是鱼的房东吧？',
      '{name}，尺子拿长点！',
      '{name}，我的尾巴都惊直了！',
      '{name}，先放稳，咱再夸！'
    ],
    tiny: [
      '{name}这条，走精致路线！',
      '{name}，鱼界随身装到手！',
      '{name}，小鱼也认真上班呢。',
      '{name}，这条负责可爱！',
      '{name}，小鱼也有大志气！',
      '{name}，鱼小，故事我来编！'
    ],
    idle: [
      '钓鱼你们来，摇尾巴我负责！',
      '海风说：今天适合晒尾巴。',
      '数着鱼饵，又想吃饭了。',
      '鱼不开口，阿喵先开口。',
      '鱼归你们，我就闻闻香！'
    ]
  };
  const short = (s,n=4) => Array.from(String(s || '钓友')).slice(0,n).join('');
  const label = event => event.kind==='bait'?'鱼饵补给':event.kind==='join'?'新友入座':event.rarity==='神秘'?'神秘来客':event.rarity==='传说'?'传说上岸':event.size==='巨型'?'巨物上钩':'今日小趣';
  function category(e) {
    if(e.kind==='join'||e.kind==='bait')return e.kind;
    if(e.rarity==='神秘')return 'mystery';
    if(e.rarity==='传说')return 'legendary';
    if(e.size==='巨型')return 'giant';
    return e.tiny?'tiny':null;
  }
  function pick(controller,kind,event={}) {
    const list=lines[kind],previous=controller.lastLine[kind];
    let index=Math.floor(Math.random()*(list.length-(previous===undefined?0:1)));
    if(previous!==undefined&&index>=previous)index++;
    controller.lastLine[kind]=index;
    const sentence=list[index].replaceAll('{name}',short(event.name)).replaceAll('{fish}',short(event.fish,10));
    return /喵[～~]$/.test(sentence)?sentence:sentence.replace(/[。！？!?，,]+$/u,'')+'，喵～';
  }
  function speak(controller,text,caption,kind,now) {
    controller.speech={text,caption,kind,at:now,expiresAt:now+speechSeconds};
    const doc=typeof document==='undefined'?null:document;
    const name=doc?.getElementById?.('npc-name'),message=doc?.getElementById?.('npc-text'),tag=doc?.getElementById?.('npc-caption');
    if(name)name.textContent='阿喵';
    if(message)message.textContent=text;
    if(tag)tag.textContent=caption;
    const panel=doc?.getElementById?.('npc-dialogue');
    if(panel){panel.dataset.mood=kind;panel.hidden=false;}
  }
  function showSpeech(controller,now) {
    const visible=!!controller.speech && now<controller.speech.expiresAt;
    const doc=typeof document==='undefined'?null:document;
    const panel=doc?.getElementById?.('npc-dialogue');
    // The current utterance owns its lifetime. Polling never extends it, and there
    // is no old timeout callback that could hide a more recent utterance.
    if(panel && panel.hidden===visible)panel.hidden=!visible;
    return visible;
  }
  function create() {
    return {initialized:false,state:null,watermark:0,queue:[],active:null,lastLine:{},lastTiny:-Infinity,
      lastIdle:-Infinity,lastSpoken:-Infinity,received:0,serverTime:0,speech:null};
  }
  function enqueue(c,entry,now) {
    const kind=category(entry);if(!kind)return;
    const event={...entry,category:kind,ready:now+(entry.kind==='catch'?1.7:0),queuedAt:now};
    if(kind==='bait') {
      const pending=c.queue.find(e=>e.kind==='bait'&&e.uid===event.uid);
      if(pending){pending.count+=Number(event.count)||1;pending.casts+=Number(event.casts)||10;return;}
    }
    if(kind==='join'&&c.queue.some(e=>e.kind==='join'&&e.uid===event.uid))return;
    if(kind==='tiny'&&(now-c.lastTiny<12||c.queue.some(e=>e.category==='tiny')))return;
    event.priority=kind==='bait'?4:kind==='mystery'?3:kind==='legendary'||kind==='giant'?2:kind==='join'?1:0;
    // Limit visual backlog; credits and catch records never depend on this queue.
    if(c.queue.length>=32) {
      const lower=c.queue.findIndex(e=>e.priority<event.priority);
      if(lower>=0)c.queue.splice(lower,1);else c.queue.shift();
    }
    c.queue.push(event);
  }
  function update(c,state,timeMs) {
    if(c.state===state)return;
    c.state=state;c.received=timeMs/1000;c.serverTime=Number(state?.server_time)||0;
    const events=(state?.scene_events||[]).filter(e=>Number.isFinite(e.id)).slice().sort((a,b)=>a.id-b.id);
    if(!c.initialized) {
      c.initialized=true;c.watermark=events.length?events[events.length-1].id:0;c.lastIdle=c.received;
      speak(c,pick(c,'idle'),'鱼饵小船 · 随时待命','idle',c.received);return;
    }
    for(const e of events) {
      if(e.id<=c.watermark)continue;c.watermark=e.id;
      // A tab restored after a long absence must not replay old gifts or greetings.
      if(c.serverTime-Number(e.at)>25)continue;
      enqueue(c,e,c.received);
    }
  }
  function target(event,state) {
    if(!event?.uid)return null;
    return (state?.seats||[]).find(s=>s.uid===event.uid&&s.name)||null;
  }
  function frame(c,state,timeMs,options={}) {
    const now=timeMs/1000,serverNow=c.serverTime+now-c.received;
    if(c.active&&now-c.active.started>=c.active.duration)c.active=null;
    if(c.active&&!c.active.delivery&&now-c.active.started>1.1&&c.queue.some(e=>e.kind==='bait'))c.active=null;
    c.queue=c.queue.filter(e=>now-e.queuedAt<(e.kind==='bait'?70:18));
    if(!c.active) {
      const candidates=c.queue.filter(e=>e.ready<=now).sort((a,b)=>b.priority-a.priority||a.id-b.id);
      const next=candidates.find(e=>{
        if(e.kind!=='bait')return true;
        const seat=target(e,state);
        return !seat||!options.busy?.has(seat.id)||now-e.queuedAt>7;
      });
      if(next) {
        c.queue.splice(c.queue.indexOf(next),1);
        const seated=target(next,state),kind=next.kind==='bait'&&!seated?'stash':next.category;
        c.active={...next,started:now,duration:next.kind==='bait'?4.1:4.8,delivery:next.kind==='bait',hadTarget:Boolean(seated)};
        if(kind==='tiny')c.lastTiny=now;
        const detail=next.kind==='bait'?`${Number(next.count)||1} 份鱼饵包 · 增加 ${Number(next.casts)||10} 次 · 概率不变`:label(next);
        speak(c,pick(c,kind,next),detail,kind,now);c.lastSpoken=now;c.lastIdle=now;
      } else if(now-c.lastIdle>=35&&now-c.lastSpoken>=12) {
        speak(c,pick(c,'idle'),'鱼饵小船 · 随时待命','idle',now);c.lastIdle=now;
      }
    }
    const active=c.active,age=active?now-active.started:0;
    let recipient=active?.delivery?target(active,state):null;
    // A recipient who leaves is never replaced by whoever occupies that seat next.
    if(active?.delivery&&!recipient)active.returnToBoat=true;
    if(active?.returnToBoat)recipient=null;
    const speechVisible=showSpeech(c,now);
    return {active,age,recipient,serverNow,speech:c.speech,speechVisible,queueLength:c.queue.length,reduced:!!options.reduced};
  }
  window.HarborNPC=Object.freeze({create,update,frame});
})();
