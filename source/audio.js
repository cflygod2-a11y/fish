/* One output per browser profile and origin. Acquire the lock before unmuting the synth. */
(() => {
  'use strict';
  const settings = document.getElementById('sound-settings');
  const status = document.getElementById('sound-status');
  const toggle = document.getElementById('sound-toggle');
  const mute = document.getElementById('sound-mute');
  const lockName = 'wanxi-harbor-audio';
  const signalKey = lockName + '-signal';
  const tab = Math.random().toString(36).slice(2);
  const Audio = window.AudioContext || window.webkitAudioContext;
  const supported = Boolean(Audio && navigator.locks && window.HarborSynth);
  let channel = null;
  try { channel = new BroadcastChannel(lockName); } catch { /* Storage events also carry commands. */ }
  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Private browsing may disallow persistence. */ }
  }

  let context = null;
  let synth = null;
  let pending = null;
  let release = null;
  let remote = false;
  let report = '';
  let lastCommand = {time:0, tab:''};
  let season = 'spring';
  let hour = 6;
  const levels = {effects:0.55, ambience:0.2};

  function render() {
    const playing = Boolean(release && context?.state === 'running');
    settings.dataset.playing = String(playing);
    toggle.disabled = !supported || Boolean(pending);
    toggle.textContent = pending ? '正在开启…' : release ? (playing ? '关闭声音' : '恢复声音') :
      remote ? '切到此页播放' : '开启声音';
    mute.hidden = !remote && (!release || playing);
    status.textContent = report || (!supported ? '请使用支持声音的浏览器，在 localhost 或 HTTPS 打开。' :
      pending ? '正在连接声音输出' : release ? (playing ? '此页正在播放' : '声音已暂停') :
      remote ? '声音正在另一页播放' : '声音已关闭');
  }

  async function refreshOwner() {
    if (supported) {
      try {
        const locks = await navigator.locks.query();
        remote = !release && locks.held.some(lock => lock.name === lockName);
      } catch { remote = false; }
    }
    render();
  }

  function silence() {
    const attempt = pending;
    pending = null;
    attempt?.abort();
    synth?.setActive(false);
    if (context && context.state !== 'closed') context.suspend().catch(() => {});
    if (release) {
      release();
      release = null;
    }
    report = '';
    render();
  }

  // The command with the latest user gesture wins even if channels deliver out of order.
  function receive(command) {
    if (!command) return;
    if (command.action === 'changed') { refreshOwner(); return; }
    if (!['claim','mute'].includes(command.action) || !Number.isFinite(command.time) ||
        typeof command.tab !== 'string' || command.tab === tab) return;
    if (command.time < lastCommand.time ||
        (command.time === lastCommand.time && command.tab <= lastCommand.tab)) return;
    lastCommand = command;
    silence();
    refreshOwner();
  }

  function announce(action) {
    const command = {action, tab, time:Math.max(performance.timeOrigin + performance.now(), lastCommand.time + 0.001)};
    if (action !== 'changed') lastCommand = command;
    save(signalKey, JSON.stringify(command));
    channel?.postMessage(command);
  }
  if (channel) channel.onmessage = event => receive(event.data);

  async function start() {
    const attempt = new AbortController();
    pending = attempt;
    report = '';
    render();
    const timeout = setTimeout(() => {
      if (pending !== attempt) return;
      silence();
      report = '声音暂未开启，可关闭另一页的声音后重试。';
      refreshOwner();
    }, 5000);
    try {
      if (!context || context.state === 'closed') {
        context = new Audio();
        context.onstatechange = () => {
          if (release) synth?.setActive(context.state === 'running');
          render();
        };
      }
      if (!synth) {
        synth = window.HarborSynth.create(context);
        synth.setActive(false);
      }
      // Unlock inside the click before waiting for another page to relinquish the lock.
      const ready = context.resume();
      announce('claim');
      await ready;
      if (pending !== attempt) return;
      await navigator.locks.request(lockName, {signal:attempt.signal}, async () => {
        if (pending !== attempt) return;
        clearTimeout(timeout);
        pending = null;
        remote = false;
        const held = new Promise(resolve => { release = resolve; });
        try {
          synth.setLevels(levels.effects, levels.ambience);
          synth.setEnvironment(season, hour);
          synth.setActive(true);
          synth.play('plop');
          render();
          announce('changed');
          await held;
        } finally {
          release = null;
          synth?.setActive(false);
        }
      });
      announce('changed');
    } catch (error) {
      if (!attempt.signal.aborted) {
        silence();
        report = '声音开启失败，请再次点击开启。';
      }
    } finally {
      clearTimeout(timeout);
      if (pending === attempt) pending = null;
      refreshOwner();
    }
  }

  function stopAll() {
    announce('mute');
    silence();
    refreshOwner();
  }
  toggle.addEventListener('click', () => {
    if (release && context.state !== 'running') {
      context.resume().catch(() => { report = '恢复失败，请关闭声音后再开启。'; render(); });
    } else if (release) stopAll();
    else if (!pending && supported) start();
  });
  mute.addEventListener('click', stopAll);

  function setLevel(name, value) {
    if (value == null || !Number.isFinite(Number(value))) return;
    const percent = Math.round(Math.max(0, Math.min(100, Number(value))));
    levels[name] = percent / 100;
    document.getElementById('sound-' + name).value = String(percent);
    document.getElementById('sound-' + name + '-value').value = percent + '%';
    synth?.setLevels(levels.effects, levels.ambience);
  }
  for (const name of Object.keys(levels)) {
    const key = lockName + '-' + name;
    setLevel(name, read(key));
    document.getElementById('sound-' + name).addEventListener('input', event => {
      setLevel(name, event.target.value);
      save(key, event.target.value);
    });
  }
  window.addEventListener('storage', event => {
    if (event.key === signalKey && event.newValue) {
      try { receive(JSON.parse(event.newValue)); } catch { /* Ignore malformed stored signals. */ }
    } else {
      for (const name of Object.keys(levels)) {
        if (event.key === lockName + '-' + name) setLevel(name, event.newValue);
      }
    }
  });
  settings.addEventListener('toggle', () => { if (settings.open) refreshOwner(); });
  document.addEventListener('click', event => {
    if (settings.open && !settings.contains(event.target)) settings.open = false;
  });
  settings.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      settings.open = false;
      settings.querySelector('summary').focus();
    }
  });
  window.addEventListener('pagehide', () => {
    silence();
    synth?.dispose();
    synth = null;
    if (context) {
      context.onstatechange = null;
      context.close().catch(() => {});
      context = null;
    }
  });
  window.addEventListener('pageshow', refreshOwner);
  window.HarborAudio = {
    play(cue) { if (release && context?.state === 'running') synth.play(cue); },
    setEnvironment(nextSeason, nextHour) {
      if (!nextSeason || !Number.isFinite(nextHour)) return;
      season = nextSeason;
      hour = nextHour;
      if (release) synth.setEnvironment(season, hour);
    }
  };
  refreshOwner();
})();
