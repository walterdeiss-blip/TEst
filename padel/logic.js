/* Padel – reine Logik ohne Oberfläche: Zählen, Rangliste, Turnier-Paarungen, Einladungslinks.
   Läuft im Browser (window.PadelLogic) und in Node (für die Tests). */
'use strict';

(function (root) {

  /* ---------- Punkte zählen ---------- */

  // Aufschlagreihenfolge: A1, B1, A2, B2 → Index s: Team = s % 2, Spieler = s >> 1
  const serveTeam = s => s % 2;
  const servePlayer = s => s >> 1;

  function newMatch(cfg) {
    return {
      cfg: {
        bestOf: cfg.bestOf === 1 ? 1 : 3,
        golden: !!cfg.golden,          // Golden Point bei 40:40
        superTb: !!cfg.superTb,        // 3. Satz als Match-Tiebreak bis 10
        names: cfg.names,              // [[A1, A2], [B1, B2]]
      },
      sets: [],                        // abgeschlossene Sätze: { g: [a, b], tb: [x, y] | null, super: bool }
      games: [0, 0],
      points: [0, 0],
      tb: null,                        // laufender Tiebreak: { target, start }
      server: cfg.server || 0,
      winner: null,
      history: [],
    };
  }

  const setsWon = m => m.sets.reduce((w, s) => {
    w[s.g[0] > s.g[1] ? 0 : 1]++;
    return w;
  }, [0, 0]);

  function currentServer(m) {
    if (!m.tb) return m.server;
    const p = m.points[0] + m.points[1];
    return (m.tb.start + Math.floor((p + 1) / 2)) % 4;
  }

  function snapshot(m) {
    const { history, ...rest } = m;
    return JSON.stringify(rest);
  }

  // Gibt ein Ereignis zurück, das die Oberfläche anzeigen kann (Spiel, Satz, Match, Seitenwechsel).
  function addPoint(m, t) {
    if (m.winner !== null) return null;
    m.history.push(snapshot(m));
    const o = 1 - t;
    m.points[t]++;
    const p = m.points;

    if (m.tb) {
      const total = p[0] + p[1];
      if (p[t] >= m.tb.target && p[t] - p[o] >= 2) {
        const isSuper = m.tb.target === 10 && m.games[0] === 0 && m.games[1] === 0;
        const g = isSuper ? (t === 0 ? [1, 0] : [0, 1]) : (t === 0 ? [7, 6] : [6, 7]);
        m.server = (m.tb.start + 1) % 4;
        m.sets.push({ g, tb: [p[0], p[1]], super: isSuper });
        m.tb = null;
        return finishSet(m, t);
      }
      return total % 6 === 0 ? { type: 'side' } : null;
    }

    const won = m.cfg.golden && p[0] >= 3 && p[1] >= 3 ? p[t] > p[o] : p[t] >= 4 && p[t] - p[o] >= 2;
    if (!won) return null;

    m.points = [0, 0];
    m.games[t]++;
    m.server = (m.server + 1) % 4;
    const g = m.games;
    if ((g[t] >= 6 && g[t] - g[o] >= 2) || g[t] === 7) {
      m.sets.push({ g: [g[0], g[1]], tb: null, super: false });
      return finishSet(m, t);
    }
    if (g[0] === 6 && g[1] === 6) {
      m.tb = { target: 7, start: m.server };
      return { type: 'tiebreak' };
    }
    return { type: 'game', team: t, side: (g[0] + g[1]) % 2 === 1 };
  }

  function finishSet(m, t) {
    m.games = [0, 0];
    m.points = [0, 0];
    const w = setsWon(m);
    const need = Math.floor(m.cfg.bestOf / 2) + 1;
    if (w[t] >= need) {
      m.winner = t;
      return { type: 'match', team: t };
    }
    if (m.cfg.superTb && m.cfg.bestOf === 3 && w[0] === 1 && w[1] === 1) {
      m.tb = { target: 10, start: m.server };
      return { type: 'set', team: t, superTb: true };
    }
    // Seitenwechsel nach dem Satz, wenn die Spielsumme ungerade war
    const last = m.sets[m.sets.length - 1].g;
    return { type: 'set', team: t, side: (last[0] + last[1]) % 2 === 1 };
  }

  function undo(m) {
    const prev = m.history.pop();
    if (!prev) return false;
    Object.assign(m, JSON.parse(prev), { history: m.history });
    return true;
  }

  // Anzeige der Punkte im laufenden Spiel, z. B. ['40', 'AD']
  function pointLabels(m) {
    const p = m.points;
    if (m.tb) return [String(p[0]), String(p[1])];
    const names = ['0', '15', '30', '40'];
    if (p[0] >= 3 && p[1] >= 3) {
      if (p[0] === p[1]) return ['40', '40'];
      return p[0] > p[1] ? ['AD', '40'] : ['40', 'AD'];
    }
    return [names[p[0]], names[p[1]]];
  }

  function statusText(m) {
    if (m.winner !== null) return 'Spiel beendet';
    if (m.tb) return m.tb.target === 10 ? 'Match-Tiebreak (bis 10)' : 'Tiebreak (bis 7)';
    const p = m.points;
    if (p[0] >= 3 && p[1] >= 3) {
      if (p[0] === p[1]) return m.cfg.golden ? '⚡ Golden Point' : 'Einstand';
      return 'Vorteil';
    }
    return m.cfg.bestOf === 1 ? `${m.sets.length + 1}. Match` : `${m.sets.length + 1}. Satz`;
  }

  /* ---------- Matchstatistik aus dem Punkteverlauf ---------- */

  // Wer hat den Punkt zwischen zwei Spielständen gewonnen?
  function pointWinner(a, b) {
    if (b.sets.length > a.sets.length) {
      const g = b.sets[b.sets.length - 1].g;
      return g[0] > g[1] ? 0 : 1;
    }
    if (b.games[0] > a.games[0]) return 0;
    if (b.games[1] > a.games[1]) return 1;
    return b.points[0] > a.points[0] ? 0 : 1;
  }

  function matchStats(m) {
    const states = m.history.map(h => JSON.parse(h));
    states.push(m);
    const st = {
      points: [0, 0], serveGames: [0, 0], serveHeld: [0, 0], breaks: [0, 0], run: [0, 0],
      golden: [0, 0], momentum: [0], setEnds: [],
    };
    let cur = -1, len = 0;
    for (let i = 0; i < states.length - 1; i++) {
      const a = states[i], b = states[i + 1];
      const w = pointWinner(a, b);
      st.points[w]++;
      st.momentum.push(st.momentum[st.momentum.length - 1] + (w === 0 ? 1 : -1));
      len = w === cur ? len + 1 : 1;
      cur = w;
      st.run[w] = Math.max(st.run[w], len);
      if (!a.tb && a.cfg.golden && a.points[0] === 3 && a.points[1] === 3) st.golden[w]++;
      const gameDone = b.sets.length > a.sets.length || b.games[0] !== a.games[0] || b.games[1] !== a.games[1];
      if (gameDone && !a.tb) {
        const srv = serveTeam(a.server);
        st.serveGames[srv]++;
        if (w === srv) st.serveHeld[srv]++; else st.breaks[w]++;
      }
      if (b.sets.length > a.sets.length) st.setEnds.push(i + 1);
    }
    return st;
  }

  /* ---------- Abzeichen ---------- */

  const BADGES = [
    { id: 'first', name: 'Erster Sieg', desc: 'Das erste Match gewonnen', icon: 'star', tier: 1 },
    { id: 'streak3', name: 'Heißer Lauf', desc: '3 Siege in Folge', icon: 'flame', tier: 2 },
    { id: 'streak5', name: 'Unaufhaltsam', desc: '5 Siege in Folge', icon: 'flame', tier: 3 },
    { id: 'bagel', name: 'Bagel', desc: 'Einen Satz 6:0 gewonnen', icon: 'bagel', tier: 2 },
    { id: 'comeback', name: 'Comeback', desc: 'Ersten Satz verloren und trotzdem gewonnen', icon: 'comeback', tier: 3 },
    { id: 'giant', name: 'Riesentöter', desc: 'Gegen ein Team mit 100+ Elo mehr gewonnen', icon: 'giant', tier: 3 },
    { id: 'marathon', name: 'Marathon', desc: 'Ein Match über 90 Minuten', icon: 'clock', tier: 2 },
    { id: 'team5', name: 'Teamplayer', desc: 'Mit 5 verschiedenen Partnern gespielt', icon: 'users', tier: 2 },
    { id: 'games10', name: 'Stammspieler', desc: '10 Matches gespielt', icon: 'racket', tier: 1 },
    { id: 'games50', name: 'Court-Veteran', desc: '50 Matches gespielt', icon: 'racket', tier: 3 },
    { id: 'champ', name: 'Turniersieger', desc: 'Ein Americano/Mexicano gewonnen', icon: 'trophy', tier: 3 },
  ];

  // Liefert die IDs aller Abzeichen, die ein Spieler hat.
  function badgesFor(id, players, matches, trophies = []) {
    const before = {};
    ranking(players, matches, before);
    const got = new Set();
    const mine = [...matches].filter(m => m.a.includes(id) || m.b.includes(id)).sort((x, y) => x.ts - y.ts);
    const partners = new Set();
    let streak = 0;
    mine.forEach(m => {
      const inA = m.a.includes(id);
      const won = m.win !== null && m.win !== undefined && (m.win === 0) === inA;
      const own = s => inA ? s.g[0] : s.g[1], opp = s => inA ? s.g[1] : s.g[0];
      (inA ? m.a : m.b).filter(p => p !== id).forEach(p => partners.add(p));
      streak = won ? streak + 1 : 0;
      if (won) got.add('first');
      if (streak >= 3) got.add('streak3');
      if (streak >= 5) got.add('streak5');
      if (m.kind === 'match' && m.sets.some(s => !s.super && own(s) === 6 && opp(s) === 0)) got.add('bagel');
      if (won && m.kind === 'match' && m.sets.length >= 2 && own(m.sets[0]) < opp(m.sets[0])) got.add('comeback');
      const e = before[m.id];
      if (won && e && (inA ? e.rb - e.ra : e.ra - e.rb) >= 100) got.add('giant');
      if ((m.dur || 0) >= 90) got.add('marathon');
    });
    if (partners.size >= 5) got.add('team5');
    if (mine.length >= 10) got.add('games10');
    if (mine.length >= 50) got.add('games50');
    if (trophies.some(t => t.winner === id)) got.add('champ');
    return BADGES.filter(b => got.has(b.id)).map(b => b.id);
  }

  /* ---------- Sprachansage ---------- */

  const SPOKEN = { '0': 'null', '15': 'fünfzehn', '30': 'dreißig', '40': 'vierzig' };

  // Ansagetext nach einem Punkt; Aufschläger zuerst, wie auf dem Platz üblich.
  function announce(m, ev) {
    const team = t => m.cfg.names[t].join(' und ');
    if (ev?.type === 'match') return `Spiel, Satz und Sieg: ${team(ev.team)}. Glückwunsch!`;
    const games = `${m.games[0]} zu ${m.games[1]}`;
    if (ev?.type === 'set') {
      const w = setsWon(m);
      return `Satz, ${team(ev.team)}. Sätze: ${w[0]} zu ${w[1]}.${ev.superTb ? ' Jetzt Match-Tiebreak.' : ''}`;
    }
    if (ev?.type === 'tiebreak') return 'Sechs beide. Tiebreak!';
    const srvTeam = serveTeam(currentServer(m));
    if (ev?.type === 'game') {
      return `Spiel, ${team(ev.team)}. ${games}.${ev.side ? ' Seitenwechsel, bitte.' : ''}`;
    }
    const p = m.points;
    if (m.tb) {
      const first = p[srvTeam], second = p[1 - srvTeam];
      return `${first} zu ${second}.${ev?.type === 'side' ? ' Seitenwechsel, bitte.' : ''}`;
    }
    if (p[0] >= 3 && p[1] >= 3) {
      if (p[0] === p[1]) return m.cfg.golden ? 'Einstand. Golden Point!' : 'Einstand.';
      return `Vorteil, ${team(p[0] > p[1] ? 0 : 1)}.`;
    }
    const l = pointLabels(m);
    const a = SPOKEN[l[srvTeam]], b = SPOKEN[l[1 - srvTeam]];
    return a === b ? `${a} beide.` : `${a}, ${b}.`;
  }

  /* ---------- Stimmenauswahl ---------- */

  // Bekannte Stimmen der Geräte (iOS, macOS, Windows/Edge, Android/Chrome)
  const FEMALE = /\b(anna|petra|helena|marlene|katja|amala|seraphina|elke|gisela|klarissa|louisa|maja|tanja|ingrid|hedda|vicki|leni|sabine|hanna|lea|julia|female|weiblich|frau)\b/i;
  const MALE = /\b(conrad|killian|markus|martin|viktor|yannick|stefan|bernd|christoph|florian|ralf|klaus|jonas|kasper|male|männlich|mann)\b/i;
  const QUALITY = /(natural|neural|premium|enhanced|erweitert|verbessert|online|wavenet|studio)/i;

  // Bewertet die deutschen Stimmen: natürlich klingende Frauenstimmen zuerst.
  function rankVoices(voices) {
    return voices
      .filter(v => /^de([-_]|$)/i.test(v.lang || ''))
      .map(v => {
        const female = FEMALE.test(v.name) ? true : MALE.test(v.name) ? false : null;
        const natural = QUALITY.test(v.name) || /^Google/i.test(v.name);
        let score = 0;
        if (natural) score += 50;
        if (female === true) score += 30;
        if (female === false) score -= 40;
        if (/de[-_]DE/i.test(v.lang)) score += 5;
        if (v.localService === false) score += 5;  // Online-Stimmen klingen meist besser
        return { voice: v, name: v.name, female, natural, score };
      })
      .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
  }

  /* ---------- Rangliste (Elo) ---------- */

  const ELO_START = 1000;
  const ELO_K = 32;

  // Spielt alle Ergebnisse in zeitlicher Reihenfolge durch und berechnet Wertung und Statistik.
  function ranking(players, matches, before = null) {
    const st = {};
    players.forEach(p => {
      st[p.id] = { id: p.id, name: p.name, elo: ELO_START, played: 0, won: 0, lost: 0, drawn: 0, trend: [], history: [ELO_START] };
    });
    [...matches].sort((x, y) => x.ts - y.ts).forEach(mt => {
      const ids = [...mt.a, ...mt.b];
      if (!ids.every(id => st[id])) return;
      const ra = (st[mt.a[0]].elo + st[mt.a[1]].elo) / 2;
      const rb = (st[mt.b[0]].elo + st[mt.b[1]].elo) / 2;
      if (before) before[mt.id] = { ra, rb };
      const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
      const sa = mt.win === 0 ? 1 : mt.win === 1 ? 0 : 0.5;
      const d = ELO_K * (sa - ea);
      mt.a.forEach(id => apply(st[id], d, sa));
      mt.b.forEach(id => apply(st[id], -d, 1 - sa));
    });
    return Object.values(st).sort((x, y) => y.elo - x.elo || y.won - x.won || x.name.localeCompare(y.name));
  }

  function apply(s, d, score) {
    s.elo += d;
    s.played++;
    if (score === 1) s.won++;
    else if (score === 0) s.lost++;
    else s.drawn++;
    s.trend.push(score === 1 ? 'S' : score === 0 ? 'N' : 'U');
    s.history.push(s.elo);
  }

  // Partner, Gegner und Serien eines Spielers.
  function playerStats(id, matches) {
    const partners = {}, opponents = {};
    let streak = 0, best = 0;
    [...matches].sort((x, y) => x.ts - y.ts).forEach(mt => {
      const inA = mt.a.includes(id), inB = mt.b.includes(id);
      if (!inA && !inB) return;
      const mine = inA ? mt.a : mt.b, theirs = inA ? mt.b : mt.a;
      const res = mt.win === null || mt.win === undefined ? 'U' : (mt.win === 0) === inA ? 'S' : 'N';
      const add = (map, pid) => {
        const e = map[pid] || (map[pid] = { id: pid, played: 0, won: 0, lost: 0 });
        e.played++;
        if (res === 'S') e.won++;
        if (res === 'N') e.lost++;
      };
      mine.filter(p => p !== id).forEach(p => add(partners, p));
      theirs.forEach(p => add(opponents, p));
      streak = res === 'S' ? streak + 1 : 0;
      best = Math.max(best, streak);
    });
    const rate = e => e.won / e.played;
    const bestPartner = Object.values(partners).filter(e => e.won)
      .sort((x, y) => rate(y) - rate(x) || y.won - x.won)[0] || null;
    // Angstgegner nur, wenn die Bilanz gegen ihn höchstens ausgeglichen ist
    const nemesis = Object.values(opponents).filter(e => e.lost && e.lost >= e.won)
      .sort((x, y) => y.lost - x.lost || rate(x) - rate(y))[0] || null;
    return { partners: Object.values(partners).sort((x, y) => y.played - x.played), bestPartner, nemesis, streak, bestStreak: best };
  }

  // Die drei möglichen Aufteilungen von vier Spielern, die ausgeglichenste zuerst.
  function fairTeams(ids, elo) {
    const e = id => elo[id] ?? ELO_START;
    return [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]].map(([a, b]) => {
      const ta = a.map(i => ids[i]), tb = b.map(i => ids[i]);
      const ea = (e(ta[0]) + e(ta[1])) / 2, eb = (e(tb[0]) + e(tb[1])) / 2;
      return { a: ta, b: tb, diff: Math.abs(ea - eb), chance: 1 / (1 + Math.pow(10, (eb - ea) / 400)) };
    }).sort((x, y) => x.diff - y.diff);
  }

  /* ---------- Americano / Mexicano ---------- */

  function shuffle(a, rnd = Math.random) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Punktestand: Summe der erzielten Punkte, dazu Siege und Differenz.
  function standings(t) {
    const s = {};
    t.players.forEach(id => { s[id] = { id, pts: 0, diff: 0, played: 0, won: 0, sat: 0 }; });
    t.rounds.forEach(r => {
      r.sit.forEach(id => s[id].sat++);
      r.matches.forEach(mt => {
        if (mt.sa === null || mt.sb === null) return;
        const add = (ids, own, other) => ids.forEach(id => {
          s[id].pts += own;
          s[id].diff += own - other;
          s[id].played++;
          if (own > other) s[id].won++;
        });
        add(mt.a, mt.sa, mt.sb);
        add(mt.b, mt.sb, mt.sa);
      });
    });
    return Object.values(s).sort((x, y) => (y.pts - x.pts) || (y.diff - x.diff) || (y.won - x.won));
  }

  function pickSitters(t, count, order, rnd) {
    if (!count) return [];
    const sat = {};
    t.players.forEach(id => { sat[id] = 0; });
    t.rounds.forEach(r => r.sit.forEach(id => sat[id]++));
    const pos = new Map(order.map((id, i) => [id, i]));
    // Wer am seltensten ausgesetzt hat, setzt aus; bei Gleichstand zufällig bzw. nach Reihenfolge
    const cand = shuffle([...t.players], rnd).sort((x, y) =>
      sat[x] - sat[y] || (order.length ? pos.get(y) - pos.get(x) : 0));
    return cand.slice(0, count);
  }

  function nextRound(t, rnd = Math.random) {
    const courts = Math.min(t.courts, Math.floor(t.players.length / 4));
    const sitCount = t.players.length - courts * 4;
    const ranked = t.mode === 'mexicano' && t.rounds.length ? standings(t).map(s => s.id) : [];
    const sit = pickSitters(t, sitCount, ranked, rnd);
    const active = t.players.filter(id => !sit.includes(id));
    let matches;

    if (t.mode === 'mexicano' && t.rounds.length) {
      // Nach Tabelle: 1+4 gegen 2+3 in jeder Vierergruppe
      const order = ranked.filter(id => active.includes(id));
      matches = [];
      for (let i = 0; i < order.length; i += 4) {
        const [p1, p2, p3, p4] = order.slice(i, i + 4);
        matches.push({ a: [p1, p4], b: [p2, p3], sa: null, sb: null });
      }
    } else {
      matches = bestAmericano(t, active, rnd);
    }
    const round = { matches, sit };
    t.rounds.push(round);
    return round;
  }

  // Sucht unter vielen Zufallsaufstellungen die mit den wenigsten wiederholten Partnern/Gegnern.
  function bestAmericano(t, active, rnd) {
    const key = (x, y) => x < y ? x + '|' + y : y + '|' + x;
    const partner = {}, opp = {};
    t.rounds.forEach(r => r.matches.forEach(mt => {
      partner[key(...mt.a)] = (partner[key(...mt.a)] || 0) + 1;
      partner[key(...mt.b)] = (partner[key(...mt.b)] || 0) + 1;
      mt.a.forEach(x => mt.b.forEach(y => { opp[key(x, y)] = (opp[key(x, y)] || 0) + 1; }));
    }));
    let best = null, bestCost = Infinity;
    for (let tries = 0; tries < 400 && bestCost > 0; tries++) {
      const p = shuffle([...active], rnd);
      let cost = 0;
      const ms = [];
      for (let i = 0; i < p.length; i += 4) {
        const a = [p[i], p[i + 1]], b = [p[i + 2], p[i + 3]];
        cost += 100 * ((partner[key(...a)] || 0) + (partner[key(...b)] || 0));
        a.forEach(x => b.forEach(y => { cost += opp[key(x, y)] || 0; }));
        ms.push({ a, b, sa: null, sb: null });
      }
      if (cost < bestCost) { best = ms; bestCost = cost; }
    }
    return best;
  }

  /* ---------- Termine: Kosten und Wiederholung ---------- */

  // Teilt einen Betrag (in Euro) auf n Personen auf; Restcents gehen an die ersten.
  function splitCost(total, n) {
    if (!n || !(total > 0)) return [];
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / n), rest = cents - base * n;
    return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
  }

  const fmtEuro = v => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  // Datum (JJJJ-MM-TT) plus Tage, ohne Zeitzonen-Verschiebung
  function addDays(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return t.toISOString().slice(0, 10);
  }

  function weeklyDates(date, count) {
    return Array.from({ length: count }, (_, i) => addDays(date, 7 * i));
  }

  /* ---------- Einladungs- und Antwortlinks ---------- */

  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(str) {
    try {
      const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
      return null;
    }
  }

  // Liest #t=… (Einladung) oder #r=… (Antwort) aus einem Link oder Hash.
  function parseLink(text) {
    const m = /#([tr])=([A-Za-z0-9_-]+)/.exec(text || '');
    if (!m) return null;
    const data = decode(m[2]);
    return data ? { kind: m[1] === 't' ? 'invite' : 'reply', data } : null;
  }

  root.PadelLogic = {
    newMatch, addPoint, undo, pointLabels, statusText, currentServer, serveTeam, servePlayer, setsWon,
    matchStats, BADGES, badgesFor, rankVoices, announce, splitCost, fmtEuro, addDays, weeklyDates, ranking, playerStats, fairTeams, ELO_START, standings, nextRound, shuffle, encode, decode, parseLink,
  };
  if (typeof module !== 'undefined') module.exports = root.PadelLogic;
})(typeof window !== 'undefined' ? window : globalThis);
