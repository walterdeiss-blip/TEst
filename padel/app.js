/* Padel – Oberfläche: Zählen, Rangliste, Turnier, Termine. Alle Daten bleiben im localStorage. */
'use strict';

const L = window.PadelLogic;
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = name => `<svg class="ico"><use href="#i-${name}"/></svg>`;
const initials = n => n.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- Speicher ---------- */

const KEY = 'padel-v1';
const EMPTY = () => ({ players: [], matches: [], live: null, tour: null, events: [], me: '' });
let db = load();

function load() {
  try {
    return Object.assign(EMPTY(), JSON.parse(localStorage.getItem(KEY)) || {});
  } catch (e) {
    return EMPTY();
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    toast('⚠️ Speichern nicht möglich');
  }
}

const player = id => db.players.find(p => p.id === id);
const pname = id => player(id)?.name ?? '?';
const findPlayer = name => db.players.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
function ensurePlayer(name) {
  const found = findPlayer(name);
  if (found) return found.id;
  const p = { id: uid(), name: name.trim() };
  db.players.push(p);
  return p.id;
}

/* ---------- Kleine Helfer ---------- */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Zeigt einen Dialog; liefert den value des gedrückten Knopfs ('' bei Abbruch).
function ask(html, buttons = [{ label: 'OK', value: 'ok', cls: 'primary' }]) {
  const dlg = $('#dlg');
  $('#dlg-body').innerHTML = html;
  $('#dlg-buttons').innerHTML = buttons.map(b =>
    `<button value="${esc(b.value)}" class="${b.cls || 'chip'}" ${b.cls === 'primary' ? '' : 'formnovalidate'}>${esc(b.label)}</button>`
  ).join('');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.querySelector('input:not([type=checkbox])')?.focus();
  return new Promise(res => dlg.addEventListener('close', () => res(dlg.returnValue), { once: true }));
}
const confirmAsk = (text, yes = 'Ja') =>
  ask(`<p>${text}</p>`, [{ label: 'Abbrechen', value: '' }, { label: yes, value: 'ok', cls: 'primary' }])
    .then(v => v === 'ok');

function fmtDate(date, time) {
  if (!date) return '';
  const d = new Date(date + 'T' + (time || '12:00'));
  const s = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return time ? `${s} · ${time} Uhr` : s;
}
const today = () => new Date().toISOString().slice(0, 10);

function setsText(sets) {
  return sets.map(s => s.super ? `[${s.tb[0]}:${s.tb[1]}]` : `${s.g[0]}:${s.g[1]}`).join('  ');
}

function refreshPlayerList() {
  $('#player-list').innerHTML = db.players.map(p => `<option value="${esc(p.name)}">`).join('');
}

/* ---------- Tabs ---------- */

function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('hidden', t.id !== 'tab-' + name));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  ({ score: renderScore, rank: renderRank, tour: renderTour, courts: renderCourts, events: renderEvents })[name]();
  try { sessionStorage.setItem('padel-tab', name); } catch (e) { /* egal */ }
  window.scrollTo(0, 0);
}
$$('#tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- 🎾 Zählen ---------- */

const nameInputs = ['#n-a1', '#n-a2', '#n-b1', '#n-b2'];
let wakeLock = null;

async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
    }
  } catch (e) { /* nicht unterstützt */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && db.live && db.live.winner === null && !$('#tab-score').classList.contains('hidden')) keepAwake(true);
});

$('#btn-start').addEventListener('click', () => {
  const raw = nameInputs.map(s => $(s).value.trim());
  const shown = raw.map((n, i) => n || `Spieler ${i + 1}`);
  db.live = L.newMatch({
    names: [[shown[0], shown[1]], [shown[2], shown[3]]],
    bestOf: +$('#opt-sets').value,
    golden: $('#opt-golden').checked,
    superTb: $('#opt-supertb').checked,
    server: +$('#opt-server').value,
  });
  db.live.raw = raw;
  db.live.started = Date.now();
  db.speech = $('#opt-speech').checked;
  save();
  renderScore();
  say(db.speech ? `${shown[0]} und ${shown[1]} gegen ${shown[2]} und ${shown[3]}. Viel Spaß!` : '');
});

$('#btn-speech').addEventListener('click', () => {
  db.speech = !db.speech;
  save();
  renderScore();
  toast(db.speech ? '🔊 Ansage an' : '🔇 Ansage aus');
  if (db.speech && db.live) say(L.announce(db.live, null));
});

/* Faire Teams nach Elo bzw. zufällig */
function teamNames() {
  const names = nameInputs.map(s => $(s).value.trim());
  if (names.some(n => !n) || new Set(names.map(n => n.toLowerCase())).size !== 4) {
    toast('Erst vier verschiedene Namen eintragen');
    return null;
  }
  return names;
}
function fillTeams(order) {
  nameInputs.forEach((s, i) => { $(s).value = order[i]; });
}
$('#btn-fair').addEventListener('click', () => {
  const names = teamNames();
  if (!names) return;
  const elo = {};
  L.ranking(db.players, db.matches).forEach(r => { elo[r.name.toLowerCase()] = r.elo; });
  const keys = names.map(n => n.toLowerCase());
  const [best] = L.fairTeams(keys, elo);
  const byKey = Object.fromEntries(names.map(n => [n.toLowerCase(), n]));
  fillTeams([...best.a, ...best.b].map(k => byKey[k]));
  const pa = Math.round(best.chance * 100);
  toast(`⚖ Faire Teams · Chance ${pa}:${100 - pa}`);
});
$('#btn-random').addEventListener('click', () => {
  const names = teamNames();
  if (names) { fillTeams(L.shuffle(names)); toast('🎲 Teams ausgelost'); }
});

/* Schnellauswahl bekannter Spieler */
function renderQuickPlayers() {
  const taken = nameInputs.map(s => $(s).value.trim().toLowerCase());
  const last = {};
  db.matches.forEach(m => [...m.a, ...m.b].forEach(id => { last[id] = Math.max(last[id] || 0, m.ts); }));
  const list = db.players.filter(p => !taken.includes(p.name.toLowerCase()))
    .sort((x, y) => (last[y.id] || 0) - (last[x.id] || 0) || x.name.localeCompare(y.name)).slice(0, 12);
  $('#quick-players').innerHTML = list.map(p => `<button class="chip" data-quick="${esc(p.name)}">${ico('plus')}${esc(p.name)}</button>`).join('');
}
$('#quick-players').addEventListener('click', e => {
  const b = e.target.closest('[data-quick]');
  if (!b) return;
  const free = nameInputs.find(s => !$(s).value.trim());
  if (!free) return toast('Alle vier Plätze sind belegt');
  $(free).value = b.dataset.quick;
  renderQuickPlayers();
});
nameInputs.forEach(s => $(s).addEventListener('input', renderQuickPlayers));

