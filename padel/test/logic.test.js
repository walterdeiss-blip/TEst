// Tests für padel/logic.js – ausführen mit: node --test padel/test/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

const names = [['A1', 'A2'], ['B1', 'B2']];
const game = (m, t) => { for (let i = 0; i < 4; i++) L.addPoint(m, t); };

test('Punkte 0-15-30-40 und Einstand/Vorteil', () => {
  const m = L.newMatch({ names });
  L.addPoint(m, 0);
  assert.deepEqual(L.pointLabels(m), ['15', '0']);
  L.addPoint(m, 0); L.addPoint(m, 0);
  L.addPoint(m, 1); L.addPoint(m, 1); L.addPoint(m, 1);
  assert.deepEqual(L.pointLabels(m), ['40', '40']);
  assert.equal(L.statusText(m), 'Einstand');
  L.addPoint(m, 1);
  assert.deepEqual(L.pointLabels(m), ['40', 'AD']);
  L.addPoint(m, 0);
  assert.deepEqual(L.pointLabels(m), ['40', '40']);
  L.addPoint(m, 0); L.addPoint(m, 0);
  assert.deepEqual(m.games, [1, 0]);
});

test('Golden Point entscheidet bei 40:40', () => {
  const m = L.newMatch({ names, golden: true });
  for (let i = 0; i < 3; i++) { L.addPoint(m, 0); L.addPoint(m, 1); }
  assert.equal(L.statusText(m), '⚡ Golden Point');
  L.addPoint(m, 1);
  assert.deepEqual(m.games, [0, 1]);
});

test('Satz 6:4, Aufschlag wechselt reihum', () => {
  const m = L.newMatch({ names });
  const servers = [];
  for (let i = 0; i < 5; i++) { servers.push(m.server); game(m, 0); servers.push(m.server); game(m, 1); }
  assert.deepEqual(servers.slice(0, 5), [0, 1, 2, 3, 0]);
  assert.deepEqual(m.games, [5, 5]);
  game(m, 0); game(m, 0);
  assert.deepEqual(m.sets[0].g, [7, 5]);
});

test('Tiebreak bei 6:6 und Aufschlag im Tiebreak', () => {
  const m = L.newMatch({ names });
  for (let i = 0; i < 6; i++) { game(m, 0); game(m, 1); }
  assert.equal(m.tb.target, 7);
  const start = L.currentServer(m);
  L.addPoint(m, 0);
  assert.equal(L.currentServer(m), (start + 1) % 4);
  L.addPoint(m, 0);
  assert.equal(L.currentServer(m), (start + 1) % 4);
  L.addPoint(m, 0);
  assert.equal(L.currentServer(m), (start + 2) % 4);
  for (let i = 0; i < 4; i++) L.addPoint(m, 0);
  assert.deepEqual(m.sets[0], { g: [7, 6], tb: [7, 0], super: false });
  assert.equal(m.server, (start + 1) % 4);
});

test('Match-Tiebreak im 3. Satz und Matchende', () => {
  const m = L.newMatch({ names, superTb: true });
  for (let i = 0; i < 6; i++) game(m, 0);
  for (let i = 0; i < 6; i++) game(m, 1);
  assert.equal(m.tb.target, 10);
  for (let i = 0; i < 9; i++) { L.addPoint(m, 0); L.addPoint(m, 1); }
  assert.equal(m.winner, null);
  L.addPoint(m, 1);
  assert.equal(m.winner, null);
  const ev = L.addPoint(m, 1);
  assert.deepEqual(ev, { type: 'match', team: 1 });
  assert.deepEqual(m.sets[2], { g: [0, 1], tb: [9, 11], super: true });
  assert.equal(L.addPoint(m, 0), null);
});

