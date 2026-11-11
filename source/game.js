'use strict';
const $ = selector => document.querySelector(selector);
const broadcast = new URLSearchParams(location.search).get('broadcast') === '1';
if (broadcast) document.body.classList.add('broadcast');
let state = null;
let polling = false;
let sending = false;
let lastPaint = -Infinity;
let lastReceipt = '';
let latestCatchId = 0;
let announcementTimer = null;
const legendaryCatches = [];
const announcementSeconds = 5;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const signatures = new Map();
const inFlightReceipts = new Set();
const rarities = ['常见', '少见', '稀有', '传说'];
const seasonKeys = ['spring', 'summer', 'autumn', 'winter'];
const seasonShortNames = ['春', '夏', '秋', '冬'];
let nextSeasonTime = null;
let displayedSeconds = -1;
const fishShape = [
  '        22     ', '       21122   ', '     21111112  ', '22  2113111112 ',
  '11221111111412 ', '211111113111112', ' 1211333333332 ', '2  2233333332  ',
  '     2221222   ', '        22     '
];
function node(tag, cls, content) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (content !== undefined) n.textContent = content;
  return n;
}
function setText(selector, value) {
  const target = $(selector), text = String(value);
  if (target.textContent !== text) target.textContent = text;
}
function rarityIndex(label) { return Math.max(0, rarities.indexOf(label)); }
function paintFish(canvas, colors, variant) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let x0 = 4, y0 = 3;
  for (let y=0;y<fishShape.length;y++) {
    for (let x=0;x<fishShape[y].length;x++) {
      const mark = Number(fishShape[y][x]);
      if (!mark) continue;
      ctx.fillStyle = mark === 4 ? '#182831' : colors[mark-1];
      ctx.fillRect(x0+x, y0+y, 1, 1);
    }
  }
  if (variant % 3 === 1) {
    ctx.fillStyle = colors[1];
    for (const x of [10,13]) { ctx.fillRect(x,6,1,2); }
  } else if (variant % 3 === 2) {
    ctx.fillStyle = colors[2]; ctx.fillRect(10,6,1,1); ctx.fillRect(12,7,1,1);
  }
}
paintFish($('#brand-fish'), ['#e3b271','#b87757','#ffdd99'], 1);
paintFish($('#empty-fish'), ['#8dafaf','#547b7e','#b9cec0'], 0);

function speciesSprite(name, width, height) {
  const canvas = node('canvas','sprite');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) window.FishSprites.draw(ctx, name, 0, 0, width, height);
  return canvas;
}

function renderAtlas() {
  const atlas = $('#fish-atlas');
  if (broadcast) return;
  const {names, info} = window.FishSprites;
  setText('#species-count', names.length + ' 种');
  atlas.addEventListener('toggle', () => {
    const grid = $('#species-grid');
    if (!atlas.open || grid.childElementCount) return;
    grid.replaceChildren(...names.map(name => {
      const data = info(name);
      const card = node('li', 'species-card');
      const stage = node('div', 'species-stage');
      stage.append(speciesSprite(name, 160, 72));
      const caption = node('div', 'species-caption');
      const header = node('div', 'species-label');
      header.append(node('h3', '', name), node('span', 'rarity r' + rarityIndex(data.rarity), data.rarity));
      caption.append(header, node('p', '', data.feature));
      card.append(stage, caption);
      return card;
    }));
  });
}
renderAtlas();