/* Regel-Spickzettel */
const RULES = [
  ['Aufschlag', [
    'Von unten: Ball hinter der Aufschlaglinie einmal aufprallen lassen und höchstens auf Hüfthöhe treffen.',
    'Diagonal ins Aufschlagfeld des Gegners, zwei Versuche.',
    'Ball berührt das Netz und landet im Feld → Aufschlag wiederholen. Trifft er danach das Gitter, ist es ein Fehler.',
    'Nach dem Aufprall im Feld darf der Ball an die Glaswand, aber nicht ans Gitter.',
  ]],
  ['Ballwechsel', [
    'Der Ball muss zuerst im gegnerischen Feld aufkommen. Erst danach darf er Glas oder Gitter berühren.',
    'Er darf nur einmal aufprallen, bevor er zurückgespielt wird; Volleys sind erlaubt (außer beim Return).',
    'Den Ball darf man nach dem Aufprall von den eigenen Wänden zurückspringen lassen und dann spielen.',
    'Man darf den Ball auch gegen die eigene Wand schlagen, damit er über das Netz geht.',
    'Trifft der Ball direkt (ohne Aufprall) Wand oder Gitter des Gegners → Punkt verloren.',
    'Netz oder Ball mit Körper oder Schläger berühren → Punkt verloren.',
  ]],
  ['Zählen', [
    'Wie im Tennis: 15 – 30 – 40 – Spiel. Bei 40:40 Einstand und Vorteil, oder Golden Point: der nächste Punkt entscheidet, das rückschlagende Team wählt die Seite.',
    '6 Spiele mit 2 Vorsprung gewinnen einen Satz, bei 6:6 Tiebreak bis 7.',
    'Seitenwechsel nach jedem ungeraden Spiel (1, 3, 5 …), im Tiebreak alle 6 Punkte.',
    'Aufschlag reihum: A1 → B1 → A2 → B2.',
  ]],
];
$('#btn-rules').addEventListener('click', () => ask(`<h3>Padel-Regeln kurz</h3>${RULES.map(([title, items]) =>
  `<h4 class="mini">${title}</h4><ul class="rules">${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`).join('')}`,
[{ label: 'Alles klar', value: 'ok', cls: 'primary' }]));

/* Sprachansage */
function say(text) {
  if (!text || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 1.05;
    const voice = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('de'));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch (e) { /* nicht unterstützt */ }
}

/* Spieldauer */
const fmtDur = ms => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const fmtMin = min => min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
let clockTimer = null;
function tickClock() {
  const m = db.live;
  const el = $('#sb-time span');
  if (!m || !m.started) { $('#sb-time').classList.add('hidden'); return; }
  $('#sb-time').classList.remove('hidden');
  el.textContent = fmtDur((m.ended || Date.now()) - m.started);
}

$$('.sb-team').forEach(btn => btn.addEventListener('click', e => {
  const m = db.live;
  if (!m || m.winner !== null) return;
  const r = btn.getBoundingClientRect();
  btn.style.setProperty('--x', `${e.clientX - r.left}px`);
  btn.style.setProperty('--y', `${e.clientY - r.top}px`);
  btn.classList.add('hit');
  requestAnimationFrame(() => requestAnimationFrame(() => btn.classList.remove('hit')));
  const ev = L.addPoint(m, +btn.dataset.team);
  navigator.vibrate?.(25);
  if (ev?.type === 'match') m.ended = Date.now();
  save();
  renderScore();
  if (db.speech) say(L.announce(m, ev));
  if (!ev) return;
  const team = t => `Team ${t === 0 ? 'A' : 'B'}`;
  if (ev.type === 'side') toast('↔ Seitenwechsel');
  if (ev.type === 'game' && ev.side) toast('↔ Seitenwechsel');
  if (ev.type === 'tiebreak') toast('Tiebreak bis 7!');
  if (ev.type === 'set') toast(`Satz für ${team(ev.team)}${ev.superTb ? ' – jetzt Match-Tiebreak' : ev.side ? ' · ↔ Seitenwechsel' : ''}`);
  if (ev.type === 'match') {
    navigator.vibrate?.([80, 60, 80]);
    finishMatch();
  }
}));

$('#btn-undo').addEventListener('click', () => {
  if (db.live && L.undo(db.live)) { save(); renderScore(); } else toast('Nichts zum Rückgängigmachen');
});

$('#btn-end').addEventListener('click', async () => {
  const m = db.live;
  if (m.winner !== null) return finishMatch();
  if (!await confirmAsk('Spiel abbrechen? Der Spielstand geht verloren.', 'Abbrechen')) return;
  db.live = null;
  save();
  renderScore();
});

async function finishMatch() {
  const m = db.live;
  const raw = m.raw || [];
  const names = m.cfg.names;
  const canSave = raw.every(Boolean) && new Set(raw.map(n => n.toLowerCase())).size === 4;
  const w = m.winner;
  const dur = m.started ? Math.max(1, Math.round(((m.ended || Date.now()) - m.started) / 60000)) : null;
  const html = `<img class="dlg-art" src="img/hero-rank.svg" alt="">
    <h3 style="text-align:center">${esc(names[w].join(' & '))} gewinnt!</h3>
    <p class="result-big">${esc(setsText(m.sets))}</p>
    ${dur ? `<p class="hint center">Spieldauer ${fmtMin(dur)}</p>` : ''}
    ${canSave ? '' : '<p class="hint">Für die Rangliste vier verschiedene Namen eingeben.</p>'}`;
  const buttons = [{ label: 'Zurück', value: 'back' }, { label: 'Teilen', value: 'share' }, { label: canSave ? 'Nicht speichern' : 'Fertig', value: 'drop' }];
  if (canSave) buttons.push({ label: 'In Rangliste speichern', value: 'save', cls: 'primary' });
  let v;
  while ((v = await ask(html, buttons)) === 'share') {
    await shareText(`🎾 ${names[w].join(' & ')} gewinnen gegen ${names[1 - w].join(' & ')}\n${setsText(m.sets)}${dur ? ` · ${fmtMin(dur)}` : ''}`);
  }
  if (v === 'back' || v === '') return;
  if (v === 'save') {
    const ids = raw.map(ensurePlayer);
    db.matches.push({ id: uid(), ts: Date.now(), a: ids.slice(0, 2), b: ids.slice(2), sets: m.sets, win: w, kind: 'match', dur });
    toast('✅ In der Rangliste gespeichert');
  }
  db.live = null;
  save();
  renderScore();
}

function renderScore() {
  refreshPlayerList();
  renderQuickPlayers();
  const m = db.live;
  $('#score-setup').classList.toggle('hidden', !!m);
  $('#score-live').classList.toggle('hidden', !m);
  keepAwake(!!m && m.winner === null);
  clearInterval(clockTimer);
  $('#opt-speech').checked = !!db.speech;
  $('#btn-speech').classList.toggle('off', !db.speech);
  if (!m) return;
  tickClock();
  if (m.winner === null) clockTimer = setInterval(tickClock, 1000);

  const labels = L.pointLabels(m);
  const srv = L.currentServer(m);
  $('#sb-status').textContent = L.statusText(m);
  $('#sb-sets').innerHTML = m.sets.map((s, i) =>
    `<span class="set"><small>${i + 1}.</small> ${s.super ? `${s.tb[0]}:${s.tb[1]}` : `${s.g[0]}:${s.g[1]}`}</span>`
  ).join('');
  $$('.sb-team').forEach(btn => {
    const t = +btn.dataset.team;
    btn.querySelector('.sb-names').innerHTML = m.cfg.names[t].map((n, p) =>
      `<span class="${m.winner === null && L.serveTeam(srv) === t && L.servePlayer(srv) === p ? 'srv' : ''}">${esc(n)}</span>`
    ).join('<span class="amp">&</span>');
    btn.querySelector('.sb-points').textContent = m.winner !== null ? (m.winner === t ? '🏆' : '') : labels[t];
    btn.querySelector('.sb-games').textContent = m.games[t];
    btn.classList.toggle('won', m.winner === t);
  });
}

/* ---------- 🏆 Rangliste ---------- */

const PERIODS = { all: 'insgesamt', 30: 'in den letzten 30 Tagen', year: `im Jahr ${new Date().getFullYear()}` };
function periodMatches() {
  const p = db.rankPeriod || 'all';
  if (p === 'all') return db.matches;
  const from = p === 'year' ? new Date(new Date().getFullYear(), 0, 1).getTime() : Date.now() - 30 * 86400000;
  return db.matches.filter(m => m.ts >= from);
}
$$('#rank-period button').forEach(b => b.addEventListener('click', () => {
  db.rankPeriod = b.dataset.p;
  save();
  renderRank();
}));

function renderRank() {
  refreshPlayerList();
  $$('#rank-period button').forEach(b => b.classList.toggle('on', b.dataset.p === (db.rankPeriod || 'all')));
  const rank = L.ranking(db.players, periodMatches()).filter(s => s.played);
  $('#rank-list').innerHTML = rank.length ? rank.map((s, i) => `
    <li class="tappable" data-player="${s.id}">
      <span class="rank-pos ${i < 3 ? 'p' + (i + 1) : ''}">${i + 1}</span>
      <div class="grow">
        <div><b>${esc(s.name)}</b><span class="trend" title="Letzte Spiele">${s.trend.slice(-5).map(r => `<i class="${r}"></i>`).join('')}</span></div>
        <div class="sub">${s.played} Spiel${s.played === 1 ? '' : 'e'} · ${s.won} S / ${s.lost} N${s.drawn ? ` / ${s.drawn} U` : ''} · ${Math.round(100 * s.won / s.played)} %</div>
        <div class="bar"><i style="width:${Math.round(100 * s.won / s.played)}%"></i></div>
      </div>
      <span class="elo">${Math.round(s.elo)}<small>ELO</small></span>
    </li>`).join('') : `<li class="empty">${db.matches.length ? `Keine Spiele ${PERIODS[db.rankPeriod || 'all']}.` : 'Noch keine Spiele – zähle ein Spiel oder trag ein Ergebnis ein.'}</li>`;

  const recent = [...db.matches].sort((x, y) => y.ts - x.ts).slice(0, 30);
  const kind = { americano: 'Americano · ', mexicano: 'Mexicano · ', match: '' };
  $('#match-list').innerHTML = recent.length ? recent.map(mt => `
    <li>
      <div class="grow match-teams">
        <span class="${mt.win === 0 ? 'w' : ''}">${esc(pname(mt.a[0]))} & ${esc(pname(mt.a[1]))}</span>
        <span class="${mt.win === 1 ? 'w' : ''}">${esc(pname(mt.b[0]))} & ${esc(pname(mt.b[1]))}</span>
        <span class="sub">${kind[mt.kind] || ''}${new Date(mt.ts).toLocaleDateString('de-DE')}${mt.dur ? ` · ${fmtMin(mt.dur)}` : ''}</span>
      </div>
      <span class="match-score">${esc(setsText(mt.sets))}</span>
      <button class="linkbtn" data-del-match="${mt.id}" aria-label="Löschen">${ico('trash')}</button>
    </li>`).join('') : '<li class="empty">Noch keine Spiele</li>';

  $('#player-admin').innerHTML = db.players.length ? db.players.map(p => `
    <li>
      <span class="avatar">${esc(initials(p.name))}</span>
      <span class="grow">${esc(p.name)}</span>
      <button class="linkbtn" data-rename="${p.id}" aria-label="Umbenennen">${ico('edit')}</button>
      <button class="linkbtn" data-del-player="${p.id}" aria-label="Löschen">${ico('trash')}</button>
    </li>`).join('') : '<li class="empty">Noch keine Spieler</li>';
}

$('#tab-rank').addEventListener('click', async e => {
  const b = e.target.closest('button');
  const card = e.target.closest('li[data-player]');
  if (!b && card) return showProfile(card.dataset.player);
  if (!b) return;
  if (b.dataset.delMatch) {
    if (!await confirmAsk('Dieses Spiel löschen?', 'Löschen')) return;
    db.matches = db.matches.filter(m => m.id !== b.dataset.delMatch);
  } else if (b.dataset.rename) {
    const p = player(b.dataset.rename);
    const v = await ask(`<h3>Umbenennen</h3><input id="rn" value="${esc(p.name)}" required>`,
      [{ label: 'Abbrechen', value: '' }, { label: 'Speichern', value: 'ok', cls: 'primary' }]);
    const name = $('#rn').value.trim();
    if (v !== 'ok' || !name) return;
    const other = findPlayer(name);
    if (other && other.id !== p.id) return toast('Diesen Namen gibt es schon');
    p.name = name;
  } else if (b.dataset.delPlayer) {
    const id = b.dataset.delPlayer;
    const n = db.matches.filter(m => [...m.a, ...m.b].includes(id)).length;
    if (!await confirmAsk(`${esc(pname(id))} löschen?${n ? ` Dabei werden auch ${n} Spiel(e) gelöscht.` : ''}`, 'Löschen')) return;
    db.players = db.players.filter(p => p.id !== id);
    db.matches = db.matches.filter(m => ![...m.a, ...m.b].includes(id));
  } else return;
  save();
  renderRank();
});

$('#form-player').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#new-player').value.trim();
  if (!name) return;
  if (findPlayer(name)) return toast('Diesen Namen gibt es schon');
  ensurePlayer(name);
  $('#new-player').value = '';
  save();
  renderRank();
});

