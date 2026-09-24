'use strict';

/* =========================================================
 *  Hintergrundmusik: „Kalinka“ (russisches Volkslied, Iwan Larionow 1860,
 *  gemeinfrei) im Stil der alten Pokémon-Game-Boy-Spiele: Rechteck-Melodie,
 *  schnelle Akkord-Arpeggios, pumpender Bass und 8-Bit-Schlagzeug.
 *  Alles wird live mit Web Audio erzeugt. Wie in Russland üblich wird der
 *  Refrain mit jeder Wiederholung schneller.
 * ========================================================= */

const Music = (() => {
  const STORE_KEY = 'pokedurak-music';
  const LOOK_AHEAD = 0.3;

  const SEMI = { C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, Bb: 1, B: 2 };
  function freq(note) {
    const m = /^([A-G](?:#|b)?)(\d)$/.exec(note);
    return 440 * Math.pow(2, (SEMI[m[1]] + (Number(m[2]) - 4) * 12) / 12);
  }

  const CH = {
    Dm: ['D3', 'D4', 'F4', 'A4'], A7: ['A2', 'A3', 'C#4', 'E4', 'G4'], F: ['F2', 'F3', 'A3', 'C4'],
    C7: ['C3', 'C4', 'E4', 'Bb4'], Bb: ['Bb2', 'Bb3', 'D4', 'F4'], G7: ['G2', 'G3', 'B3', 'F4'],
    C: ['C3', 'C4', 'E4', 'G4'], Gm: ['G2', 'G3', 'Bb3', 'D4'],
  };

  // Takte im 2/4-Takt: [Melodie [[Note, Schläge], …], Akkord(e) je Schlag]
  const VERSE = [
    [[['A4', .5], ['C5', .5], ['Bb4', .5], ['A4', .25], ['G4', .25]], ['F', 'C7']],
    [[['F4', 1], ['C4', 1]], ['F', 'F']],
    [[['A4', .5], ['C5', .5], ['Bb4', .5], ['A4', .25], ['G4', .25]], ['F', 'C7']],
    [[['F4', 1], ['C4', 1]], ['F', 'F']],
    [[['D4', 1], ['D4', .5], ['E4', .5]], ['Bb', 'Bb']],
    [[['G4', .5], ['F4', .5], ['E4', .5], ['D4', .5]], ['G7', 'G7']],
    [[['C4', 1], ['C4', 1]], ['C', 'C']],
    [[['C4', 1], ['C5', 1]], ['C', 'C']],
    [[['A4', .5], ['C5', .5], ['G4', .5], ['A4', .5]], ['F', 'C7']],
    [[['F4', 1], ['C4', 1]], ['F', 'F']],
    [[['A4', .5], ['C5', .5], ['G4', .5], ['A4', .5]], ['F', 'C7']],
    [[['F4', 1], ['C4', 1]], ['F', 'F']],
    [[['D4', 1], ['D4', .5], ['E4', .5]], ['Bb', 'Bb']],
    [[['G4', .5], ['F4', .5], ['E4', .5], ['D4', .5]], ['G7', 'G7']],
    [[['C5', 1], ['Bb4', 1]], ['C', 'Gm']],
    [[['A4', 2]], ['A7', 'A7']],          // zugleich Auftakt „Ka-“ zum Refrain
  ];
  // Refrain: „…lin-ka, ka-lin-ka, ka-lin-ka mo-ja! W sadu jagoda malinka, malinka moja!“
  const chorus = pickup => [
    [[['G4', 1], ['E4', .5], ['F4', .5]], ['A7', 'A7']],
    [[['G4', 1], ['E4', .5], ['F4', .5]], ['A7', 'A7']],
    [[['G4', 1], ['F4', .5], ['E4', .5]], ['A7', 'A7']],
    [[['D4', 1], ['A4', .5], ['A4', .5]], ['Dm', 'Dm']],
    [[['G4', .75], ['F4', .25], ['E4', .5], ['F4', .5]], ['A7', 'A7']],
    [[['G4', 1], ['E4', .5], ['F4', .5]], ['A7', 'A7']],
    [[['G4', 1], ['F4', .5], ['E4', .5]], ['A7', 'A7']],
    [pickup ? [['D4', 1], ['A4', 1]] : [['D4', 2]], ['Dm', 'Dm']],
  ];
  // Eigenes kurzes 8-Bit-Intro (aufsteigende Arpeggios), endet mit dem Auftakt
  const INTRO = [
    [[['D5', .25], ['F5', .25], ['A5', .25], ['D6', .25], ['A5', .25], ['F5', .25], ['D5', .25], ['F5', .25]], ['Dm', 'Dm']],
    [[['D5', .25], ['F5', .25], ['A5', .25], ['D6', .25], ['A5', .25], ['F5', .25], ['D5', .25], ['F5', .25]], ['Dm', 'Dm']],
    [[['C#5', .25], ['E5', .25], ['G5', .25], ['A5', .25], ['G5', .25], ['E5', .25], ['C#5', .25], ['E5', .25]], ['A7', 'A7']],
    [[['D5', .5], ['D5', .5], [null, .5], ['A4', .5]], ['Dm', 'Dm']],
  ];

  function section(bars, bpm, style) {
    const ev = [];
    bars.forEach(([mel, chords], b) => {
      const t0 = b * 2;
      let t = t0;
      for (const [n, d] of mel) {
        if (n) ev.push({ t, type: 'lead', note: n, dur: d });
        t += d;
      }
      chords.forEach((c, beat) => {
        const tb = t0 + beat;
        const ch = CH[c];
        ev.push({ t: tb, type: 'bass', note: ch[0], dur: .5 });
        ev.push({ t: tb + .5, type: 'bass', note: ch[1], dur: .5 });
        ev.push({ t: tb, type: 'arp', notes: ch.slice(1), dur: 1 });
        if (style !== 'soft' || beat === 0) ev.push({ t: tb, type: beat === 0 ? 'kick' : 'snare' });
        ev.push({ t: tb + .5, type: 'hat' });
        if (style === 'hot') { ev.push({ t: tb + .25, type: 'hat', soft: true }); ev.push({ t: tb + .75, type: 'hat', soft: true }); }
      });
    });
    ev.sort((a, b) => a.t - b.t);
    return { bpm, beats: bars.length * 2, ev };
  }

  const SONG = [
    section(INTRO, 150, 'normal'),
    section(VERSE, 112, 'soft'),
    section(chorus(true), 150, 'normal'),
    section(chorus(true), 172, 'normal'),
    section(chorus(true), 198, 'hot'),
    section(chorus(false), 228, 'hot'),
  ];
  const LOOP_FROM = 1;   // nach dem Intro geht es immer wieder mit der Strophe weiter

  let ctx = null, master = null, timer = null, noise = null, waves = {};
  let playing = false, sec = 0, secStart = 0, idx = 0;

  function pulseWave(duty) {
    if (waves[duty]) return waves[duty];
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    return (waves[duty] = ctx.createPeriodicWave(re, im));
  }

  function noiseBuf() {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  /* ----- 8-Bit-Instrumente ----- */

  function tone(time, f, len, vol, wave, vib = false) {
    const o = ctx.createOscillator();
    if (typeof wave === 'string') o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.006);
    g.gain.setTargetAtTime(vol * 0.7, time + 0.02, 0.08);
    g.gain.setTargetAtTime(0.0001, time + Math.max(0.02, len - 0.03), 0.015);
    if (vib && len > 0.3) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, time);
      lg.gain.linearRampToValueAtTime(f * 0.012, time + 0.25);
      lfo.connect(lg).connect(o.frequency);
      lfo.start(time); lfo.stop(time + len + 0.1);
    }
    o.connect(g).connect(master);
    o.start(time);
    o.stop(time + len + 0.1);
  }

  function drum(time, kind, soft) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let len;
    if (kind === 'kick') {
      // Game-Boy-Kick: kurzer Tonsprung nach unten
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(180, time);
      o.frequency.exponentialRampToValueAtTime(45, time + 0.1);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.22, time);
      og.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
      o.connect(og).connect(master);
      o.start(time); o.stop(time + 0.15);
      f.type = 'lowpass'; f.frequency.value = 600; len = 0.05;
      g.gain.setValueAtTime(0.12, time);
    } else if (kind === 'snare') {
      f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 0.8; len = 0.14;
      g.gain.setValueAtTime(0.2, time);
    } else {
      f.type = 'highpass'; f.frequency.value = 7000; len = soft ? 0.025 : 0.04;
      g.gain.setValueAtTime(soft ? 0.05 : 0.09, time);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    src.connect(f).connect(g).connect(master);
    src.start(time, Math.random() * 0.5);
    src.stop(time + len + 0.02);
  }

  function play(ev, time, spb) {
    switch (ev.type) {
      case 'lead': {
        const len = ev.dur * spb;
        tone(time, freq(ev.note) * 2, len * 0.95, 0.075, pulseWave(0.25), true);
        // leises Echo eine Achtel später – typischer Game-Boy-Trick
        tone(time + spb / 4, freq(ev.note) * 2, len * 0.8, 0.02, pulseWave(0.125));
        break;
      }
      case 'bass':
        tone(time, freq(ev.note), ev.dur * spb * 0.85, 0.2, 'triangle');
        break;
      case 'arp': {
        // schnelles Arpeggio über den Akkord
        const step = 1 / 30;
        const notes = ev.notes;
        for (let x = 0, k = 0; x < ev.dur * spb - 0.01; x += step, k++) {
          tone(time + x, freq(notes[k % notes.length]) * 2, step * 0.9, 0.018, pulseWave(0.125));
        }
        break;
      }
      default:
        drum(time, ev.type, ev.soft);
    }
  }

  /* ----- Ablaufsteuerung ----- */

  function tick() {
    if (!playing) return;
    const now = ctx.currentTime;
    for (;;) {
      const s = SONG[sec];
      const spb = 60 / s.bpm;
      if (idx >= s.ev.length) {
        const end = secStart + s.beats * spb;
        if (end > now + LOOK_AHEAD) break;
        secStart = end;
        sec = sec + 1 < SONG.length ? sec + 1 : LOOP_FROM;
        idx = 0;
        continue;
      }
      const ev = s.ev[idx];
      const time = secStart + ev.t * spb;
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
    master.gain.value = 0.55;
    const lp = ctx.createBiquadFilter();   // etwas wärmer als echter Game-Boy-Klang
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    const comp = ctx.createDynamicsCompressor();
    master.connect(lp).connect(comp).connect(ctx.destination);
    playing = true;
    sec = 0;
    idx = 0;
    secStart = ctx.currentTime + 0.15;
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
