'use strict';

/* =========================================================
 *  Hintergrundmusik: „Korobeiniki“ (russisches Volkslied, 19. Jh.,
 *  gemeinfrei) im Balalaika-Stil – komplett mit Web Audio erzeugt,
 *  ohne Audiodateien. Mit jeder Wiederholung wird es etwas schneller,
 *  wie bei einem russischen Tanz.
 * ========================================================= */

const Music = (() => {
  const STORE_KEY = 'pokedurak-music';
  const BASE_BPM = 132;
  const LOOK_AHEAD = 0.3;    // Sekunden, die im Voraus eingeplant werden

  const SEMI = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
  function freq(note) {
    const m = /^([A-G]#?)(\d)$/.exec(note);
    return 440 * Math.pow(2, (SEMI[m[1]] + (Number(m[2]) - 4) * 12) / 12);
  }

  // Melodie: [Note, Dauer in Schlägen], null = Pause. 8 Takte à 4 Schläge.
  const MELODY = [
    ['E5', 1], ['B4', .5], ['C5', .5], ['D5', 1], ['C5', .5], ['B4', .5],
    ['A4', 1], ['A4', .5], ['C5', .5], ['E5', 1], ['D5', .5], ['C5', .5],
    ['B4', 1.5], ['C5', .5], ['D5', 1], ['E5', 1],
    ['C5', 1], ['A4', 1], ['A4', 1], [null, 1],
    [null, .5], ['D5', 1], ['F5', .5], ['A5', 1], ['G5', .5], ['F5', .5],
    ['E5', 1.5], ['C5', .5], ['E5', 1], ['D5', .5], ['C5', .5],
    ['B4', 1], ['B4', .5], ['C5', .5], ['D5', 1], ['E5', 1],
    ['C5', 1], ['A4', 1], ['A4', 1], [null, 1],
  ];
  // Begleitung je Takt: [Grundton, Quinte, Akkord]  (Am Am E Am | Dm C E Am)
  const HARMONY = [
    ['A2', 'E2', ['A3', 'C4', 'E4']],
    ['A2', 'E2', ['A3', 'C4', 'E4']],
    ['E2', 'B2', ['G#3', 'B3', 'E4']],
    ['A2', 'E2', ['A3', 'C4', 'E4']],
    ['D2', 'A2', ['D4', 'F4', 'A3']],
    ['C3', 'G2', ['C4', 'E4', 'G3']],
    ['E2', 'B2', ['G#3', 'B3', 'E4']],
    ['A2', 'E2', ['A3', 'C4', 'E4']],
  ];

  // Alle Ereignisse eines Durchlaufs (Melodie zweimal: einmal normal, einmal eine Oktave höher gespielt)
  const EVENTS = [];
  const BARS_PER_PASS = 8;
  for (let pass = 0; pass < 2; pass++) {
    const off = pass * BARS_PER_PASS * 4;
    let t = 0;
    for (const [n, d] of MELODY) {
      if (n) EVENTS.push({ t: off + t, type: 'mel', note: n, dur: d, oct: pass });
      t += d;
    }
    HARMONY.forEach(([root, fifth, chord], bar) => {
      const b = off + bar * 4;
      EVENTS.push({ t: b, type: 'bass', note: root });
      EVENTS.push({ t: b + 1, type: 'chord', notes: chord });
      EVENTS.push({ t: b + 2, type: 'bass', note: fifth });
      EVENTS.push({ t: b + 3, type: 'chord', notes: chord });
    });
  }
  EVENTS.sort((a, b) => a.t - b.t);
  const LOOP_BEATS = 2 * BARS_PER_PASS * 4;

  let ctx = null, master = null, timer = null;
  let playing = false, loopStart = 0, idx = 0, loop = 0, bpm = BASE_BPM;

  /* ----- Instrumente ----- */

  // Gezupfte Saite (Balalaika): Sägezahn + Oktave durch einen sich schließenden Tiefpass
  function pluck(time, f, vol, decay, bright = 3500) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(bright, time);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.5, 300), time + decay);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2.005;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(master);
    o1.start(time); o2.start(time);
    o1.stop(time + decay + 0.05); o2.stop(time + decay + 0.05);
  }

  function bass(time, f) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.55, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(g).connect(master);
    o.start(time);
    o.stop(time + 0.5);
  }

  function play(ev, time, spb) {
    if (ev.type === 'mel') {
      const f = freq(ev.note) * (ev.oct ? 2 : 1);
      const len = ev.dur * spb;
      const vol = ev.oct ? 0.16 : 0.2;
      if (len >= 0.4) {
        // Lange Töne: typisches Balalaika-Tremolo
        const step = 1 / 11;
        for (let x = 0, k = 0; x < len - 0.03; x += step, k++) {
          pluck(time + x, f, vol * (k ? 0.62 : 1), step * 1.6);
        }
      } else {
        pluck(time, f, vol, Math.min(0.5, len + 0.18));
      }
    } else if (ev.type === 'bass') {
      bass(time, freq(ev.note));
    } else {
      for (const n of ev.notes) pluck(time, freq(n), 0.06, 0.16, 2200);
    }
  }

  /* ----- Ablaufsteuerung ----- */

  function tick() {
    if (!playing) return;
    const now = ctx.currentTime;
    let spb = 60 / bpm;
    for (;;) {
      if (idx >= EVENTS.length) {
        const end = loopStart + LOOP_BEATS * spb;
        if (end > now + LOOK_AHEAD) break;
        // Nächster Durchlauf – etwas schneller, nach dem 4. wieder gemütlich
        loopStart = end;
        loop = (loop + 1) % 4;
        bpm = BASE_BPM * (1 + 0.14 * loop);
        spb = 60 / bpm;
        idx = 0;
      }
      const ev = EVENTS[idx];
      const time = loopStart + ev.t * spb;
      if (time > now + LOOK_AHEAD) break;
      if (time >= now - 0.05) play(ev, Math.max(time, now), spb);
      idx++;
    }
  }

  function enabled() {
    try { return localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; }
  }

  function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    return ctx;
  }

  function start() {
    if (playing) return;
    if (!getCtx()) return;
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    playing = true;
    loop = 0;
    bpm = BASE_BPM;
    idx = 0;
    loopStart = ctx.currentTime + 0.15;
    timer = setInterval(tick, 40);
    tick();
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    const m = master;
    m.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => m.disconnect(), 400);
  }

  function setEnabled(on) {
    try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* egal */ }
    if (on) start(); else stop();
  }

  // Beim Wechsel in eine andere App/Tab pausieren
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (playing) ctx.resume();
  });

  // Browser erlauben Ton erst nach einer Berührung – beim ersten Tippen starten
  function unlock() {
    if (enabled()) start();
    ['pointerup', 'touchend', 'click', 'keydown'].forEach(t => document.removeEventListener(t, unlock, true));
  }
  ['pointerup', 'touchend', 'click', 'keydown'].forEach(t => document.addEventListener(t, unlock, true));

  return { start, stop, enabled, setEnabled, getCtx, isPlaying: () => playing };
})();