$('#btn-add-result').addEventListener('click', async () => {
  const inp = (id, ph) => `<input id="${id}" list="player-list" placeholder="${ph}" required autocomplete="off">`;
  const num = id => `<input id="${id}" type="number" min="0" max="99" inputmode="numeric">`;
  const html = `<h3>Ergebnis eintragen</h3>
    <div class="grid2">
      <div class="field"><span style="color:var(--a)">Team A</span>${inp('r-a1', 'Spieler 1')}${inp('r-a2', 'Spieler 2')}</div>
      <div class="field"><span style="color:var(--b)">Team B</span>${inp('r-b1', 'Spieler 3')}${inp('r-b2', 'Spieler 4')}</div>
    </div>
    <div class="field">Sätze (Spiele Team A : Team B)
      <div class="sets-input">
        ${[1, 2, 3].map(i => `<span>${i}.</span>${num('s' + i + 'a')}<span>:</span>${num('s' + i + 'b')}`).join('')}
      </div>
    </div>
    <label class="field">Datum<input id="r-date" type="date" value="${today()}"></label>`;
  const v = await ask(html, [{ label: 'Abbrechen', value: '' }, { label: 'Speichern', value: 'ok', cls: 'primary' }]);
  if (v !== 'ok') return;
  const names = ['#r-a1', '#r-a2', '#r-b1', '#r-b2'].map(s => $(s).value.trim());
  if (names.some(n => !n) || new Set(names.map(n => n.toLowerCase())).size !== 4) return toast('Bitte vier verschiedene Namen eingeben');
  const sets = [];
  for (const i of [1, 2, 3]) {
    const a = $(`#s${i}a`).value, b = $(`#s${i}b`).value;
    if (a === '' && b === '') continue;
    if (a === '' || b === '' || +a === +b) return toast(`Satz ${i} ist unvollständig`);
    sets.push({ g: [+a, +b], tb: null, super: false });
  }
  const w = L.setsWon({ sets });
  if (!sets.length || w[0] === w[1]) return toast('Bitte ein eindeutiges Ergebnis eintragen');
  const ids = names.map(ensurePlayer);
  const date = $('#r-date').value;
  const ts = date && date !== today() ? new Date(date + 'T20:00').getTime() : Date.now();
  db.matches.push({ id: uid(), ts, a: ids.slice(0, 2), b: ids.slice(2), sets, win: w[0] > w[1] ? 0 : 1, kind: 'match' });
  save();
  renderRank();
  toast('✅ Gespeichert');
});

$('#btn-export').addEventListener('click', () => {
  const { live, ...data } = db;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  download(blob, `padel-sicherung-${today()}.json`);
});