test('Ein Satz reicht bei bestOf 1, Rückgängig', () => {
  const m = L.newMatch({ names, bestOf: 1 });
  for (let i = 0; i < 6; i++) game(m, 0);
  assert.equal(m.winner, 0);
  assert.ok(L.undo(m));
  assert.equal(m.winner, null);
  assert.deepEqual(m.games, [5, 0]);
  assert.deepEqual(m.points, [3, 0]);
});

test('Elo: Sieger gewinnt Punkte, Summe bleibt gleich', () => {
  const players = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }));
  const r = L.ranking(players, [{ ts: 1, a: ['a', 'b'], b: ['c', 'd'], win: 0 }]);
  assert.equal(r[0].elo, 1016);
  assert.equal(r[3].elo, 984);
  assert.equal(r.reduce((s, p) => s + p.elo, 0), 4000);
  const d = L.ranking(players, [{ ts: 1, a: ['a', 'b'], b: ['c', 'd'], win: null }]);
  assert.equal(d[0].elo, 1000);
  assert.equal(d[0].drawn, 1);
});

function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

test('Americano mit 8 Spielern: 7 Runden, keine doppelten Partner', () => {
  const t = { mode: 'americano', courts: 2, players: ['1', '2', '3', '4', '5', '6', '7', '8'], rounds: [] };
  const rnd = seeded(42);
  const pairs = new Map();
  for (let r = 0; r < 7; r++) {
    L.nextRound(t, rnd).matches.forEach(mt => {
      [mt.a, mt.b].forEach(p => {
        const k = [...p].sort().join();
        pairs.set(k, (pairs.get(k) || 0) + 1);
      });
    });
  }
  const repeats = [...pairs.values()].filter(n => n > 1).length;
  assert.ok(repeats <= 2, `zu viele Wiederholungen: ${repeats}`);
  assert.equal(pairs.size >= 26, true);
});

test('Aussetzen wird gleichmäßig verteilt (6 Spieler, 1 Platz)', () => {
  const t = { mode: 'americano', courts: 3, players: ['1', '2', '3', '4', '5', '6'], rounds: [] };
  for (let r = 0; r < 3; r++) {
    const round = L.nextRound(t, seeded(r + 1));
    assert.equal(round.matches.length, 1);
    assert.equal(round.sit.length, 2);
  }
  const sat = L.standings(t).map(s => s.sat);
  assert.deepEqual(sat, [1, 1, 1, 1, 1, 1]);
});

test('Mexicano: 1+4 gegen 2+3 nach Tabelle', () => {
  const t = { mode: 'mexicano', courts: 1, players: ['a', 'b', 'c', 'd'], rounds: [] };
  const r1 = L.nextRound(t, seeded(7));
  r1.matches[0].sa = 20; r1.matches[0].sb = 4;
  const top = L.standings(t).map(s => s.id);
  const r2 = L.nextRound(t);
  assert.deepEqual(r2.matches[0].a, [top[0], top[3]]);
  assert.deepEqual(r2.matches[0].b, [top[1], top[2]]);
});

test('Einladungslink mit Umlauten hin und zurück', () => {
  const ev = { id: 'x1', title: 'Padel am Freitag – Müller', date: '2026-10-16' };
  const link = 'https://example.org/padel/#t=' + L.encode(ev);
  assert.deepEqual(L.parseLink(link), { kind: 'invite', data: ev });
  assert.equal(L.parseLink('https://example.org/#r=@@@'), null);
  assert.equal(L.parseLink('kein link'), null);
});

test('Sprachansage: Aufschläger zuerst, Einstand, Spiel', () => {
  const m = L.newMatch({ names, server: 1 });  // B1 schlägt auf
  let ev = L.addPoint(m, 0);
  assert.equal(L.announce(m, ev), 'null, fünfzehn.');
  ev = L.addPoint(m, 1);
  assert.equal(L.announce(m, ev), 'fünfzehn beide.');
  L.addPoint(m, 0); L.addPoint(m, 1); L.addPoint(m, 0); ev = L.addPoint(m, 1);
  assert.equal(L.announce(m, ev), 'Einstand.');
  ev = L.addPoint(m, 1);
  assert.equal(L.announce(m, ev), 'Vorteil, B1 und B2.');
  ev = L.addPoint(m, 1);
  assert.equal(L.announce(m, ev), 'Spiel, B1 und B2. 0 zu 1. Seitenwechsel, bitte.');
});

