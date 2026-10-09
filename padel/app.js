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
  ({ score: renderScore, rank: renderRank, tour: renderTour, events: renderEvents })[name]();
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
  save();
  renderScore();
});

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
  save();
  renderScore();
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
  const html = `<img class="dlg-art" src="img/hero-rank.svg" alt="">
    <h3 style="text-align:center">${esc(names[w].join(' & '))} gewinnt!</h3>
    <p class="result-big">${esc(setsText(m.sets))}</p>
    ${canSave ? '' : '<p class="hint">Für die Rangliste vier verschiedene Namen eingeben.</p>'}`;
  const buttons = [{ label: 'Zurück', value: 'back' }, { label: canSave ? 'Nicht speichern' : 'Fertig', value: 'drop' }];
  if (canSave) buttons.push({ label: 'In Rangliste speichern', value: 'save', cls: 'primary' });
  const v = await ask(html, buttons);
  if (v === 'back' || v === '') return;
  if (v === 'save') {
    const ids = raw.map(ensurePlayer);
    db.matches.push({ id: uid(), ts: Date.now(), a: ids.slice(0, 2), b: ids.slice(2), sets: m.sets, win: w, kind: 'match' });
    toast('✅ In der Rangliste gespeichert');
  }
  db.live = null;
  save();
  renderScore();
}

function renderScore() {
  refreshPlayerList();
  const m = db.live;
  $('#score-setup').classList.toggle('hidden', !!m);
  $('#score-live').classList.toggle('hidden', !m);
  keepAwake(!!m && m.winner === null);
  if (!m) return;

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

function renderRank() {
  refreshPlayerList();
  const rank = L.ranking(db.players, db.matches).filter(s => s.played);
  $('#rank-list').innerHTML = rank.length ? rank.map((s, i) => `
    <li>
      <span class="rank-pos ${i < 3 ? 'p' + (i + 1) : ''}">${i + 1}</span>
      <div class="grow">
        <div><b>${esc(s.name)}</b><span class="trend" title="Letzte Spiele">${s.trend.slice(-5).map(r => `<i class="${r}"></i>`).join('')}</span></div>
        <div class="sub">${s.played} Spiel${s.played === 1 ? '' : 'e'} · ${s.won} S / ${s.lost} N${s.drawn ? ` / ${s.drawn} U` : ''} · ${Math.round(100 * s.won / s.played)} %</div>
        <div class="bar"><i style="width:${Math.round(100 * s.won / s.played)}%"></i></div>
      </div>
      <span class="elo">${Math.round(s.elo)}<small>ELO</small></span>
    </li>`).join('') : '<li class="empty">Noch keine Spiele – zähle ein Spiel oder trag ein Ergebnis ein.</li>';

  const recent = [...db.matches].sort((x, y) => y.ts - x.ts).slice(0, 30);
  const kind = { americano: 'Americano · ', mexicano: 'Mexicano · ', match: '' };
  $('#match-list').innerHTML = recent.length ? recent.map(mt => `
    <li>
      <div class="grow match-teams">
        <span class="${mt.win === 0 ? 'w' : ''}">${esc(pname(mt.a[0]))} & ${esc(pname(mt.a[1]))}</span>
        <span class="${mt.win === 1 ? 'w' : ''}">${esc(pname(mt.b[0]))} & ${esc(pname(mt.b[1]))}</span>
        <span class="sub">${kind[mt.kind] || ''}${new Date(mt.ts).toLocaleDateString('de-DE')}</span>
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
  await ask(`<img class="dlg-art" src="img/hero-rank.svg" alt=""><h3>Endstand</h3><div class="podium">${st.slice(0, 3).map((s, i) =>
    `${['🥇', '🥈', '🥉'][i]} ${esc(pname(s.id))} – ${s.pts} Punkte`).join('<br>')}</div>`);
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
  return `🎾 ${ev.title}\n📅 ${fmtDate(ev.date, ev.time)}${ev.place ? `\n📍 ${ev.place}` : ''}\n👥 ${ev.max} Plätze\n\nSag hier zu oder ab:\n${link}`;
}

function replyText(ev, name, s) {
  const link = appUrl() + '#r=' + L.encode({ i: ev.id, n: name, s });
  return `${STATUS[s].label} – ${name}\n🎾 ${ev.title}, ${fmtDate(ev.date, ev.time)}\n\n${ev.org ? ev.org + ', t' : 'T'}ipp auf den Link, dann steht es in deiner Padel-App:\n${link}`;
}

async function eventDialog(ev) {
  const isNew = !ev;
  ev = ev || { title: 'Padel', date: '', time: '19:00', place: '', max: 4 };
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
    </div>`, [{ label: 'Abbrechen', value: '' }, { label: isNew ? 'Erstellen' : 'Speichern', value: 'ok', cls: 'primary' }]);
  if (v !== 'ok') return;
  const me = $('#e-me').value.trim();
  const data = {
    title: $('#e-title').value.trim() || 'Padel', date: $('#e-date').value, time: $('#e-time').value,
    place: $('#e-place').value.trim(), max: Math.max(2, +$('#e-max').value || 4), org: me,
  };
  if (me && db.me && db.me !== me && ev.rsvp?.[db.me]) {
    ev.rsvp[me] = ev.rsvp[db.me];
    delete ev.rsvp[db.me];
  }
  db.me = me;
  if (isNew) {
    ev = { id: uid(), mine: true, rsvp: { [me]: 'yes' }, ...data };
    db.events.push(ev);
  } else Object.assign(ev, data);
  save();
  renderEvents();
  if (isNew && await confirmAsk('Termin erstellt! Jetzt Einladung per WhatsApp & Co. verschicken?', 'Einladen')) shareText(inviteText(ev));
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
        ${yes.length >= 4 ? `<button class="primary" data-ev="${ev.id}" data-act="play">${ico('play')}Spiel starten</button>` : ''}`
      : `<button class="chip" data-ev="${ev.id}" data-act="answer">${ev.my ? STATUS[ev.my].label + ' · ändern' : '↩︎ Antworten'}</button>`;
    return `<li class="event ${ev.date < now ? 'past' : ''}">
      <div class="event-head">
        ${dateBadge(ev.date)}
        <div class="grow">
          <div class="event-title">${esc(ev.title)}</div>
          <div class="sub">${esc(eventLine(ev))}</div>
          ${ev.mine ? '' : `<div class="sub">Einladung von ${esc(ev.org || '?')}</div>`}
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
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- Start ---------- */

let startTab = 'score';
try { startTab = sessionStorage.getItem('padel-tab') || 'score'; } catch (e) { /* egal */ }
if (db.live) startTab = 'score';
if (!checkHash()) showTab(startTab);