$('#file-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.players) || !Array.isArray(data.matches)) throw new Error();
    if (!await confirmAsk('Sicherung laden? Die Daten auf diesem Gerät werden ersetzt.', 'Laden')) return;
    db = Object.assign(EMPTY(), data, { live: db.live });
    save();
    renderRank();
    toast('✅ Sicherung geladen');
  } catch (err) {
    toast('Das ist keine gültige Padel-Sicherung');
  }
});

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* Spielerprofil mit Elo-Verlauf */
function eloChart(history) {
  const W = 300, H = 120, P = { l: 34, r: 40, t: 12, b: 18 };
  const lo = Math.min(...history, 1000), hi = Math.max(...history, 1000);
  const span = Math.max(20, hi - lo), min = lo - span * .12, max = hi + span * .12;
  const x = i => P.l + (history.length < 2 ? 0 : i * (W - P.l - P.r) / (history.length - 1));
  const y = v => P.t + (max - v) * (H - P.t - P.b) / (max - min);
  const pts = history.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = history[history.length - 1];
  return `<svg id="elo-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elo-Verlauf über ${history.length - 1} Spiele, aktuell ${Math.round(last)}">
    <line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(1000)}" y2="${y(1000)}"/>
    <text class="axis" x="${P.l - 6}" y="${y(1000) + 4}" text-anchor="end">1000</text>
    <text class="axis" x="${P.l}" y="${H - 3}">Start</text>
    <text class="axis" x="${W - P.r}" y="${H - 3}" text-anchor="end">Spiel ${history.length - 1}</text>
    <polyline class="line" points="${pts}"/>
    <circle class="end" cx="${x(history.length - 1)}" cy="${y(last)}" r="4.5"/>
    <text class="val" x="${x(history.length - 1) + 8}" y="${y(last) + 4}">${Math.round(last)}</text>
    <g class="hover hidden"><line class="cross" y1="${P.t}" y2="${H - P.b}"/><circle class="dot" r="5"/></g>
    <rect class="hit" x="${P.l - 8}" y="0" width="${W - P.l - P.r + 16}" height="${H}" fill="transparent"/>
  </svg>
  <div id="elo-tip" class="chart-tip hidden"></div>`;
}

function bindEloChart(history) {
  const svg = $('#elo-chart');
  if (!svg) return;
  const pts = svg.querySelector('.line').getAttribute('points').split(' ').map(p => p.split(',').map(Number));
  const hover = svg.querySelector('.hover'), tip = $('#elo-tip');
  const show = e => {
    const r = svg.getBoundingClientRect();
    const vx = (e.clientX - r.left) * 300 / r.width;
    let i = 0;
    pts.forEach((p, k) => { if (Math.abs(p[0] - vx) < Math.abs(pts[i][0] - vx)) i = k; });
    const [px, py] = pts[i];
    hover.classList.remove('hidden');
    hover.querySelector('.cross').setAttribute('x1', px);
    hover.querySelector('.cross').setAttribute('x2', px);
    hover.querySelector('.dot').setAttribute('cx', px);
    hover.querySelector('.dot').setAttribute('cy', py);
    const d = i ? Math.round(history[i] - history[i - 1]) : 0;
    tip.innerHTML = `<b>${Math.round(history[i])}</b> ${i ? `nach Spiel ${i} <span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : '−'}${Math.abs(d)}</span>` : 'Start'}`;
    tip.classList.remove('hidden');
    tip.style.left = `${Math.min(r.width - 120, Math.max(0, px * r.width / 300 - 60))}px`;
  };
  const hide = () => { hover.classList.add('hidden'); tip.classList.add('hidden'); };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
}

async function showProfile(id) {
  const r = L.ranking(db.players, db.matches);
  const me = r.find(x => x.id === id);
  if (!me) return;
  const pos = r.filter(x => x.played).findIndex(x => x.id === id) + 1;
  const st = L.playerStats(id, db.matches);
  const rec = e => `${e.played} Spiel${e.played === 1 ? '' : 'e'} · ${e.won} S / ${e.lost} N`;
  const person = (label, e, cls) => e ? `<div class="duo ${cls}"><span class="sub">${label}</span>
      <div class="duo-row"><span class="avatar">${esc(initials(pname(e.id)))}</span><div><b>${esc(pname(e.id))}</b><div class="sub">${rec(e)}</div></div></div></div>` : '';
  const html = `<div class="profile-head">
      <span class="avatar big">${esc(initials(me.name))}</span>
      <div><h3>${esc(me.name)}</h3><div class="sub">${pos ? `Platz ${pos} von ${r.filter(x => x.played).length}` : 'Noch ohne Wertung'}</div></div>
      <span class="elo">${Math.round(me.elo)}<small>ELO</small></span>
    </div>
    ${me.played ? eloChart(me.history) : ''}
    <div class="stat-grid">
      <div><b>${me.played}</b><span>Spiele</span></div>
      <div><b>${me.played ? Math.round(100 * me.won / me.played) : 0} %</b><span>Siege</span></div>
      <div><b>${st.streak}</b><span>Serie</span></div>
      <div><b>${st.bestStreak}</b><span>Beste Serie</span></div>
    </div>
    <div class="duos">${person('Bester Partner', st.bestPartner, 'good')}${st.nemesis ? person('Angstgegner', st.nemesis, 'bad') : (me.played ? '<div class="duo good"><span class="sub">Angstgegner</span><div class="duo-row"><b>Keiner 💪</b></div></div>' : '')}</div>
    ${st.partners.length ? `<h4 class="mini">Mit Partnern</h4><ul class="mini-list">${st.partners.slice(0, 5).map(e =>
      `<li><span>${esc(pname(e.id))}</span><span class="sub">${rec(e)}</span></li>`).join('')}</ul>` : ''}`;
  const done = ask(html, [{ label: 'Schließen', value: 'ok', cls: 'primary' }]);
  if (me.played) bindEloChart(me.history);
  await done;
}

/* ---------- 🔄 Turnier ---------- */

const draft = { mode: 'americano', names: [] };
const MODE_HINT = {
  americano: 'Jede Runde neue Partner – am Ende gewinnt, wer insgesamt die meisten Punkte sammelt.',
  mexicano: 'Ab Runde 2 wird nach Tabelle gemischt: 1. + 4. gegen 2. + 3. – so werden die Spiele immer ausgeglichener.',
};

$$('#tour-mode button').forEach(b => b.addEventListener('click', () => {
  draft.mode = b.dataset.mode;
  renderTour();
}));

$('#form-tour-player').addEventListener('submit', e => {
  e.preventDefault();
  addDraftName($('#tour-new').value);
  $('#tour-new').value = '';
});

function addDraftName(name) {
  name = name.trim();
  if (!name) return;
  if (draft.names.some(n => n.toLowerCase() === name.toLowerCase())) return toast('Schon dabei');
  draft.names.push(findPlayer(name)?.name || name);
  $('#tour-courts').value = Math.max(1, Math.floor(draft.names.length / 4));
  renderTour();
}

$('#tour-chips').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.add) addDraftName(b.dataset.add);
  if (b.dataset.remove) {
    draft.names.splice(+b.dataset.remove, 1);
    $('#tour-courts').value = Math.max(1, Math.floor(draft.names.length / 4));
    renderTour();
  }
});

$('#btn-tour-start').addEventListener('click', () => {
  if (draft.names.length < 4) return toast('Mindestens 4 Spieler');
  const courts = Math.max(1, Math.min(+$('#tour-courts').value || 1, Math.floor(draft.names.length / 4)));
  db.tour = {
    id: uid(), ts: Date.now(), mode: draft.mode, pts: +$('#tour-pts').value, courts,
    players: draft.names.map(ensurePlayer), rounds: [], toRank: $('#tour-rank').checked,
  };
  L.nextRound(db.tour);
  draft.names = [];
  save();
  renderTour();
});