/* =========================================================
 *  Soundeffekte (ebenfalls live erzeugt)
 *  bljat(): beim Aufnehmen – zufällig ein kurzer Schrei oder ein Spucken
 * ========================================================= */

const Sfx = (() => {
  let noise = null;

  function noiseBuffer(ctx) {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  function out(ctx, vol) {
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(ctx.destination);
    return g;
  }

  function noiseBurst(ctx, dest, t, dur, filterType, f0, f1, q, vol) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // Cartoon-Schrei „Aaah!“: Sägezahn mit Vibrato durch „A“-Formanten
  function scream(ctx) {
    const t = ctx.currentTime + 0.02;
    const dur = 0.7;
    const dest = out(ctx, 0.9);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    env.gain.setValueAtTime(0.5, t + dur - 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(dest);

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(480, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(330, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 28;
    lfo.connect(lfoGain).connect(o.frequency);

    for (const [f, q, v] of [[800, 6, 1], [1150, 7, 0.7], [2900, 9, 0.35]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(bp).connect(g).connect(env);
    }
    // etwas Atem/Rauheit
    noiseBurst(ctx, env, t, dur, 'bandpass', 1400, 900, 1.2, 0.25);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // Spucken „Ptui!“ – mit kleinem Aufklatschen
  function spit(ctx) {
    const t = ctx.currentTime + 0.02;
    const dest = out(ctx, 1);
    // „P“: kurzer, dumpfer Lippenknall
    noiseBurst(ctx, dest, t, 0.03, 'lowpass', 900, 300, 0.7, 0.9);
    // „tjui“: zischender Luftstoß, Filter steigt
    noiseBurst(ctx, dest, t + 0.07, 0.2, 'bandpass', 2200, 7000, 2.5, 0.8);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(dest);
    o.start(t + 0.08); o.stop(t + 0.25);
    // Aufklatschen
    noiseBurst(ctx, dest, t + 0.42, 0.09, 'lowpass', 1600, 250, 1, 0.7);
    noiseBurst(ctx, dest, t + 0.47, 0.06, 'bandpass', 3000, 1200, 2, 0.25);
  }

  let last = Math.random() < 0.5;
  function bljat() {
    const ctx = Music.getCtx();
    if (!ctx) return;
    last = !last;
    if (last) scream(ctx); else spit(ctx);
  }

  return { bljat, scream, spit };
})();