function changed(key, data) {
  const value = JSON.stringify(data);
  if (signatures.get(key) === value) return false;
  signatures.set(key,value);
  return true;
}
function measurement(entry) {
  const value = Number(entry.cm);
  const cell = node('span','measurement',Number.isFinite(value) ? value.toFixed(1) : '—');
  cell.append(node('small','', 'cm'));
  return cell;
}
function renderRanking(entries) {
  const list = entries.slice(0,5);
  if (!changed('ranking',list)) return;
  $('#ranking-empty').hidden = list.length > 0;
  $('#ranking').replaceChildren(...list.map((entry,index) => {
    const row = node('li','rank-row'), desc = node('div','fish-desc');
    const meta = node('div','rank-species');
    const fish = node('span','fish-name', entry.fish);
    meta.append(fish);
    if (entry.rarity) meta.append(node('span','rarity r'+rarityIndex(entry.rarity),entry.rarity));
    const angler = node('span','angler', entry.name); angler.title = entry.name;
    desc.append(meta,angler);
    row.append(node('span','rank-no',index+1),speciesSprite(entry.fish, 72, 40),desc,measurement(entry));
    return row;
  }));
}
function renderCatches(entries) {
  const list = entries.slice(0,5);
  if (!changed('catch',list)) return;
  $('#catch-empty').hidden = list.length > 0;
  $('#catch-list').replaceChildren(...list.map(entry => {
    const row = node('li','catch-row'), info = node('div','catch-main'), title = node('div','catch-name');
    title.append(node('b','',entry.name),document.createTextNode(' · '+entry.fish));
    const details = [entry.rarity,entry.size,entry.rod].filter(Boolean);
    info.append(title,node('div','catch-rod',details.join(' / ')));
    row.append(speciesSprite(entry.fish, 64, 36),info,measurement(entry));
    return row;
  }));
}
function showLegendaryCatch() {
  const entry = legendaryCatches.shift();
  const banner = $('#legendary-catch');
  banner.hidden = !entry;
  if (!entry) {
    announcementTimer = null;
    return;
  }
  setText('#legendary-message', `${entry.name} 钓起了 ${entry.cm.toFixed(1)} 厘米长的${entry.fish}！`);
  announcementTimer = setTimeout(showLegendaryCatch, announcementSeconds * 1000);
}
function announceLegendaryCatches(entries, serverTime) {
  // Catch history arrives newest first. Queue new records in the order they were caught.
  const newCatches = entries.filter(entry => entry.id > latestCatchId);
  if (!newCatches.length) return;
  for (const entry of newCatches.reverse()) {
    if (entry.rarity === '传说' && (state || serverTime - entry.caught_at < announcementSeconds)) {
      legendaryCatches.push(entry);
    }
  }
  latestCatchId = entries[0].id;
  if (legendaryCatches.length && announcementTimer === null) showLegendaryCatch();
}
function renderSeats(seats) {
  const displayData = seats.map(s => [s.id,s.name,s.vip,s.rod_ready,s.vip_waiting,s.queued_casts]);
  if (!changed('seats',displayData)) return;
  const occupied = seats.filter(s => s.name);
  setText('#total',occupied.length);
  setText('#normal-count',occupied.filter(s => !s.vip).length+' / 10');
  setText('#vip-count',occupied.filter(s => s.vip).length+' / 2');
  for (const [container,vip] of [['#normal-seats',false],['#vip-seats',true]]) {
    $(container).replaceChildren(...seats.filter(seat=>Boolean(seat.vip)===vip).map(s => {
      const tile = node('div','berth'+(s.name?' filled':''));
      const number = String(s.id).padStart(2,'0');
      const name = s.name || '空席';
      tile.title = number+'号 · '+name+(s.rod_ready?' · 好竿 '+s.rod_ready+' 次':'');
      tile.append(node('span','index',number), node('span','seat-name',name));
      if (s.rod_ready > 0) {
        const charges = node('span','rod-count','✦'+s.rod_ready);
        charges.setAttribute('aria-label','好竿剩余'+s.rod_ready+'次');
        tile.append(charges);
      }
      if (s.queued_casts > 0) {
        const queued = node('span','cast-queue','+'+s.queued_casts);
        queued.title = '待下竿 '+s.queued_casts+' 次';
        queued.setAttribute('aria-label',queued.title);
        tile.append(queued);
      }
      return tile;
    }));
  }
}
function updateSeasonClock(now) {
  if (nextSeasonTime === null) return;
  const seconds = Math.max(0, Math.ceil((nextSeasonTime - now) / 1000));
  if (seconds === displayedSeconds) return;
  displayedSeconds = seconds;
  const part = n => String(n).padStart(2, '0');
  setText('#season-clock', part(Math.floor(seconds / 60)) + ':' + part(seconds % 60));
}
function renderSeason(s, now) {
  const season = s.season;
  const index = seasonKeys.indexOf(season?.key);
  const status = $('#season-status');
  status.hidden = index < 0 || !Number.isFinite(season.nextChangeAt) || !Number.isFinite(s.server_time);
  if (status.hidden) {
    nextSeasonTime = null;
    return;
  }
  nextSeasonTime = now + (season.nextChangeAt - s.server_time) * 1000;
  status.dataset.season = season.key;
  setText('#season-name', season.name);
  setText('#season-next', '后入' + seasonShortNames[(index + 1) % seasonKeys.length]);
  updateSeasonClock(now);
}
function renderSeasonGifts(gifts, demo) {
  if (!changed('season-gifts', [gifts, demo])) return;
  const guide = [], buttons = [];
  seasonKeys.forEach((key, index) => {
    const gift = gifts?.[key];
    if (!gift?.enabled) return;
    const season = seasonShortNames[index];
    const item = node('li');
    item.dataset.season = key;
    item.append(document.createTextNode(gift.label + ' → '), node('b', '', season));
    guide.push(item);
    if (demo && !broadcast) {
      const button = node('button', '', '送' + gift.label + ' · ' + season);
      button.type = 'button';
      button.dataset.season = key;
      button.dataset.action = 'season_' + key;
      button.disabled = sending;
      buttons.push(button);
    }
  });
  $('#season-gifts').replaceChildren(...guide);
  $('#season-guide').hidden = !guide.length;
  $('#season-buttons').replaceChildren(...buttons);
  $('#season-controls').hidden = !buttons.length;
}
function renderActions(s) {
  let mode = s.demo ? '本地试玩' : '抖音直播';
  if (s.platform === 'bilibili') {
    mode = s.live_ended ? 'B站场次已结束' : s.live_connected ? 'B站直播' : 'B站连接中';
  }
  setText('#mode span',mode);
  const castTime = s.cast_seconds ?? s.cast_seconds_range.join('–');
  setText('#cast-note','入座后发「钓鱼」下竿，等待 '+castTime+' 秒上鱼');
  for (const [selector, count] of [['#normal-waiting',s.waiting_normal],['#waiting',s.waiting_vip]]) {
    $(selector).hidden = !count;
    if (count) setText(selector,'候补 '+count+' 人');
  }
  const gifts = s.gifts || {}, tips = [];
  renderSeasonGifts(gifts.seasons, s.demo);
  if (gifts.vip) tips.push((gifts.vip_label || '席位礼物')+'入贵宾席');
  if (gifts.rod) tips.push((gifts.rod_label || '鱼竿礼物')+' · 入座后送礼下竿');
  $('#gift-note').hidden = !tips.length;
  setText('#gift-note',tips.join(' · '));
  $('#good-odds').hidden = !gifts.rod;
  setText('#odds-note','体型按同一鱼种比较。每次起鱼分别抽取鱼种和体型。'+(gifts.rod?'好竿仅作用于一次抛竿。':''));
  $('#simulator').hidden = !s.demo || broadcast;
  $('#sim-vip').hidden = !gifts.vip;
  $('#sim-rod').hidden = !gifts.rod;
}
function animate(now) {
  if (document.visibilityState !== 'hidden' && state && now - lastPaint >= (reduceMotion.matches ? 1000 : 95)) {
    updateSeasonClock(performance.now());
    if (typeof window.drawFishingScene === 'function') {
      window.drawFishingScene($('#harbor'),state,now);
    }
    lastPaint = now;
  }
  requestAnimationFrame(animate);
}
async function confirmRendered(keys,received_ms) {
  try {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = await fetch('/receipts', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({keys,received_ms,rendered_ms:Date.now()}),cache:'no-store'});
    if (!result.ok) throw Error();
  } catch {
    // Pending receipts return in the next state response.
  } finally {
    for (const key of keys) inFlightReceipts.delete(key);
  }
}
function renderReceipts(s,received_ms) {
  if (s.demo || !Array.isArray(s.receipts)) return;
  const receipts = s.receipts.filter(r=>r && typeof r.key === 'string' && !inFlightReceipts.has(r.key));
  if (!receipts.length) return;
  const latest = receipts[receipts.length-1];
  if (latest.key !== lastReceipt && latest.message) {
    setText('#receipt-note',latest.message);
    $('#receipt-note').hidden=false;
    lastReceipt=latest.key;
  }
  const keys=receipts.map(r=>r.key);
  keys.forEach(k=>inFlightReceipts.add(k));
  void confirmRendered(keys,received_ms);
}
async function refresh() {
  if (polling) return;
  polling = true;
  try {
    const resp = await fetch('/state',{cache:'no-store'});
    if (!resp.ok) throw Error();
    const s = await resp.json();
    const received = Date.now();
    renderSeason(s, performance.now());
    renderActions(s);
    renderSeats(s.seats);
    renderRanking(s.ranking);
    renderCatches(s.catches);
    announceLegendaryCatches(s.catches, s.server_time);
    state=s;
    renderReceipts(s,received);
    $('#connection').hidden = true;
  } catch {
    $('#connection').hidden = false;
  } finally {
    polling = false;
  }
}
async function simulate(action) {
  if (!state?.demo || sending) return;
  const name=$('#viewer').value.trim();
  if (!name && action!=='populate') {
    setText('#sim-result','请先填写一位观众的名字。');
    $('#viewer').focus();
    return;
  }
  sending=true;
  const buttons=[...document.querySelectorAll('[data-action]')];
  buttons.forEach(b=>b.disabled=true);
  try {
    const response=await fetch('/simulate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,action})});
    const result=await response.json();
    setText('#sim-result',result.message || (response.ok?'操作已发送。':'操作失败，请重试。'));
    await refresh();
  } catch {
    setText('#sim-result','连接失败，请检查游戏服务后重试。');
  } finally {
    sending=false;
    document.querySelectorAll('[data-action]').forEach(b=>b.disabled=false);
  }
}
$('#simulator').addEventListener('click', e => {
  const button = e.target.closest('button[data-action]');
  if (button) simulate(button.dataset.action);
});
$('#viewer').addEventListener('keydown',e=>{if (e.key==='Enter') simulate('join');});
refresh();
setInterval(refresh,1000);
requestAnimationFrame(animate);