$('#btn-tour-next').addEventListener('click', () => {
  const t = db.tour;
  const last = t.rounds[t.rounds.length - 1];
  if (last.matches.some(m => m.sa === null || m.sb === null)) return toast('Erst alle Ergebnisse dieser Runde eintragen');
  L.nextRound(t);
  save();
  renderTour();
  $('#tour-rounds').firstElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('#btn-tour-finish').addEventListener('click', async () => {
  const t = db.tour;
  if (!await confirmAsk('Turnier beenden?', 'Beenden')) return;
  const st = L.standings(t);
  if (t.toRank) {
    let n = 0;
    t.rounds.forEach(r => r.matches.forEach(m => {
      if (m.sa === null || m.sb === null) return;
      db.matches.push({
        id: uid(), ts: t.ts + n++, a: m.a, b: m.b, kind: t.mode,
        sets: [{ g: [m.sa, m.sb], tb: null, super: false }], win: m.sa > m.sb ? 0 : m.sb > m.sa ? 1 : null,
      });
    }));
  }
  db.tour = null;
  save();
  renderTour();
  const endHtml = `<img class="dlg-art" src="img/hero-rank.svg" alt=""><h3>Endstand</h3><div class="podium">${st.slice(0, 3).map((s, i) =>
    `${['🥇', '🥈', '🥉'][i]} ${esc(pname(s.id))} – ${s.pts} Punkte`).join('<br>')}</div>`;
  const title = `${t.mode === 'americano' ? 'Americano' : 'Mexicano'} – Endstand`;
  while (await ask(endHtml, [{ label: 'Teilen', value: 'share' }, { label: 'Fertig', value: 'ok', cls: 'primary' }]) === 'share') {
    await shareText(`🏆 ${title}\n` + st.map((s, i) => `${i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`} ${pname(s.id)} – ${s.pts} Pkt`).join('\n'));
  }
});

// Eingabe der Punkte: Team B bekommt automatisch den Rest bis zur Punktzahl.
$('#tour-rounds').addEventListener('input', e => {
  const inp = e.target;
  if (!inp.dataset.r) return;
  const t = db.tour;
  const m = t.rounds[+inp.dataset.r].matches[+inp.dataset.m];
  const side = inp.dataset.s;
  const val = inp.value === '' ? null : Math.max(0, Math.min(t.pts, Math.round(+inp.value)));
  const other = side === 'a' ? 'sb' : 'sa';
  m[side === 'a' ? 'sa' : 'sb'] = val;
  m[other] = val === null ? null : t.pts - val;
  const otherInp = inp.closest('.court').querySelector(`[data-s="${side === 'a' ? 'b' : 'a'}"]`);
  otherInp.value = m[other] ?? '';
  save();
  renderTourTable();
});

function renderTour() {
  refreshPlayerList();
  const t = db.tour;
  $('#tour-setup').classList.toggle('hidden', !!t);
  $('#tour-live').classList.toggle('hidden', !t);
  if (!t) {
    $$('#tour-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === draft.mode));
    const n = draft.names.length;
    $('#tour-mode-hint').textContent = MODE_HINT[draft.mode] +
      (draft.mode === 'americano' && n >= 4 && n % 4 === 0 ? ` Bei ${n} Spielern spielt nach ${n - 1} Runden jeder einmal mit jedem.` : '') +
      (n >= 4 && n % 4 ? ` Pro Runde setzen ${n - 4 * Math.max(1, Math.min(+$('#tour-courts').value || 1, Math.floor(n / 4)))} aus.` : '');
    const known = db.players.filter(p => !draft.names.some(n => n.toLowerCase() === p.name.toLowerCase()));
    $('#tour-chips').innerHTML =
      draft.names.map((n, i) => `<span>${esc(n)}<button data-remove="${i}" aria-label="Entfernen">${ico('close')}</button></span>`).join('') +
      known.map(p => `<button class="chip" data-add="${esc(p.name)}">${ico('plus')}${esc(p.name)}</button>`).join('');
    $('#btn-tour-start').textContent = `Turnier starten (${n} Spieler)`;
    return;
  }

  $('#tour-title').textContent = `${t.mode === 'americano' ? 'Americano' : 'Mexicano'} · ${t.pts} Punkte`;
  $('#tour-rounds').innerHTML = t.rounds.map((r, ri) => `
    <div class="round">
      <h3><span class="rnd">Runde ${ri + 1}</span>${r.sit.length ? `<span class="sit">Pause: ${r.sit.map(id => esc(pname(id))).join(', ')}</span>` : ''}</h3>
      ${r.matches.map((m, mi) => `
        <div class="court">
          <span class="label">Platz ${mi + 1}</span>
          <span class="pair">${esc(pname(m.a[0]))}<br>${esc(pname(m.a[1]))}</span>
          <span class="nums">
            <input type="number" inputmode="numeric" min="0" max="${t.pts}" data-r="${ri}" data-m="${mi}" data-s="a" value="${m.sa ?? ''}">
            :
            <input type="number" inputmode="numeric" min="0" max="${t.pts}" data-r="${ri}" data-m="${mi}" data-s="b" value="${m.sb ?? ''}">
          </span>
          <span class="pair b">${esc(pname(m.b[0]))}<br>${esc(pname(m.b[1]))}</span>
        </div>`).join('')}
    </div>`).reverse().join('');
  renderTourTable();
}

function renderTourTable() {
  const st = L.standings(db.tour);
  $('#tour-table').innerHTML = '<tr><th>#</th><th>Spieler</th><th>Pkt</th><th>Sp</th><th>S</th><th>+/−</th></tr>' +
    st.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(pname(s.id))}</td><td>${s.pts}</td><td>${s.played}</td><td>${s.won}</td><td>${s.diff > 0 ? '+' : ''}${s.diff}</td></tr>`).join('');
}

/* ---------- 📍 Plätze ---------- */

const PC = window.PadelCourts;
// Leaflet meldet sich als window.L an – L ist hier schon die Spiellogik
const Leaflet = () => window.L;
const GKEY = (window.PADEL_CONFIG || {}).googleApiKey || '';
const cs = { center: null, label: '', results: [], selected: null, map: null, layer: null, busy: false };

function courtPrefs() {
  return Object.assign({ radius: 10, sort: 'distance', label: '' }, db.courtPrefs);
}

function setCourtStatus(html) {
  $('#courts-status').innerHTML = html;
}

// Lädt Leaflet erst, wenn die Karte gebraucht wird.
let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'vendor/leaflet.css';
  document.head.appendChild(css);
  leafletLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/leaflet.js';
    s.onload = res;
    s.onerror = () => { leafletLoading = null; rej(new Error('Karte konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
  return leafletLoading;
}

function locate() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Dein Gerät kann keinen Standort liefern'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Dein Standort' }),
      err => rej(new Error(err.code === 1
        ? 'Standort nicht freigegeben – erlaube ihn in den Einstellungen oder gib einen Ort ein'
        : 'Standort nicht gefunden – gib einen Ort ein')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });
}

async function runCourtSearch(getCenter) {
  if (cs.busy) return;
  cs.busy = true;
  setCourtStatus('<span class="spinner"></span>Suche Padel-Anlagen …');
  $('#courts-list').innerHTML = '';
  try {
    const center = await getCenter();
    if (!center) throw new Error('Ort nicht gefunden – versuch es mit PLZ oder Stadt');
    const radius = +$('#court-radius').value;
    cs.center = center;
    cs.label = center.label;
    cs.selected = null;
    cs.results = GKEY ? await PC.searchGoogle(GKEY, center, radius) : await PC.searchOsm(center, radius);
    db.courtPrefs = { ...courtPrefs(), radius, label: center.label === 'Dein Standort' ? courtPrefs().label : center.label };
    save();
    renderCourts();
  } catch (e) {
    setCourtStatus(esc(e.message || 'Suche fehlgeschlagen'));
  } finally {
    cs.busy = false;
  }
}

$('#btn-locate').addEventListener('click', () => runCourtSearch(locate));

$('#form-place').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#place-input').value.trim();
  if (!text) return toast('Bitte einen Ort eingeben');
  $('#place-input').blur();
  runCourtSearch(() => GKEY ? PC.geocodeGoogle(GKEY, text) : PC.geocodeOsm(text));
});