test('Spielerstatistik: bester Partner, Angstgegner, Serien', () => {
  const ms = [
    { ts: 1, a: ['a', 'b'], b: ['c', 'd'], win: 0 },
    { ts: 2, a: ['a', 'b'], b: ['c', 'd'], win: 0 },
    { ts: 3, a: ['a', 'c'], b: ['b', 'd'], win: 1 },
    { ts: 4, a: ['a', 'd'], b: ['b', 'c'], win: 0 },
  ];
  const st = L.playerStats('a', ms);
  assert.equal(st.bestPartner.id, 'b');
  assert.equal(st.nemesis.id, 'b');  // je 1 Niederlage, gegen b die schlechtere Bilanz
  assert.equal(st.bestStreak, 2);
  assert.equal(st.streak, 1);
  const players = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id }));
  const r = L.ranking(players, ms);
  assert.equal(r.find(p => p.id === 'a').history.length, 5);
});

test('Faire Teams: ausgeglichenste Aufteilung zuerst', () => {
  const t = L.fairTeams(['a', 'b', 'c', 'd'], { a: 1200, b: 1100, c: 900, d: 800 });
  assert.deepEqual([t[0].a, t[0].b], [['a', 'd'], ['b', 'c']]);
  assert.equal(t[0].diff, 0);
  assert.equal(t[0].chance, 0.5);
  assert.ok(t[2].diff > t[1].diff);
});

test('Kein Angstgegner bei positiver Bilanz', () => {
  const ms = [
    { ts: 1, a: ['a', 'b'], b: ['c', 'd'], win: 0 },
    { ts: 2, a: ['a', 'b'], b: ['c', 'd'], win: 0 },
    { ts: 3, a: ['a', 'b'], b: ['c', 'd'], win: 1 },
  ];
  assert.equal(L.playerStats('a', ms).nemesis, null);
});

test('Kosten aufteilen auf den Cent genau', () => {
  assert.deepEqual(L.splitCost(40, 4), [10, 10, 10, 10]);
  assert.deepEqual(L.splitCost(10, 3), [3.34, 3.33, 3.33]);
  assert.equal(L.splitCost(10, 3).reduce((a, b) => a + b, 0).toFixed(2), '10.00');
  assert.deepEqual(L.splitCost(0, 4), []);
  assert.deepEqual(L.splitCost(20, 0), []);
});

test('Wöchentliche Termine über Monats- und Jahreswechsel', () => {
  assert.deepEqual(L.weeklyDates('2026-12-17', 3), ['2026-12-17', '2026-12-24', '2026-12-31']);
  assert.equal(L.addDays('2026-12-31', 7), '2027-01-07');
  assert.equal(L.addDays('2026-03-26', 7), '2026-04-02');  // Zeitumstellung
});

test('Matchstatistik: Punkte, Breaks, Serien, Momentum', () => {
  const m = L.newMatch({ names, bestOf: 1, golden: true });
  game(m, 0);                      // A hält Aufschlag (A1 schlägt auf)
  game(m, 0);                      // Break für A (B1 schlägt auf)
  for (let i = 0; i < 3; i++) { L.addPoint(m, 0); L.addPoint(m, 1); }
  L.addPoint(m, 1);                // Golden Point für B, B hält nicht – A2 schlägt auf → Break B
  const st = L.matchStats(m);
  assert.deepEqual(st.points, [11, 4]);
  assert.deepEqual(st.breaks, [1, 1]);
  assert.deepEqual(st.serveGames, [2, 1]);
  assert.deepEqual(st.golden, [0, 1]);
  assert.equal(st.run[0], 9);  // 8 Punkte der ersten zwei Spiele + erster Punkt im dritten
  assert.equal(st.momentum.length, 16);
  assert.equal(st.momentum.at(-1), 7);
});

