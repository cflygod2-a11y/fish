/* Original harbor sounds. The caller owns the AudioContext and its user gesture. */
(() => {
  'use strict';

  const seasons = {
    spring: { cutoff: 980, surf: .095, wind: .068 },
    summer: { cutoff: 1350, surf: .12, wind: .048 },
    autumn: { cutoff: 800, surf: .10, wind: .11 },
    winter: { cutoff: 510, surf: .070, wind: .084 }
  };
  // Minimum time between repeats, followed by priority when all channels are busy.
  const cues = {
    cast: [.32, 0], plop: [.35, 0], bite: [.42, 1], reel: [.53, 0],
    splash: [.38, 0], reveal: [.65, 1], legend: [1.35, 2], mystery: [1.7, 2],
    first: [1, 2], stamp: [.55, 2], record: [.9, 2],
    throw: [.4, 0], catchBait: [.4, 0], meow: [4, 1],
    bookOpen: [.4, 1], page: [.30, 0], bookClose: [.40, 0]
  };

  function create(ctx) {
    const makeGain = (to, value) => {
      const node = ctx.createGain();
      node.gain.value = value;
      node.connect(to);
      return node;
    };
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 5;
    limiter.connect(ctx.destination);
    const master = makeGain(limiter, 0);
    const effects = makeGain(master, .65);
    const ordinary = makeGain(effects, 1);
    const accents = makeGain(effects, 1);
    const ambience = makeGain(master, .3);
    const groups = new Set();
    const lastPlayed = new Map();
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2.7), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    // A few rounded pulse harmonics give the melodic instruments a soft handheld timbre.
    const pulse = ctx.createPeriodicWave(
      new Float32Array(8), new Float32Array([0, 1, .22, .18, .06, .075, .03, .04])
    );
    let active = false, disposed = false;
    let effectsLevel = .65, ambientLevel = .3, season = 'spring', hour = 9;
    let bed = null, natureTimer = 0, lastOrdinary = -Infinity, duckUntil = 0;

    function smooth(param, value, delay = .04) {
      const t = ctx.currentTime;
      param.cancelScheduledValues(t);
      param.setTargetAtTime(value, t, delay);
    }

    function group(to, priority) {
      const g = { bus: makeGain(to, 1), priority, voices: new Set(), retired: false };
      groups.add(g);
      return g;
    }

    function release(g) {
      if (g.retired) return;
      g.retired = true;
      groups.delete(g);
      smooth(g.bus.gain, 0, .004);
      for (const v of g.voices) v.stop(ctx.currentTime + .025);
    }

    function voice(g, source, filter, start, duration, volume, attack, offset) {
      const envelope = makeGain(g.bus, 0);
      if (filter) {
        source.connect(filter);
        filter.connect(envelope);
      } else source.connect(envelope);
      const end = start + duration;
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(volume, start + attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, end);
      g.voices.add(source);
      source.onended = () => {
        source.disconnect();
        if (filter) filter.disconnect();
        envelope.disconnect();
        g.voices.delete(source);
        if (!g.voices.size) {
          groups.delete(g);
          g.bus.disconnect();
        }
      };
      if (offset === undefined) source.start(start);
      else source.start(start, offset);
      source.stop(end + .006);
    }

    function tone(g, start, hz, length, loudness, wave = 'triangle', endHz = hz, attack = .006) {
      const osc = ctx.createOscillator();
      if (wave === 'pulse') osc.setPeriodicWave(pulse);
      else osc.type = wave;
      osc.frequency.setValueAtTime(hz, start);
      if (endHz !== hz) osc.frequency.exponentialRampToValueAtTime(endHz, start + length * .78);
      voice(g, osc, null, start, length, loudness, attack);
    }

    function brush(g, start, length, from, to, loudness, q = .75, attack = .009) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, start);
      filter.frequency.exponentialRampToValueAtTime(to, start + length);
      voice(g, src, filter, start, length, loudness, attack, Math.random() * noise.duration);
    }

    function score(cue, g, t) {
      const note = (dt, ...args) => tone(g, t + dt, ...args);
      const hiss = (dt, ...args) => brush(g, t + dt, ...args);
      const chime = (dt, hz, len, vol = .18) => {
        note(dt, hz, len, vol, 'pulse');
        note(dt + .012, hz * 2, len * .65, vol * .21, 'sine');
      };
      switch (cue) {
        case 'cast':
          hiss(0, .18, 530, 2350, .25, .65, .045);
          note(.03, 230, .085, .055, 'triangle', 385); break;
        case 'plop':
          note(0, 570, .12, .22, 'sine', 118);
          hiss(.009, .12, 1900, 720, .18);
          note(.061, 780, .08, .065, 'sine', 410); break;
        case 'bite':
          note(0, 680, .065, .18, 'pulse', 790);
          note(.083, 990, .115, .145, 'pulse'); break;
        case 'reel':
          [0, .064, .12, .168, .21, .246].forEach((dt, i) => {
            note(dt, 380 + i * 32, .034, .087, 'pulse', 205 + i * 14);
            hiss(dt, .03, 1550, 720, .10);
          }); break;
        case 'splash':
          hiss(0, .26, 1750, 510, .50, .7, .017);
          note(0, 310, .14, .18, 'sine', 78);
          note(.083, 650, .105, .075, 'sine', 240);
          note(.137, 720, .10, .055, 'sine', 350); break;
        case 'reveal':
          chime(0, 392, .15, .13); chime(.10, 587.33, .23, .145); break;
        case 'legend':
          [[0, 392], [.105, 493.88], [.21, 587.33], [.37, 783.99]].forEach(
            ([dt, hz], i) => chime(dt, hz, i === 3 ? .54 : .21));
          note(.37, 392, .50, .09, 'triangle'); break;
        case 'mystery':
          note(0, 220, 1.22, .16, 'sine', 246.94, .10);
          [[.045, 493.88], [.245, 659.25], [.41, 739.99], [.66, 987.77]].forEach(
            ([dt, hz], i) => {
              note(dt, hz, i === 3 ? .72 : .48, .16, 'sine', hz, .016);
              note(dt + .047, hz * 1.502, .46, .044, 'triangle');
            }); break;
        case 'first':
          hiss(0, .32, 410, 1730, .20, .85, .10);
          chime(.07, 329.63, .19, .14); chime(.21, 440, .21, .16);
          chime(.35, 554.37, .23, .17); chime(.53, 659.25, .40, .18); break;
        case 'stamp':
          note(0, 184, .12, .23, 'triangle', 76);
          hiss(0, .075, 1700, 610, .22);
          note(.048, 880, .26, .078, 'sine'); break;
        case 'record':
          chime(0, 440, .14); chime(.09, 554.37, .14); chime(.20, 739.99, .34); break;
        case 'throw':
          hiss(0, .15, 650, 2540, .24, .85, .033); break;
        case 'catchBait':
          hiss(0, .095, 1500, 520, .33); note(.003, 260, .083, .15, 'triangle', 100); break;
        case 'meow':
          note(0, 440, .16, .13, 'pulse', 690, .03);
          note(.12, 680, .19, .14, 'pulse', 380, .016); break;
        case 'bookOpen':
          hiss(0, .18, 740, 1840, .20, .6, .033);
          note(.068, 330, .18, .075, 'triangle', 392); break;
        case 'page':
          hiss(0, .13, 1400, 2900, .21, .55, .028);
          hiss(.055, .105, 1950, 780, .13); break;
        case 'bookClose':
          hiss(0, .13, 1350, 490, .21); note(.018, 185, .10, .14, 'triangle', 120); break;
      }
    }

    function play(cue) {
      if (!active || !effectsLevel || ctx.state !== 'running' || !Object.hasOwn(cues, cue)) return false;
      const now = ctx.currentTime;
      const [gap, priority] = cues[cue];
      if (now - (lastPlayed.get(cue) ?? -Infinity) < gap) return false;
      if (priority === 0 && now - lastOrdinary < .085) return false;
      if (groups.size >= 4) {
        const victim = Array.from(groups).sort((a, b) => a.priority - b.priority)[0];
        if (victim.priority >= priority) return false;
        release(victim);
      }
      if (priority === 0) lastOrdinary = now;
      lastPlayed.set(cue, now);
      if (priority === 2) {
        duckUntil = Math.max(duckUntil, now + (cue === 'mystery' ? 1.30 : cue === 'stamp' ? .22 : .75));
        const gain = ordinary.gain;
        gain.cancelScheduledValues(now);
        gain.setTargetAtTime(.26, now, .014);
        gain.setTargetAtTime(1, duckUntil, .13);
      }
      score(cue, group(priority === 2 ? accents : ordinary, priority), now + .006);
      return true;
    }

    function retune() {
      if (!bed) return;
      const s = seasons[season], night = hour < 6 || hour >= 19;
      smooth(bed.water.frequency, s.cutoff * (night ? .76 : 1), .7);
      smooth(bed.air.frequency, season === 'winter' ? 620 : 1080, .7);
      smooth(bed.swell.gain, s.surf, .65);
      smooth(bed.breeze.gain, s.wind, .65);
    }

    function nature() {
      if (!active || !ambientLevel) return;
      if (ctx.state === 'running' && groups.size < 2) {
        const t = ctx.currentTime + .01;
        if (season === 'spring' && hour >= 5 && hour < 17) {
          const g = group(ambience, -1);
          tone(g, t, 1700, .10, .054, 'sine', 2300, .02);
          tone(g, t + .135, 2120, .13, .046, 'sine', 1590, .022);
        } else if (season === 'summer' && (hour >= 18 || hour < 5)) {
          const g = group(ambience, -1);
          [0, .052, .104, .32, .372].forEach(dt => tone(g, t + dt, 2550, .035, .026, 'sine', 2300));
        }
      }
      natureTimer = setTimeout(nature, 8500 + Math.random() * 6300);
    }

    function startBed() {
      if (bed || !active || !ambientLevel) return;
      const hiss = ctx.createBufferSource();
      hiss.buffer = noise;
      hiss.loop = true;
      const water = ctx.createBiquadFilter(), air = ctx.createBiquadFilter();
      water.type = 'lowpass';
      air.type = 'bandpass';
      air.Q.value = .7;
      const swell = makeGain(ambience, 0), breeze = makeGain(ambience, 0);
      hiss.connect(water).connect(swell);
      hiss.connect(air).connect(breeze);
      const tide = ctx.createOscillator();
      tide.frequency.value = .12;
      const depth = makeGain(swell.gain, .035);
      tide.connect(depth);
      bed = { hiss, water, air, swell, breeze, tide, depth };
      retune();
      hiss.start(0, Math.random() * noise.duration);
      tide.start();
      natureTimer = setTimeout(nature, 6000 + Math.random() * 3600);
    }

    function stopBed() {
      clearTimeout(natureTimer);
      if (!bed) return;
      bed.hiss.stop(); bed.tide.stop();
      Object.values(bed).forEach(node => node.disconnect());
      bed = null;
    }

    function setLevels(fx, env) {
      if (disposed) return;
      const clamp = (v, fallback) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
      effectsLevel = clamp(fx, effectsLevel);
      ambientLevel = clamp(env, ambientLevel);
      smooth(effects.gain, effectsLevel);
      smooth(ambience.gain, ambientLevel);
      if (ambientLevel) startBed();
      else stopBed();
    }

    function setEnvironment(key, currentHour) {
      if (disposed) return;
      if (Object.hasOwn(seasons, key)) season = key;
      if (Number.isFinite(currentHour)) hour = ((currentHour % 24) + 24) % 24;
      retune();
    }

    function setActive(value) {
      if (disposed || active === Boolean(value)) return;
      active = Boolean(value);
      smooth(master.gain, active ? .78 : 0, .012);
      if (active) startBed();
      else {
        stopBed();
        groups.forEach(release);
        lastPlayed.clear();
        lastOrdinary = -Infinity;
        duckUntil = 0;
        smooth(ordinary.gain, 1);
      }
    }

    function dispose() {
      if (disposed) return;
      setActive(false);
      disposed = true;
      [ordinary, accents, effects, ambience, master, limiter].forEach(node => node.disconnect());
    }

    return { play, setLevels, setEnvironment, setActive, dispose };
  }
  window.HarborSynth = { create };
})();