$('#court-radius').addEventListener('change', () => {
  if (cs.center) runCourtSearch(async () => cs.center);
});
$('#court-sort').addEventListener('change', () => {
  db.courtPrefs = { ...courtPrefs(), sort: $('#court-sort').value };
  save();
  renderCourts();
});
$('#court-open').addEventListener('change', renderCourts);

function visibleCourts() {
  const list = PC.filterCourts(cs.results, { radiusKm: +$('#court-radius').value, openNow: GKEY && $('#court-open').checked });
  return PC.sortCourts(list, $('#court-sort').value);
}

function courtCard(c) {
  const tags = [];
  if (c.rating) tags.push(`<span class="tag star">${ico('star')}${c.rating.toFixed(1).replace('.', ',')}${c.ratings ? ` <span class="sub">(${c.ratings})</span>` : ''}</span>`);
  if (c.openNow === true) tags.push('<span class="tag open">Jetzt geöffnet</span>');
  if (c.openNow === false) tags.push('<span class="tag closed">Geschlossen</span>');
  if (c.courts) tags.push(`<span class="tag">${c.courts} Court${c.courts === 1 ? '' : 's'}</span>`);
  if (c.indoor) tags.push('<span class="tag">Halle</span>');
  const link = (href, icon, label, extra = '') => `<a class="chip" href="${esc(href)}" target="_blank" rel="noopener" ${extra}>${ico(icon)}${label}</a>`;
  return `<li class="court-card ${cs.selected === c.id ? 'sel' : ''}" data-court="${esc(c.id)}">
    <div class="top">
      <div class="grow">
        <div class="name">${esc(c.name)}</div>
        ${c.address ? `<div class="sub">${esc(c.address)}</div>` : ''}
      </div>
      <span class="dist">${PC.fmtKm(c.distance)}</span>
    </div>
    ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
    <div class="btnrow">
      ${link(PC.routeUrl(c), 'route', 'Route')}
      ${c.website ? link(c.website, 'globe', 'Website') : ''}
      ${c.phone ? `<a class="chip icon" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}" aria-label="Anrufen">${ico('phone')}</a>` : ''}
      <button class="chip" data-plan="${esc(c.id)}">${ico('cal-add')}Termin hier</button>
    </div>
  </li>`;
}

function renderCourts() {
  const p = courtPrefs();
  $('#court-sort').value = p.sort;
  $$('#court-sort option[data-google]').forEach(o => { o.hidden = !GKEY; });
  $$('#court-sort option[data-osm]').forEach(o => { o.hidden = !!GKEY; });
  if ($('#court-sort').selectedOptions[0]?.hidden) $('#court-sort').value = 'distance';
  $('#row-open').classList.toggle('hidden', !GKEY);
  if (!$('#place-input').value && p.label) $('#place-input').value = p.label;

  if (!cs.center) {
    setCourtStatus(cs.busy ? $('#courts-status').innerHTML : '');
    $('#courts-map').classList.add('hidden');
    $('#btn-gmaps').classList.add('hidden');
    $('#courts-source').innerHTML = '';
    return;
  }
  const list = visibleCourts();
  setCourtStatus(list.length
    ? `<b>${list.length}</b> Anlage${list.length === 1 ? '' : 'n'} im Umkreis von ${$('#court-radius').value} km um ${esc(cs.label)}`
    : `Keine Padel-Anlage im Umkreis von ${$('#court-radius').value} km gefunden – vergrößere den Umkreis oder schau in Google Maps.`);
  $('#courts-list').innerHTML = list.map(courtCard).join('');
  $('#btn-gmaps').href = PC.googleMapsSearchUrl(cs.center);
  $('#btn-gmaps').classList.remove('hidden');
  $('#courts-source').innerHTML = GKEY
    ? 'Ergebnisse von Google'
    : 'Daten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende · nicht jede Anlage ist eingetragen';
  renderCourtMap(list);
}

async function renderCourtMap(list) {
  const box = $('#courts-map');
  box.classList.remove('hidden');
  if (GKEY) {
    const sel = cs.results.find(c => c.id === cs.selected);
    const src = PC.embedUrl(GKEY, cs.center, sel);
    let frame = box.querySelector('iframe');
    if (!frame) {
      box.innerHTML = '<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen title="Karte"></iframe>';
      frame = box.querySelector('iframe');
    }
    if (frame.getAttribute('src') !== src) frame.src = src;
    return;
  }
  try {
    await loadLeaflet();
  } catch (e) {
    box.classList.add('hidden');
    return;
  }
  if (!cs.map) {
    cs.map = Leaflet().map(box, { zoomControl: false, attributionControl: true });
    Leaflet().tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(cs.map);
    cs.layer = Leaflet().layerGroup().addTo(cs.map);
  }
  cs.layer.clearLayers();
  cs.markers = {};
  Leaflet().marker([cs.center.lat, cs.center.lng], { icon: Leaflet().divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }) }).addTo(cs.layer);
  list.forEach(c => {
    const m = Leaflet().marker([c.lat, c.lng], {
      icon: Leaflet().divIcon({ className: '', html: `<div class="court-pin ${cs.selected === c.id ? 'sel' : ''}"></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }),
    }).addTo(cs.layer).bindPopup(esc(c.name));
    m.on('click', () => selectCourt(c.id, true));
    cs.markers[c.id] = m;
  });
  const pts = [[cs.center.lat, cs.center.lng], ...list.map(c => [c.lat, c.lng])];
  setTimeout(() => {
    cs.map.invalidateSize();
    if (!cs.selected) {
      if (pts.length > 1) cs.map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
      else cs.map.setView(pts[0], 12);
    }
  }, 50);
}