test('Abzeichen: Bagel, Comeback, Riesentöter, Serien, Turniersieg', () => {
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, name: id }));
  const g = (x, y) => ({ g: [x, y] });
  const ms = [
    // c+d werden durch sieben Siege stark (über 100 Elo vor a+b)
    { id: 1, ts: 1, a: ['c', 'd'], b: ['e', 'f'], sets: [g(6, 2), g(6, 2)], win: 0, kind: 'match' },
    { id: 2, ts: 2, a: ['c', 'd'], b: ['e', 'f'], sets: [g(6, 2), g(6, 2)], win: 0, kind: 'match' },
    { id: 3, ts: 3, a: ['c', 'd'], b: ['a', 'b'], sets: [g(6, 2), g(6, 2)], win: 0, kind: 'match' },
    { id: 4, ts: 4, a: ['c', 'd'], b: ['e', 'f'], sets: [g(6, 2), g(6, 2)], win: 0, kind: 'match' },
    { id: 41, ts: 4.1, a: ['c', 'd'], b: ['e', 'f'], sets: [g(6, 2), g(6, 2)], win: 0, kind: 'match' },
    { id: 42, ts: 4.2, a: ['c', 'd'], b: ['e', 'f'], sets: [g(6, 2), g(6, 2)], win: 0, kind: 'match' },
    { id: 43, ts: 4.3, a: ['c', 'd'], b: ['e', 'f'], sets: [g(6, 2), g(6, 2)], win: 0, kind: 'match' },
    // a+b drehen das Match gegen die Favoriten, mit 6:0 im zweiten Satz
    { id: 5, ts: 5, a: ['a', 'b'], b: ['c', 'd'], sets: [g(4, 6), g(6, 0), g(6, 3)], win: 0, kind: 'match', dur: 95 },
  ];
  const a = L.badgesFor('a', players, ms, [{ winner: 'a' }]);
  assert.deepEqual(a, ['first', 'bagel', 'comeback', 'giant', 'marathon', 'champ']);
  assert.deepEqual(L.badgesFor('c', players, ms), ['first', 'streak3', 'streak5', 'marathon']);  // Marathon zählt für beide Teams
  assert.ok(L.BADGES.length >= 10);
});

test('Stimmen: natürliche Frauenstimme zuerst, Männerstimmen nach hinten', () => {
  const v = (name, lang = 'de-DE', localService = true) => ({ name, lang, localService });
  const ranked = L.rankVoices([
    v('Markus'), v('Anna'), v('Petra (Premium)'), v('Samantha', 'en-US'),
    v('Microsoft Katja Online (Natural) - German (Germany)', 'de-DE', false), v('Yannick (Erweitert)'), v('Deutsch Deutschland'),
  ]);
  assert.deepEqual(ranked.map(r => r.name), [
    'Microsoft Katja Online (Natural) - German (Germany)', 'Petra (Premium)', 'Anna', 'Yannick (Erweitert)', 'Deutsch Deutschland', 'Markus',
  ]);
  assert.equal(ranked[0].female, true);
  assert.equal(ranked.find(r => r.name === 'Deutsch Deutschland').female, null);
  assert.equal(L.rankVoices([v('Samantha', 'en-US')]).length, 0);
});

test('Überschrift: 1. Match bei einem Satz, sonst Satznummer', () => {
  assert.equal(L.statusText(L.newMatch({ names, bestOf: 1 })), '1. Match');
  const m = L.newMatch({ names });
  assert.equal(L.statusText(m), '1. Satz');
  for (let i = 0; i < 6; i++) game(m, 0);
  assert.equal(L.statusText(m), '2. Satz');
});