function selectCourt(id, fromMap) {
  cs.selected = id;
  const c = cs.results.find(x => x.id === id);
  $$('.court-card').forEach(li => li.classList.toggle('sel', li.dataset.court === id));
  if (GKEY) {
    renderCourtMap(visibleCourts());
  } else if (cs.map && c) {
    Object.entries(cs.markers || {}).forEach(([mid, m]) => m.getElement()?.firstElementChild?.classList.toggle('sel', mid === id));
    cs.map.flyTo([c.lat, c.lng], Math.max(cs.map.getZoom(), 14), { duration: .6 });
    cs.markers[id]?.openPopup();
  }
  if (fromMap) $(`.court-card[data-court="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  else $('#courts-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#courts-list').addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const plan = e.target.closest('[data-plan]');
  if (plan) {
    const c = cs.results.find(x => x.id === plan.dataset.plan);
    if (c) eventDialog(null, { place: [c.name, c.address].filter(Boolean).join(', ') });
    return;
  }
  const li = e.target.closest('.court-card');
  if (li) selectCourt(li.dataset.court, false);
});

/* ---------- 📅 Termine ---------- */

const appUrl = () => location.origin + location.pathname;
const STATUS = {
  yes: { label: '✅ Bin dabei', verb: 'hat zugesagt' },
  maybe: { label: '🤔 Vielleicht', verb: 'hat vielleicht Zeit' },
  no: { label: '❌ Kann nicht', verb: 'hat abgesagt' },
};
const eventLine = ev => `${fmtDate(ev.date, ev.time)}${ev.place ? ' · ' + ev.place : ''}`;

async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('📋 Text kopiert – in WhatsApp einfügen');
  } catch (e) {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
}

function inviteText(ev) {
  const link = appUrl() + '#t=' + L.encode({ i: ev.id, ti: ev.title, d: ev.date, h: ev.time, p: ev.place, m: ev.max, o: ev.org });
  return `🎾 ${ev.title}\n📅 ${fmtDate(ev.date, ev.time)}${ev.place ? `\n📍 ${ev.place}` : ''}\n👥 ${ev.max} Plätze${ev.price ? `\n💶 ca. ${L.fmtEuro(ev.price / ev.max)} pro Person` : ''}\n\nSag hier zu oder ab:\n${link}`;
}

function replyText(ev, name, s) {
  const link = appUrl() + '#r=' + L.encode({ i: ev.id, n: name, s });
  return `${STATUS[s].label} – ${name}\n🎾 ${ev.title}, ${fmtDate(ev.date, ev.time)}\n\n${ev.org ? ev.org + ', t' : 'T'}ipp auf den Link, dann steht es in deiner Padel-App:\n${link}`;
}

async function eventDialog(ev, preset = {}) {
  const isNew = !ev;
  ev = ev || { title: 'Padel', date: '', time: '19:00', place: '', max: 4, ...preset };
  const v = await ask(`<h3>${isNew ? 'Neuer Termin' : 'Termin bearbeiten'}</h3>
    <label class="field">Titel<input id="e-title" value="${esc(ev.title)}" required></label>
    <div class="grid2">
      <label class="field">Datum<input id="e-date" type="date" value="${esc(ev.date)}" required></label>
      <label class="field">Uhrzeit<input id="e-time" type="time" value="${esc(ev.time)}"></label>
    </div>
    <label class="field">Ort / Club<input id="e-place" value="${esc(ev.place)}" placeholder="z. B. Padel Club Mitte, Platz 2"></label>
    <div class="grid2">
      <label class="field">Plätze<input id="e-max" type="number" min="2" max="32" value="${ev.max}"></label>
      <label class="field">Dein Name<input id="e-me" value="${esc(db.me)}" required></label>
    </div>
    <div class="grid2">
      <label class="field">Platzmiete gesamt (€)<input id="e-price" type="number" inputmode="decimal" min="0" step="0.5" value="${ev.price ?? ''}" placeholder="optional"></label>
      ${isNew ? `<label class="field">Wiederholen<select id="e-repeat">
        <option value="1">Einmalig</option><option value="4">Wöchentlich, 4×</option><option value="8">Wöchentlich, 8×</option>
      </select></label>` : ''}
    </div>`, [{ label: 'Abbrechen', value: '' }, { label: isNew ? 'Erstellen' : 'Speichern', value: 'ok', cls: 'primary' }]);
  if (v !== 'ok') return;
  const me = $('#e-me').value.trim();
  const data = {
    title: $('#e-title').value.trim() || 'Padel', date: $('#e-date').value, time: $('#e-time').value,
    place: $('#e-place').value.trim(), max: Math.max(2, +$('#e-max').value || 4), org: me,
    price: +$('#e-price').value > 0 ? Math.round(+$('#e-price').value * 100) / 100 : null,
  };
  const repeat = isNew ? +$('#e-repeat').value : 1;
  if (me && db.me && db.me !== me && ev.rsvp?.[db.me]) {
    ev.rsvp[me] = ev.rsvp[db.me];
    delete ev.rsvp[db.me];
  }
  db.me = me;
  if (isNew) {
    const series = repeat > 1 ? uid() : null;
    const all = L.weeklyDates(data.date, repeat).map(date => ({ id: uid(), mine: true, rsvp: { [me]: 'yes' }, paid: {}, series, ...data, date }));
    db.events.push(...all);
    ev = all[0];
  } else Object.assign(ev, data);
  save();
  renderEvents();
  if (isNew && preset.place) showTab('events');
  const msg = repeat > 1 ? `${repeat} wöchentliche Termine erstellt! Einladung für den ersten verschicken?` : 'Termin erstellt! Jetzt Einladung per WhatsApp & Co. verschicken?';
  if (isNew && await confirmAsk(msg, 'Einladen')) shareText(inviteText(ev));
}

async function answerDialog(ev) {
  const v = await ask(`<h3>🎾 ${esc(ev.title)}</h3>
    <p>${esc(eventLine(ev))}${ev.org ? `<br><span class="hint">Einladung von ${esc(ev.org)}</span>` : ''}</p>
    <label class="field">Dein Name<input id="a-me" value="${esc(db.me)}" required></label>`,
  [{ label: 'Später', value: '' }, { label: STATUS.no.label, value: 'no' }, { label: STATUS.maybe.label, value: 'maybe' }, { label: STATUS.yes.label, value: 'yes', cls: 'primary' }]);
  if (!v) return;
  const name = $('#a-me').value.trim();
  if (!name) return toast('Bitte deinen Namen eingeben');
  db.me = name;
  ev.my = v;
  save();
  renderEvents();
  shareText(replyText(ev, name, v));
}

function ics(ev) {
  const pad = n => String(n).padStart(2, '0');
  const start = new Date(ev.date + 'T' + (ev.time || '19:00'));
  const end = new Date(start.getTime() + 90 * 60000);
  const f = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const txt = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Padel//DE', 'BEGIN:VEVENT',
    `UID:${ev.id}@padel`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${txt('🎾 ' + ev.title)}`, ev.place ? `LOCATION:${txt(ev.place)}` : '',
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  download(new Blob([body], { type: 'text/calendar' }), 'padel.ics');
}

/* Platzmiete teilen */
const payers = ev => Object.keys(ev.rsvp || {}).filter(n => ev.rsvp[n] === 'yes');
const isPaid = (ev, n) => n === ev.org || !!(ev.paid || {})[n];

function costLine(ev) {
  const who = payers(ev);
  const share = L.splitCost(ev.price, who.length)[0];
  const paid = who.filter(n => isPaid(ev, n)).length;
  return `<div class="sub cost-line">${L.fmtEuro(ev.price)}${share ? ` · ${L.fmtEuro(share)} p. P. · <b class="${paid === who.length ? 'ok' : ''}">${paid}/${who.length} bezahlt</b>` : ''}</div>`;
}

function paypalUrl(name, amount) {
  return name ? `https://paypal.me/${encodeURIComponent(name)}/${amount.toFixed(2)}EUR` : '';
}

async function costDialog(ev) {
  const who = payers(ev);
  if (!who.length) return toast('Noch keine Zusagen');
  const shares = L.splitCost(ev.price, who.length);
  const v = await ask(`<h3>Platzmiete</h3>
    <p class="result-big">${L.fmtEuro(shares[0])} <small class="hint">pro Person</small></p>
    <p class="hint center">${L.fmtEuro(ev.price)} geteilt durch ${who.length}</p>
    <ul class="mini-list pay-list">${who.map((n, i) => `<li><label class="row check">
      <span>${esc(n)}${n === ev.org ? ' <span class="sub">(hat ausgelegt)</span>' : ''} <span class="sub">${L.fmtEuro(shares[i])}</span></span>
      <input type="checkbox" class="switch" data-pay="${esc(n)}" ${isPaid(ev, n) ? 'checked' : ''} ${n === ev.org ? 'disabled' : ''}></label></li>`).join('')}</ul>
    <label class="field">Dein PayPal.me-Name (optional)<input id="c-paypal" value="${esc(db.paypal || '')}" placeholder="z. B. walterdeiss" autocomplete="off"></label>`,
  [{ label: 'Erinnerung teilen', value: 'remind' }, { label: 'Fertig', value: 'ok', cls: 'primary' }]);
  ev.paid = {};
  $$('[data-pay]').forEach(c => { if (c.checked && !c.disabled) ev.paid[c.dataset.pay] = true; });
  db.paypal = $('#c-paypal').value.trim().replace(/^.*paypal\.me\//i, '').replace(/\/.*$/, '');
  save();
  renderEvents();
  if (v !== 'remind') return;
  const open = who.filter(n => !isPaid(ev, n));
  if (!open.length) return toast('✅ Alle haben bezahlt');
  const link = paypalUrl(db.paypal, Math.max(...shares));
  shareText(`💶 ${ev.title} am ${fmtDate(ev.date, ev.time)}\n${L.fmtEuro(shares[0])} pro Person (${L.fmtEuro(ev.price)} gesamt)\nNoch offen: ${open.join(', ')}` +
    (link ? `\n\nPer PayPal an ${ev.org || db.me}:\n${link}` : ''));
}

function dateBadge(date) {
  if (!date) return '';
  const d = new Date(date + 'T12:00');
  return `<span class="date-badge"><span>${d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}</span><b>${d.getDate()}</b></span>`;
}

function renderEvents() {
  const now = today();
  const list = [...db.events].sort((x, y) => {
    const px = x.date < now, py = y.date < now;
    return px - py || (px ? y.date.localeCompare(x.date) : x.date.localeCompare(y.date)) || (x.time || '').localeCompare(y.time || '');
  });
  $('#event-list').innerHTML = list.length ? list.map(ev => {
    const rsvp = ev.rsvp || {};
    const yes = Object.keys(rsvp).filter(n => rsvp[n] === 'yes');
    const who = Object.entries(rsvp).map(([n, s]) =>
      ev.mine ? `<button class="chip ${s}" data-ev="${ev.id}" data-cycle="${esc(n)}">${esc(n)}</button>` : `<span class="${s}">${esc(n)}</span>`
    ).join('');
    const btns = ev.mine ? `
        <button class="chip" data-ev="${ev.id}" data-act="invite">${ico('share')}Einladen</button>
        <button class="chip" data-ev="${ev.id}" data-act="add">${ico('user-plus')}Person</button>
        ${ev.price ? `<button class="chip" data-ev="${ev.id}" data-act="cost">${ico('euro')}Kosten</button>` : ''}
        ${yes.length >= 4 ? `<button class="primary" data-ev="${ev.id}" data-act="play">${ico('play')}Spiel starten</button>` : ''}`
      : `<button class="chip" data-ev="${ev.id}" data-act="answer">${ev.my ? STATUS[ev.my].label + ' · ändern' : '↩︎ Antworten'}</button>`;
    return `<li class="event ${ev.date < now ? 'past' : ''}">
      <div class="event-head">
        ${dateBadge(ev.date)}
        <div class="grow">
          <div class="event-title">${esc(ev.title)}</div>
          <div class="sub">${esc(eventLine(ev))}</div>
          ${ev.mine ? '' : `<div class="sub">Einladung von ${esc(ev.org || '?')}</div>`}
          ${ev.series ? '<span class="tag">Wöchentlich</span>' : ''}
          ${ev.mine && ev.price ? costLine(ev) : ''}
        </div>
        ${ev.mine ? `<span class="slots ${yes.length >= ev.max ? 'full' : ''}"><span class="ring" style="--p:${Math.min(100, Math.round(100 * yes.length / ev.max))}"><b>${yes.length}/${ev.max}</b></span></span>` : ''}
      </div>
      ${ev.mine && who ? `<div class="who">${who}</div>` : ''}
      <div class="btnrow">
        ${btns}
        <button class="chip icon" data-ev="${ev.id}" data-act="ics" aria-label="In Kalender">${ico('cal-add')}</button>
        ${ev.mine ? `<button class="chip icon" data-ev="${ev.id}" data-act="edit" aria-label="Bearbeiten">${ico('edit')}</button>` : ''}
        <button class="chip icon danger" data-ev="${ev.id}" data-act="del" aria-label="Löschen">${ico('trash')}</button>
      </div>
    </li>`;
  }).join('') : '<li class="empty">Noch keine Termine</li>';
}

$('#btn-new-event').addEventListener('click', () => eventDialog());

$('#event-list').addEventListener('click', async e => {
  const b = e.target.closest('button[data-ev]');
  if (!b) return;
  const ev = db.events.find(x => x.id === b.dataset.ev);
  if (!ev) return;
  if (b.dataset.cycle) {
    // Antippen wechselt: dabei → vielleicht → abgesagt → entfernen
    const n = b.dataset.cycle;
    const next = { yes: 'maybe', maybe: 'no', no: null }[ev.rsvp[n]];
    if (next) ev.rsvp[n] = next; else delete ev.rsvp[n];
    save();
    return renderEvents();
  }
  switch (b.dataset.act) {
    case 'invite': return shareText(inviteText(ev));
    case 'answer': return answerDialog(ev);
    case 'ics': return ics(ev);
    case 'cost': return costDialog(ev);
    case 'edit': return eventDialog(ev);
    case 'add': {
      const v = await ask('<h3>Person hinzufügen</h3><input id="p-name" list="player-list" placeholder="Name" required>',
        [{ label: 'Abbrechen', value: '' }, { label: 'Ist dabei', value: 'ok', cls: 'primary' }]);
      const n = $('#p-name').value.trim();
      if (v === 'ok' && n) ev.rsvp[n] = 'yes';
      break;
    }
    case 'play': {
      if (db.live) return toast('Es läuft schon ein Spiel');
      const yes = Object.keys(ev.rsvp).filter(n => ev.rsvp[n] === 'yes').slice(0, 4);
      nameInputs.forEach((s, i) => { $(s).value = yes[i] || ''; });
      return showTab('score');
    }
    case 'del':
      if (!await confirmAsk(`„${esc(ev.title)}“ löschen?`, 'Löschen')) return;
      db.events = db.events.filter(x => x !== ev);
      break;
  }
  save();
  renderEvents();
});

$('#form-paste').addEventListener('submit', e => {
  e.preventDefault();
  if (handleLink($('#paste-link').value)) $('#paste-link').value = '';
  else toast('Kein gültiger Padel-Link');
});

// Verarbeitet Einladungs- (#t=) und Antwortlinks (#r=).
function handleLink(text) {
  const link = L.parseLink(text);
  if (!link) return false;
  const d = link.data;
  showTab('events');
  if (link.kind === 'invite') {
    let ev = db.events.find(x => x.id === d.i);
    if (ev?.mine) {
      toast('Das ist dein eigener Termin');
      return true;
    }
    const data = { title: d.ti || 'Padel', date: d.d || '', time: d.h || '', place: d.p || '', max: d.m || 4, org: d.o || '' };
    if (ev) Object.assign(ev, data);
    else db.events.push(ev = { id: d.i, mine: false, my: null, ...data });
    save();
    renderEvents();
    answerDialog(ev);
  } else {
    const ev = db.events.find(x => x.id === d.i && x.mine);
    if (!ev) {
      toast('Termin nicht gefunden – den Link muss der Organisator öffnen');
      return true;
    }
    if (!STATUS[d.s] || !d.n) return false;
    ev.rsvp[d.n] = d.s;
    save();
    renderEvents();
    toast(`${d.n} ${STATUS[d.s].verb}`);
  }
  return true;
}

function checkHash() {
  if (!location.hash) return false;
  const handled = handleLink(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  return handled;
}
window.addEventListener('hashchange', checkHash);

/* ---------- Installation ---------- */

let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  $('#btn-install').classList.remove('hidden');
});
$('#btn-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#btn-install').classList.add('hidden');
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Neue Version aktiv → einmal neu laden, damit sie sofort zu sehen ist
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || $('#dlg').open) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
}

/* ---------- Start ---------- */

let startTab = 'score';
try { startTab = sessionStorage.getItem('padel-tab') || 'score'; } catch (e) { /* egal */ }
if (db.live) startTab = 'score';
if (!checkHash()) showTab(startTab);
