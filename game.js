'use strict';

/* =========================================================
 *  PokéDurak – Durak mit Pokémon-Karten der 1. Generation
 * ========================================================= */

const SUITS = {
  fire:      { name: 'Feuer',   icon: '🔥' },
  water:     { name: 'Wasser',  icon: '💧' },
  grass:     { name: 'Pflanze', icon: '🍃' },
  lightning: { name: 'Elektro', icon: '⚡' },
};
const SUIT_ORDER = ['fire', 'water', 'grass', 'lightning'];
const RANK_LABEL = { 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'B', 12: 'D', 13: 'K', 14: 'A' };
const HP = [40, 50, 60, 60, 70, 80, 90, 100, 120];
const DAMAGE = [10, 20, 20, 30, 40, 50, 60, 80, 120];
const ENERGY = [1, 1, 1, 2, 2, 2, 3, 3, 4];

// Attackennamen je Typ, passend zur Stärke der Karte
const ATTACKS = {
  fire:      ['Glut', 'Kratzer', 'Biss', 'Tritt', 'Feuerodem', 'Flammenwurf', 'Feuerwirbel', 'Hitzewelle', 'Inferno-Ansturm'],
  water:     ['Platscher', 'Aquaknarre', 'Blubber', 'Kopfnuss', 'Aquawelle', 'Eisstrahl', 'Surfer', 'Hydropumpe', 'Hydrokanone'],
  grass:     ['Fadenschuss', 'Giftstachel', 'Rankenhieb', 'Härtner', 'Rasierblatt', 'Doppelnadel', 'Schlitzer', 'Gifthorn', 'Solarstrahl'],
  lightning: ['Funkensprung', 'Donnerschock', 'Magnetbombe', 'Donnerschlag', 'Explosion', 'Donnerwelle', 'Donnerzahn', 'Donnerblitz', 'Donner'],
};
const WEAKNESS = { fire: 'water', water: 'lightning', grass: 'fire', lightning: 'fighting' };
const ENERGY_ICON = { fire: '🔥', water: '💧', grass: '🍃', lightning: '⚡', fighting: '👊', colorless: '★' };
const energy = t => `<i class="en en-${t}">${ENERGY_ICON[t]}</i>`;

// Je Typ 9 Pokémon, vom schwächsten (6) bis zum stärksten (Ass). [Name, Pokédex-Nr.]
const POKEMON = {
  fire:      [['Glumanda', 4], ['Vulpix', 37], ['Fukano', 58], ['Ponita', 77], ['Glutexo', 5],
              ['Magmar', 126], ['Vulnona', 38], ['Arkani', 59], ['Glurak', 6]],
  water:     [['Karpador', 129], ['Schiggy', 7], ['Quapsel', 60], ['Jurob', 86], ['Schillok', 8],
              ['Jugong', 87], ['Quappo', 62], ['Garados', 130], ['Turtok', 9]],
  grass:     [['Raupy', 10], ['Hornliu', 13], ['Bisasam', 1], ['Safcon', 11], ['Bisaknosp', 2],
              ['Bibor', 15], ['Sichlor', 123], ['Nidoking', 34], ['Bisaflor', 3]],
  lightning: [['Voltobal', 100], ['Pikachu', 25], ['Magnetilo', 81], ['Elektek', 125], ['Lektrobal', 101],
              ['Magneton', 82], ['Blitza', 135], ['Raichu', 26], ['Zapdos', 145]],
};

const REMOTE_ART = dex =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
// In der Android-App sind die Bilder eingebaut (img/<Nr>.png), sonst werden sie aus dem Netz geladen
const artUrl = dex => (window.Capacitor ? `img/${dex}.png` : REMOTE_ART(dex));

/* ---------- Spieler, Modus & Einstellungen ---------- */

let ME = 0;                 // eigener Sitzplatz (wird unten angezeigt)
let MODE = 'ai';            // 'ai' | 'host' | 'guest'
const HAND_SIZE = 6;
const MAX_PLAYERS = 6;
const AI_NAMES = ['Rivale', 'Boris', 'Olga', 'Iwan', 'Natascha'];

const $ = sel => document.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadSettings() {
  const def = { opponents: 1, transfer: false, cheat: false };
  try { return { ...def, ...JSON.parse(localStorage.getItem('pokedurak-settings') || '{}') }; } catch { return def; }
}
function saveSettings() {
  try { localStorage.setItem('pokedurak-settings', JSON.stringify(settings)); } catch { /* egal */ }
}
let settings = loadSettings();

/* ---------- Kartendeck ---------- */

const ALL_CARDS = [];
for (const suit of SUIT_ORDER) {
  POKEMON[suit].forEach(([name, dex], i) => {
    ALL_CARDS.push({ id: `${suit}-${6 + i}`, suit, rank: 6 + i, name, dex, hp: HP[i] });
  });
}
const CARD_BY_ID = new Map(ALL_CARDS.map(c => [c.id, c]));

// Bilder vorladen, damit sie beim Ausspielen schon da sind
const imagesReady = Promise.all(ALL_CARDS.map(c => new Promise(done => {
  const img = new Image();
  img.onload = img.onerror = done;
  img.src = artUrl(c.dex);
})));

/* ---------- Spielzustand ---------- */

const S = {
  players: [],     // { name, kind: 'human'|'ai'|'remote', hand: [], out: false, place: 0 }
  deck: [],        // deck[0] ist die offene Trumpfkarte (unten), gezogen wird vom Ende
  trump: null,
  table: [],       // [{ atk, def, atkBy, atkCheat, defCheat, seen }]
  discard: [],
  attacker: 0,     // Hauptangreifer
  defender: 1,
  turn: 0,         // wer beim Angreifen/Nachlegen gerade dran ist
  passed: [],      // wer seit der letzten Änderung „Dawai“ gesagt hat
  phase: 'idle',   // 'attack' | 'defend' | 'throwin' (Verteidiger nimmt, andere dürfen nachlegen)
  firstRound: true,
  over: false,
  durak: null,     // Sitz des Verlierers (null = unentschieden)
  finished: 0,
  rules: { transfer: false, cheat: false },
  ver: 0,          // wird bei jeder Änderung erhöht
};

const N = () => S.players.length;
const P = seat => S.players[seat];
const nameOf = seat => (P(seat) ? P(seat).name : '?');
const isTrump = c => c.suit === S.trump;
const value = c => c.rank + (isTrump(c) ? 20 : 0);
const byValue = (a, b) => value(a) - value(b);

function beats(atk, def) {
  if (def.suit === atk.suit) return def.rank > atk.rank;
  return isTrump(def) && !isTrump(atk);
}

function nextActive(seat) {
  for (let i = 1; i <= N(); i++) {
    const s = (seat + i) % N();
    if (!P(s).out) return s;
  }
  return seat;
}
const activeSeats = () => S.players.map((p, i) => i).filter(i => !P(i).out);

// Reihenfolge der Angreifer: Hauptangreifer, dann alle anderen ab dem Verteidiger im Uhrzeigersinn
function attackOrder() {
  const order = [S.attacker];
  for (let i = 1; i < N(); i++) {
    const s = (S.defender + i) % N();
    if (s !== S.attacker && s !== S.defender && !P(s).out) order.push(s);
  }
  return order;
}

function tableRanks() {
  const r = new Set();
  for (const p of S.table) { r.add(p.atk.rank); if (p.def) r.add(p.def.rank); }
  return r;
}
const openCount = () => S.table.filter(p => !p.def).length;
const maxAttacks = () => (S.firstRound ? 5 : 6);
const uncovered = () => S.table.filter(p => !p.def);

// Ist auf dem Tisch überhaupt noch Platz für eine weitere Angriffskarte?
function roomToAdd() {
  if (S.table.length === 0) return true;
  if (S.table.length >= maxAttacks()) return false;
  return openCount() < P(S.defender).hand.length;
}

// Regelgerecht nachlegen/angreifen?
function canAdd(card) {
  if (!roomToAdd()) return false;
  if (S.table.length === 0) return true;
  return tableRanks().has(card.rank);
}

// Schieben (Perevodnoy): gleicher Wert wie alle Angriffskarten, noch nichts geschlagen
function canTransfer(card, seat = S.defender) {
  if (!S.rules.transfer || S.phase !== 'defend' || seat !== S.defender) return false;
  if (!S.table.length || S.table.some(p => p.def)) return false;
  if (!S.table.every(p => p.atk.rank === card.rank)) return false;
  if (S.table.length + 1 > maxAttacks()) return false;
  const next = nextActive(S.defender);
  return P(next).hand.length >= S.table.length + 1;
}

function beatTarget(card) {
  return uncovered().find(p => beats(p.atk, card)) || null;
}

function actor() {
  if (S.phase === 'defend') return S.defender;
  if (S.phase === 'attack' || S.phase === 'throwin') return S.turn;
  return -1;
}

// Kann dieser Spieler mit dieser Karte gerade einen regelgerechten Zug machen?
function isPlayable(card, seat = ME) {
  if (seat !== actor()) return false;
  if (S.phase === 'defend') return !!beatTarget(card) || canTransfer(card, seat);
  return canAdd(card);
}

// Im Schummel-Modus darf man auch regelwidrige Karten legen
function canCheat(card, seat = ME) {
  if (!S.rules.cheat || seat !== actor() || isPlayable(card, seat)) return false;
  if (S.phase === 'defend') return uncovered().length > 0;
  return S.table.length > 0 && roomToAdd();
}

const cheatsOnTable = catcher => S.table.some(p =>
  (p.atkCheat && p.atkBy !== catcher) || (p.defCheat && S.defender !== catcher));

function removeFrom(arr, card) {
  const i = arr.indexOf(card);
  if (i >= 0) arr.splice(i, 1);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Karten-Elemente ---------- */

let elCache = new Map();

function getCardEl(card) {
  let el = elCache.get(card.id);
  if (el) return el;
  el = document.createElement('div');
  el.dataset.id = card.id;
  const s = SUITS[card.suit];
  const rk = RANK_LABEL[card.rank];
  el.innerHTML =
    `<div class="inner">
      <div class="front"><div class="face">
        <div class="art" data-icon="${s.icon}"><img alt="" draggable="false"></div>
        <div class="rank">${rk}</div>
        <div class="type-badge">${energy(card.suit)}</div>
        <div class="name">${isTrump(card) ? '★ ' : ''}${card.name}</div>
      </div></div>
      <div class="back"><div class="ball"></div></div>
    </div>`;
  const art = el.querySelector('.art');
  const img = el.querySelector('img');
  // Bei schlechter Verbindung bis zu 3× neu laden, sonst Typ-Symbol zeigen
  let tries = 0;
  img.onload = () => art.classList.remove('noimg');
  img.onerror = () => {
    art.classList.add('noimg');
    if (++tries <= 3) setTimeout(() => { img.src = REMOTE_ART(card.dex) + '?r=' + tries; }, 1500 * tries);
  };
  img.src = artUrl(card.dex);
  el.addEventListener('click', () => onCardTap(card, el));
  el.addEventListener('pointerdown', e => onCardDown(card, el, e));
  elCache.set(card.id, el);
  return el;
}

function prep(card, cw, { down = false, rot = 0, extra = '' } = {}) {
  const el = getCardEl(card);
  el.className = `card s-${card.suit}${isTrump(card) ? ' trump' : ''}${down ? ' down' : ''}${extra ? ' ' + extra : ''}`;
  el.style.cssText = '';
  el.style.setProperty('--cw', cw + 'px');
  setRot(el, rot);
  return el;
}

function setRot(el, rot) {
  el.dataset.rot = rot;
  el.style.setProperty('--rot', rot);
}

function backEl(cw, cls = '') {
  const el = document.createElement('div');
  el.className = 'card down ' + cls;
  el.style.setProperty('--cw', cw + 'px');
  el.innerHTML = '<div class="inner"><div class="back"><div class="ball"></div></div></div>';
  return el;
}


/* ---------- Darstellung ---------- */

let sizes = { hand: 80, table: 58, opp: 44 };
let animating = 0;     // laufende Kartenanimationen
let thinking = -1;     // Sitz des Computers, der gerade überlegt
let waitingForHost = false;

function computeSizes() {
  const app = $('#app');
  const vw = Math.min(window.innerWidth, 560);
  const vh = window.innerHeight;
  sizes = {
    hand: Math.round(Math.min(vw * 0.21, vh * 0.125, 96)),
    table: Math.round(Math.min(vw * 0.165, vh * 0.095, 76)),
    opp: Math.round(Math.min(vw * 0.12, vh * 0.065, 56)),
  };
  app.style.setProperty('--hcw', sizes.hand + 'px');
  app.style.setProperty('--tcw', sizes.table + 'px');
  app.style.setProperty('--ocw', sizes.opp + 'px');
}

const opponentsOf = me => {
  const list = [];
  for (let i = 1; i < N(); i++) list.push((me + i) % N());
  return list;
};

function roleIcon(seat) {
  if (P(seat).out) return '🏁';
  if (S.phase === 'idle') return '';
  if (seat === S.defender) return '🛡️';
  if (seat === S.attacker) return '⚔️';
  return '';
}

function renderOpponents(humanTurn) {
  const box = $('#opp-hand');
  const opps = opponentsOf(ME);
  // Bestehende Plätze wiederverwenden, damit die Anzahl stimmt
  while (box.children.length > opps.length) box.lastChild.remove();
  while (box.children.length < opps.length) {
    const seatEl = document.createElement('div');
    seatEl.className = 'opp-seat';
    seatEl.innerHTML = '<div class="opp-fan"></div><div class="opp-tag"><span class="opp-role"></span><span class="opp-nm"></span> <span class="opp-cnt"></span></div>';
    box.appendChild(seatEl);
  }
  const factor = opps.length === 1 ? 1 : opps.length === 2 ? 0.85 : opps.length === 3 ? 0.72 : 0.6;
  const cw = Math.round(sizes.opp * factor);
  const act = actor();
  opps.forEach((seat, i) => {
    const seatEl = box.children[i];
    const p = P(seat);
    seatEl.dataset.seat = seat;
    seatEl.classList.toggle('active', !S.over && seat === act);
    seatEl.classList.toggle('out', p.out);
    seatEl.querySelector('.opp-nm').textContent = p.name;
    seatEl.querySelector('.opp-cnt').textContent = p.out ? `Platz ${p.place}` : p.hand.length;
    seatEl.querySelector('.opp-role').textContent = roleIcon(seat) + (thinking === seat ? '💭' : '');
    const fan = seatEl.querySelector('.opp-fan');
    const els = p.hand.map(c => prep(c, cw, { down: true }));
    fan.replaceChildren(...els);
    layoutFan(fan, els, cw, true);
  });
  $('#opp').classList.toggle('many', opps.length > 1);
  void humanTurn;
}

function render() {
  const humanTurn = !animating && !waitingForHost && !S.over && S.phase !== 'idle' && actor() === ME;

  // Trumpf-Anzeige
  $('#trump-info').innerHTML = S.trump
    ? `<span>Trumpf:</span><span class="ti">${SUITS[S.trump].icon}</span><span>${SUITS[S.trump].name}</span>`
    : '';

  if (N()) renderOpponents(humanTurn);

  // Stapel + Trumpf
  const deck = $('#deck');
  const deckChildren = [];
  const tcw = sizes.table;
  if (S.deck.length > 0) {
    const t = prep(S.deck[0], tcw, { rot: 90 });
    t.style.left = (tcw * 0.5) + 'px';
    t.style.top = '0px';
    deckChildren.push(t);
  }
  if (S.deck.length > 1) {
    const st = backEl(tcw, 'deck-stack');
    st.id = 'deck-stack';
    deckChildren.push(st);
  }
  if (S.deck.length === 0 && S.trump) {
    const e = document.createElement('div');
    e.className = 'deck-empty';
    e.textContent = SUITS[S.trump].icon;
    deckChildren.push(e);
  }
  if (S.deck.length > 0) {
    const cnt = document.createElement('div');
    cnt.className = 'count';
    cnt.textContent = S.deck.length;
    deckChildren.push(cnt);
  }
  deck.replaceChildren(...deckChildren);

  // Ablagestapel
  const dis = $('#discard');
  const disChildren = [];
  const shown = Math.min(S.discard.length, 5);
  for (let i = 0; i < shown; i++) {
    const b = backEl(tcw);
    b.style.setProperty('--rot', ((i * 37) % 23) - 11);
    disChildren.push(b);
  }
  if (S.discard.length) {
    const cnt = document.createElement('div');
    cnt.className = 'count';
    cnt.textContent = S.discard.length;
    disChildren.push(cnt);
  }
  dis.replaceChildren(...disChildren);

  // Tisch
  const table = $('#table');
  const humanDefending = humanTurn && S.phase === 'defend';
  const sel = humanTurn ? selectedCard() : null;
  if (sel && !P(ME).hand.includes(sel)) selectedId = null;
  if (!humanTurn && !drag) selectedId = null;
  const targets = new Map(dropTargets(selectedCard()).map(t => [t.key, t]));
  const pairs = S.table.map((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'pair';
    const tg = targets.get('def:' + i);
    if (tg) { wrap.dataset.drop = 'def:' + i; wrap.classList.add('drop', tg.legal ? 'legal' : 'cheat'); }
    const a = prep(p.atk, tcw, { rot: ((i * 5) % 7) - 3, extra: humanDefending && !p.def && !selectedId ? 'target' : '' });
    wrap.appendChild(a);
    if (p.def) {
      const d = prep(p.def, tcw, { rot: 6 + ((i * 3) % 5), extra: 'def' });
      wrap.appendChild(d);
    }
    return wrap;
  });
  // Freie Felder zum Ablegen bzw. Schieben
  for (const key of ['add', 'transfer']) {
    const tg = targets.get(key);
    if (!tg) continue;
    const slot = document.createElement('div');
    slot.className = `pair slot drop ${tg.legal ? 'legal' : 'cheat'}`;
    slot.dataset.drop = key;
    slot.innerHTML = key === 'add' ? '<span>＋<br>hier legen</span>' : '<span>➡️<br>schieben</span>';
    pairs.push(slot);
  }
  table.replaceChildren(...pairs);

  // Eigene Hand
  const hand = $('#hand');
  const mine = P(ME) ? P(ME).hand : [];
  const sorted = sortHand(mine);
  // Bei vielen Karten etwas kleiner, damit jede Karte antippbar bleibt
  const hcw = Math.round(sizes.hand * (sorted.length > 12 ? 0.8 : sorted.length > 8 ? 0.9 : 1));
  const handEls = sorted.map(c => {
    let extra = '';
    if (humanTurn) extra = isPlayable(c) ? 'playable' : canCheat(c) ? 'cheatable' : 'dim';
    if (c.id === selectedId) extra += drag && drag.ghost ? ' selected dragging' : ' selected';
    return prep(c, hcw, { extra });
  });
  hand.replaceChildren(...handEls);
  layoutFan(hand, handEls, hcw, false);

  renderControls(humanTurn);
  syncState();
}

function renderControls(humanTurn) {
  const status = $('#status');
  const btn = $('#action');
  btn.className = 'hidden';
  btn.dataset.act = '';

  // Erwischt-Knopf (Schummel-Modus)
  const catchBtn = $('#btn-catch');
  const canCatch = S.rules.cheat && !S.over && S.phase !== 'idle' && S.table.length > 0 && P(ME) && !P(ME).out;
  catchBtn.classList.toggle('hidden', !canCatch);

  if (S.over || S.phase === 'idle' || !N()) { status.textContent = ''; return; }
  const me = P(ME);
  if (me.out) {
    status.textContent = `🏁 Du bist raus – Platz ${me.place}. Die anderen spielen weiter…`;
    return;
  }

  if (actor() !== ME) {
    const a = actor();
    if (a >= 0) {
      const n = nameOf(a);
      status.textContent = S.phase === 'defend' ? `${n} verteidigt…`
        : S.phase === 'throwin' ? `${n} legt ${nameOf(S.defender)} noch Karten dazu…`
        : S.table.length === 0 ? `${n} greift an…` : `${n} darf nachlegen…`;
    }
    return;
  }

  const trans = S.rules.transfer && me.hand.some(c => canTransfer(c));
  if (S.phase === 'defend') {
    const canBeat = me.hand.some(c => beatTarget(c));
    status.textContent = canBeat
      ? (selectedId ? 'Tippe die Karte an, die du schlagen willst – oder zieh deine Karte drauf.'
        : `Verteidige dich! Wähle eine Karte aus deiner Hand${trans ? ' (oder schieb weiter)' : ''} – oder sag Bljat.`)
      : trans ? 'Du kannst nicht schlagen, aber schieben – oder sag Bljat.'
      : 'Du kannst nicht schlagen – sag Bljat und nimm die Karten auf.';
    btn.className = 'take';
    btn.textContent = 'Bljat';
    btn.dataset.act = 'take';
  } else if (S.phase === 'attack') {
    if (S.table.length === 0) {
      status.textContent = selectedId ? 'Tippe auf „hier legen“ – oder zieh die Karte auf den Tisch.'
        : `Du greifst ${nameOf(S.defender)} an – wähle eine Karte.`;
    } else {
      status.textContent = S.turn === S.attacker
        ? 'Alles geschlagen. Lege eine passende Karte nach oder sag Dawai.'
        : `Du darfst bei ${nameOf(S.defender)} nachlegen – oder sag Dawai.`;
      btn.className = '';
      btn.textContent = 'Dawai';
      btn.dataset.act = 'pass';
    }
  } else if (S.phase === 'throwin') {
    status.textContent = `${nameOf(S.defender)} nimmt auf – du darfst noch passende Karten dazugeben.`;
    btn.className = '';
    btn.textContent = 'Fertig';
    btn.dataset.act = 'pass';
  }
  if (!humanTurn) { btn.className = 'hidden'; btn.dataset.act = ''; }
}

let toastTimer = null;
function toast(text, ms = 1100) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function sortHand(hand) {
  return [...hand].sort((a, b) =>
    (isTrump(a) - isTrump(b)) ||
    (SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit)) ||
    (a.rank - b.rank));
}

// Karten fächerförmig in einem Container anordnen
function layoutFan(container, els, cw, top) {
  const W = container.clientWidth;
  const n = els.length;
  const maxStep = top ? cw * 0.45 : cw * 0.72;
  const step = n > 1 ? Math.min(maxStep, (W - cw * 1.3) / (n - 1)) : 0;
  const total = step * (n - 1) + cw;
  const start = (W - total) / 2;
  const mid = (n - 1) / 2;
  const spread = Math.min(4, 26 / Math.max(n, 1));
  els.forEach((el, i) => {
    const d = i - mid;
    const arc = Math.min(d * d * (top ? 0.6 : 0.9), cw * 0.3);
    el.style.left = (start + i * step) + 'px';
    el.style.top = top ? (2 - arc) + 'px' : (18 + arc) + 'px';
    el.style.zIndex = i + 1;
    setRot(el, +((top ? -d : d) * spread).toFixed(2));
  });
}


/* ---------- Animationen ---------- */

function box(el) {
  const r = el.getBoundingClientRect();
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    w: el.offsetWidth,
    h: el.offsetHeight,
    rot: +(el.dataset.rot || 0),
    down: el.classList.contains('down'),
  };
}

function snapshot() {
  const m = new Map();
  document.querySelectorAll('#app [data-id]').forEach(el => m.set(el.dataset.id, box(el)));
  return m;
}

// Klon im Overlay von "from" nach "to" fliegen lassen
function fly(template, from, to, { delay = 0, dur = 480, realEl = null } = {}) {
  return new Promise(resolve => {
    const c = template.cloneNode(true);
    c.removeAttribute('data-id');
    c.classList.remove('playable', 'dim', 'target', 'shake');
    c.classList.add('flying');
    c.classList.toggle('down', from.down);
    c.style.cssText = '';
    c.style.setProperty('--cw', to.w + 'px');
    Object.assign(c.style, {
      left: (to.cx - to.w / 2) + 'px',
      top: (to.cy - to.h / 2) + 'px',
      width: to.w + 'px',
      height: to.h + 'px',
      zIndex: 10 + Math.round(delay / 10),
    });
    $('#fx').appendChild(c);
    const s = from.w / to.w;
    const anim = c.animate([
      { transform: `translate(${from.cx - to.cx}px, ${from.cy - to.cy}px) rotate(${from.rot}deg) scale(${s})` },
      { transform: `translate(0px, 0px) rotate(${to.rot}deg) scale(1.12)`, offset: 0.7 },
      { transform: `translate(0px, 0px) rotate(${to.rot}deg) scale(1)` },
    ], { duration: dur, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
    if (from.down !== to.down) {
      setTimeout(() => c.classList.toggle('down', to.down), delay + dur * 0.1);
    }
    const finish = () => {
      if (realEl) realEl.style.visibility = '';
      c.remove();
      resolve();
    };
    anim.onfinish = finish;
    anim.oncancel = finish;
  });
}

// Zustand ändern und alle Kartenbewegungen automatisch animieren (FLIP-Prinzip).
// mutate() darf eine Liste neu gezogener Karten-IDs zurückgeben (für gestaffeltes Austeilen).
async function animateChange(mutate, { stagger = 90, dur = 480 } = {}) {
  animating++;
  try {
    await animateInner(mutate, stagger, dur);
  } finally {
    animating--;
  }
}

async function animateInner(mutate, stagger, dur) {
  const before = snapshot();
  const stack = $('#deck-stack') || $('#deck');
  const deckBox = { ...box(stack), rot: 0, down: true };
  const order = mutate() || [];
  S.ver++;
  pendingOrder = order;
  render();

  const jobs = [];
  const seen = new Set();
  document.querySelectorAll('#app [data-id]').forEach(el => {
    const id = el.dataset.id;
    seen.add(id);
    const to = box(el);
    let from = before.get(id);
    let delay = 0;
    if (!from) {
      from = { ...deckBox, w: deckBox.w || to.w, h: deckBox.h || to.h };
      delay = Math.max(0, order.indexOf(id)) * stagger;
    }
    const moved = Math.hypot(from.cx - to.cx, from.cy - to.cy) > 1.5 ||
      Math.abs(from.rot - to.rot) > 0.5 || from.down !== to.down || Math.abs(from.w - to.w) > 1;
    if (!moved) return;
    el.style.visibility = 'hidden';
    jobs.push(fly(el, from, to, { delay, dur, realEl: el }));
  });

  // Karten, die verschwunden sind, wandern auf den Ablagestapel
  const disBox = box($('#discard'));
  let k = 0;
  for (const [id, from] of before) {
    if (seen.has(id)) continue;
    const tpl = getCardEl(CARD_BY_ID.get(id));
    const to = { ...disBox, w: disBox.w, h: disBox.h, rot: ((k * 53) % 30) - 15, down: true };
    jobs.push(fly(tpl, from, to, { delay: k * 60, dur: 560 }));
    k++;
  }
  await Promise.all(jobs);
}


/* ---------- Spielablauf (läuft beim Computer-Spiel und beim Gastgeber) ---------- */

const isAISeat = seat => P(seat) && P(seat).kind === 'ai';
const isRemoteSeat = seat => P(seat) && P(seat).kind === 'remote';

// Alle Zustandsänderungen laufen nacheinander, nie gleichzeitig
let lockChain = Promise.resolve();
function exclusive(fn) {
  const p = lockChain.then(fn);
  lockChain = p.catch(err => console.error(err));
  return p;
}

// Meldung aus Sicht von „seat“ ('{n}' = Name von seat). Als Gastgeber auch an alle Gäste.
function say(seat, mine, theirs = mine, ms, sfx) {
  showSay(seat, mine, theirs, ms, sfx);
  if (MODE === 'host') broadcast({ t: 'say', seat, mine, theirs, ms, sfx });
}
function showSay(seat, mine, theirs, ms, sfx) {
  const text = seat === null || seat === ME ? mine : theirs;
  toast(text.replace('{n}', seat === null ? '' : nameOf(seat)), ms);
  if (sfx && Sfx[sfx]) Sfx[sfx]();
}

async function newGame(players) {
  if (MODE === 'guest') { send({ t: 'again' }); return; }
  animating++;
  // Kurz auf die Pokémon-Bilder warten (höchstens 4 s, danach geht's auch ohne)
  await Promise.race([imagesReady, sleep(4000)]);
  hideScreens();
  elCache = new Map();
  if (players) S.players = players;
  for (const p of S.players) { p.hand = []; p.out = false; p.place = 0; }
  S.rules = { transfer: !!settings.transfer, cheat: !!settings.cheat };
  S.deck = shuffle([...ALL_CARDS]);
  S.trump = S.deck[0].suit;
  S.table = [];
  S.discard = [];
  S.phase = 'idle';
  S.firstRound = true;
  S.over = false;
  S.durak = null;
  S.finished = 0;
  S.passed = [];
  if (MODE === 'host') { lastSent = ''; broadcastEach(seat => ({ t: 'new', you: seat })); }
  computeSizes();
  render();
  animating--;
  await sleep(250);
  say(null, `Trumpf: ${SUITS[S.trump].icon} ${SUITS[S.trump].name}`, undefined, 1300);
  await sleep(700);

  await exclusive(() => animateChange(() => {
    const ids = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      for (const p of S.players) {
        const c = S.deck.pop();
        p.hand.push(c);
        ids.push(c.id);
      }
    }
    return ids;
  }, { stagger: Math.max(35, 90 - N() * 10) }));

  // Wer den niedrigsten Trumpf hat, beginnt
  let first = Math.floor(Math.random() * N()), low = 99;
  S.players.forEach((p, i) => {
    for (const c of p.hand) if (isTrump(c) && c.rank < low) { low = c.rank; first = i; }
  });
  await exclusive(() => animateChange(() => {
    S.attacker = first;
    S.defender = nextActive(first);
    S.turn = first;
    S.phase = 'attack';
  }));
  await sleep(200);
  say(first, 'Du beginnst!', '{n} beginnt!', 1200);
  await sleep(900);
  drive();
}

/* ----- Der Antrieb: lässt Computer ziehen und wartet sonst auf Menschen ----- */

let driving = false, kick = false;

async function drive() {
  if (MODE === 'guest') return;
  if (driving) { kick = true; return; }
  driving = true;
  try {
    for (;;) {
      kick = false;
      if (S.over || S.phase === 'idle') break;
      const more = await step();
      if (!more && !kick) break;
    }
  } finally {
    driving = false;
    thinking = -1;
    render();
  }
}

async function step() {
  // Computer-Spieler versuchen, Schummeleien zu erwischen
  if (S.rules.cheat && await aiCatchCheck()) return true;

  const who = actor();
  if (who < 0) return false;

  if (isAISeat(who)) {
    const v = S.ver;
    thinking = who;
    render();
    const quick = S.phase !== 'defend' && S.table.length > 0 && !P(who).hand.some(canAdd);
    await sleep(quick ? 300 : S.phase === 'throwin' ? 550 : 750);
    thinking = -1;
    if (S.ver !== v || S.over) return true;
    await exclusive(() => (S.ver === v ? aiTurn(who) : null));
    return true;
  }

  // Menschen entscheiden selbst – nur wer gar keine Karten mehr hat, wird automatisch übersprungen
  if ((S.phase === 'attack' || S.phase === 'throwin') && S.table.length > 0) {
    const hand = P(who).hand;
    if (hand.length === 0) {
      const v = S.ver;
      render();
      await sleep(150);
      if (S.ver !== v) return true;
      await exclusive(() => (S.ver === v ? passTurn(who, true) : null));
      return true;
    }
  }

  render();
  return false;   // warten auf den Menschen (lokal oder Gast)
}

/* ----- Züge ----- */

async function addCard(seat, card) {
  const cheat = !canAdd(card);
  await animateChange(() => {
    removeFrom(P(seat).hand, card);
    S.table.push({ atk: card, def: null, atkBy: seat, atkCheat: cheat, defCheat: false });
    S.passed = [];
    if (S.phase === 'attack') S.phase = 'defend';
  });
}

async function defendCard(card, target = beatTarget(card) || uncovered()[0]) {
  const cheat = !beats(target.atk, card);
  await animateChange(() => {
    removeFrom(P(S.defender).hand, card);
    target.def = card;
    target.defCheat = cheat;
    if (!uncovered().length) {
      S.phase = 'attack';
      S.turn = S.attacker;
      S.passed = [];
    }
  });
}

async function transferCard(card) {
  const from = S.defender;
  await animateChange(() => {
    removeFrom(P(from).hand, card);
    S.table.push({ atk: card, def: null, atkBy: from, atkCheat: false, defCheat: false });
    S.attacker = from;
    S.defender = nextActive(from);
    S.turn = from;
    S.passed = [];
  });
  say(from, 'Geschoben! ➡️', '{n} schiebt weiter! ➡️', 1000);
}

// „Dawai“ bzw. „Fertig“: nichts mehr nachlegen
async function passTurn(seat, auto = false) {
  const order = attackOrder();
  const passed = [...new Set([...S.passed, seat])];
  const next = order.find(s => !passed.includes(s) && P(s).hand.length > 0 &&
    order.indexOf(s) > order.indexOf(seat)) ??
    order.find(s => !passed.includes(s) && P(s).hand.length > 0);
  if (next === undefined) {
    if (S.phase === 'throwin') return endRound(true);
    say(null, 'Dawai!');
    return endRound(false);
  }
  await animateChange(() => { S.passed = passed; S.turn = next; });
  void auto;
}

async function takeCards(seat) {
  await animateChange(() => {
    S.phase = 'throwin';
    S.turn = S.attacker;
    S.passed = [];
  });
  say(seat, 'Bljat! Du nimmst auf', '{n}: Bljat!', undefined, 'bljat');
  await sleep(300);
}

async function endRound(taken) {
  const def = S.defender;
  const order = attackOrder();
  await animateChange(() => {
    const cards = S.table.flatMap(p => (p.def ? [p.atk, p.def] : [p.atk]));
    if (taken) P(def).hand.push(...cards);
    else S.discard.push(...cards);
    S.table = [];
    S.phase = 'idle';
  }, { dur: 520 });

  await sleep(150);
  await animateChange(() => {
    const ids = [];
    for (const s of [...order, def]) {
      while (P(s).hand.length < HAND_SIZE && S.deck.length) {
        const c = S.deck.pop();
        P(s).hand.push(c);
        ids.push(c.id);
      }
    }
    return ids;
  });
  S.firstRound = false;

  // Wer bei leerem Stapel keine Karten mehr hat, ist raus
  const newlyOut = [];
  if (S.deck.length === 0) {
    for (const s of activeSeats()) {
      if (P(s).hand.length === 0) { P(s).out = true; P(s).place = ++S.finished; newlyOut.push(s); }
    }
  }
  for (const s of newlyOut) {
    if (activeSeats().length > 1 || N() > 2) say(s, '🏁 Du bist raus!', '🏁 {n} ist raus!', 1000);
    if (newlyOut.length > 1) await sleep(700);
  }
  if (checkGameOver()) return;

  await animateChange(() => {
    let next = taken ? nextActive(def) : def;
    if (P(next).out) next = nextActive(next);
    S.attacker = next;
    S.defender = nextActive(next);
    S.turn = next;
    S.passed = [];
    S.phase = 'attack';
  });
  await sleep(150);
  say(S.attacker, 'Dein Angriff!', '{n} greift an!', 900);
  await sleep(400);
}

function checkGameOver() {
  const left = activeSeats();
  if (left.length > 1) return false;
  S.over = true;
  S.phase = 'idle';
  S.durak = left.length === 1 ? left[0] : null;
  if (S.durak !== null) { P(S.durak).place = N(); }
  render();
  if (MODE === 'host') broadcast({ t: 'over', durak: S.durak });
  finishGame(S.durak);
  return true;
}

function finishGame(durak) {
  const result = durak === null ? 'draw' : durak === ME ? 'lose' : 'win';
  saveStat(result);
  setTimeout(() => showGameOver(result, durak), 700);
}

/* ----- Schummeln & Erwischen ----- */

async function catchCheat(catcher) {
  if (!S.rules.cheat || S.over || S.phase === 'idle' || !S.table.length) return false;
  const cheaters = new Set();
  const table = S.table;
  for (const p of table) {
    if (p.atkCheat && p.atkBy !== catcher) cheaters.add(p.atkBy);
    if (p.defCheat && S.defender !== catcher) cheaters.add(S.defender);
  }
  const penalty = seat => {
    const src = S.discard.length ? S.discard : S.deck.length > 1 ? S.deck : null;
    if (!src) return null;
    const i = src === S.discard ? Math.floor(Math.random() * src.length) : src.length - 1;
    const c = src.splice(i, 1)[0];
    P(seat).hand.push(c);
    return c;
  };

  if (!cheaters.size) {
    await animateChange(() => { penalty(catcher); });
    say(catcher, '🕵️ Falscher Verdacht! Strafkarte für dich', '🕵️ {n} lag falsch – Strafkarte!', 1400);
    return true;
  }

  const wasThrowin = S.phase === 'throwin';
  await animateChange(() => {
    const keep = [];
    for (const p of S.table) {
      if (p.atkCheat && cheaters.has(p.atkBy)) {
        P(p.atkBy).hand.push(p.atk);
        if (p.def) P(S.defender).hand.push(p.def);
        continue;
      }
      if (p.defCheat && cheaters.has(S.defender)) {
        P(S.defender).hand.push(p.def);
        p.def = null;
        p.defCheat = false;
      }
      keep.push(p);
    }
    S.table = keep;
    for (const s of cheaters) penalty(s);
    S.passed = [];
    if (!S.table.length) { S.phase = 'attack'; S.turn = S.attacker; }
    else if (wasThrowin) { S.turn = S.attacker; }
    else if (uncovered().length) S.phase = 'defend';
    else { S.phase = 'attack'; S.turn = S.attacker; }
  });
  const names = [...cheaters];
  if (names.length === 1) {
    say(names[0], '🚨 Erwischt! Du hast geschummelt – Karte zurück + Strafkarte',
      `🚨 Erwischt! {n} hat geschummelt`, 1600);
  } else {
    say(null, '🚨 Erwischt! Mehrere haben geschummelt', undefined, 1600);
  }
  Sfx.bljat();
  return true;
}

// Computer schauen genau hin: jede neue Schummelkarte hat eine Chance, aufzufliegen
async function aiCatchCheck() {
  for (const p of S.table) {
    const cheats = [];
    if (p.atkCheat) cheats.push(p.atkBy);
    if (p.defCheat) cheats.push(S.defender);
    for (const cheater of cheats) {
      p.seen = p.seen || {};
      for (const s of activeSeats()) {
        if (s === cheater || !isAISeat(s) || p.seen[s + ':' + cheater]) continue;
        p.seen[s + ':' + cheater] = true;
        if (Math.random() < 0.35) {
          await sleep(500);
          const v = S.ver;
          await exclusive(() => (S.ver === v ? catchCheat(s) : null));
          return true;
        }
      }
    }
  }
  return false;
}

/* ----- Eingaben des eigenen Spielers ----- */

// Führt einen Zug für einen Sitz aus (lokal oder vom Gast). Gibt false zurück, wenn er ungültig ist.
async function applyMove(seat, move) {
  if (S.over || S.phase === 'idle') return false;
  if (move.t === 'catch') return catchCheat(seat);
  if (actor() !== seat) return false;
  const hand = P(seat).hand;

  if (move.t === 'card') {
    const card = CARD_BY_ID.get(move.id);
    if (!card || !hand.includes(card)) return false;
    if (S.phase === 'defend') {
      if (move.transfer) {
        if (!canTransfer(card, seat)) return false;
        await transferCard(card);
        return true;
      }
      // Ziel: die angetippte Angriffskarte (oder – bei alten Versionen – die erste passende)
      const target = Number.isInteger(move.target) ? S.table[move.target] : beatTarget(card) || uncovered()[0];
      if (!target || target.def) return false;
      if (!beats(target.atk, card) && !S.rules.cheat) return false;
      await defendCard(card, target);
    } else {
      if (!canAdd(card) && !canCheat(card, seat)) return false;
      await addCard(seat, card);
    }
    return true;
  }
  if (move.t === 'act') {
    if (move.act === 'take' && S.phase === 'defend') { await takeCards(seat); return true; }
    if (move.act === 'pass' && (S.phase === 'attack' || S.phase === 'throwin') && S.table.length) {
      await passTurn(seat);
      return true;
    }
  }
  return false;
}

async function localMove(move) {
  if (MODE === 'guest') {
    waitingForHost = true;
    render();
    send(move);
    return;
  }
  const ok = await exclusive(() => applyMove(ME, move));
  drive();
  return ok;
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  if (navigator.vibrate) navigator.vibrate(30);
}

/* ----- Karte auswählen und selbst ablegen (antippen oder ziehen) ----- */

let selectedId = null;    // ausgewählte Handkarte
let drag = null;          // laufendes Ziehen mit dem Finger
let suppressClick = false;

const selectedCard = () => (selectedId ? CARD_BY_ID.get(selectedId) : null);

function canUseCard(card) {
  return isPlayable(card) || canCheat(card);
}

function myInputAllowed() {
  return !animating && !waitingForHost && !S.over && P(ME) && actor() === ME;
}

function onCardTap(card, el) {
  if (suppressClick) { suppressClick = false; return; }
  if (!myInputAllowed() || !P(ME).hand.includes(card)) return;
  if (!canUseCard(card)) return shake(el);
  selectedId = selectedId === card.id ? null : card.id;
  render();
}

// Wohin darf die ausgewählte Karte? → Liste von Zielen
function dropTargets(card) {
  const t = [];
  if (!card || !myInputAllowed()) return t;
  if (S.phase === 'defend') {
    S.table.forEach((p, i) => {
      if (p.def) return;
      if (beats(p.atk, card)) t.push({ key: 'def:' + i, legal: true });
      else if (S.rules.cheat) t.push({ key: 'def:' + i, legal: false });
    });
    if (canTransfer(card)) t.push({ key: 'transfer', legal: true });
  } else if (canAdd(card)) {
    t.push({ key: 'add', legal: true });
  } else if (canCheat(card)) {
    t.push({ key: 'add', legal: false });
  }
  return t;
}

function playTo(card, key) {
  const target = dropTargets(card).find(t => t.key === key);
  if (!target) return false;
  selectedId = null;
  if (!target.legal) toast('🤫 Geschummelt…', 900);
  if (key === 'transfer') localMove({ t: 'card', id: card.id, transfer: true });
  else if (key === 'add') localMove({ t: 'card', id: card.id });
  else localMove({ t: 'card', id: card.id, target: Number(key.slice(4)) });
  return true;
}

function onTableTap(e) {
  const card = selectedCard();
  if (!card) return;
  const zone = e.target.closest('[data-drop]');
  if (zone) playTo(card, zone.dataset.drop);
}

function onCardDown(card, el, e) {
  if (e.button > 0 || !myInputAllowed() || !P(ME).hand.includes(card) || !canUseCard(card)) return;
  drag = { card, el, x0: e.clientX, y0: e.clientY, ghost: null, id: e.pointerId };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.ghost) {
    if (Math.hypot(dx, dy) < 12) return;
    // Ziehen beginnt: Karte auswählen und als „Geist“ unter dem Finger zeigen
    selectedId = drag.card.id;
    const b = drag.el.getBoundingClientRect();
    const g = drag.el.cloneNode(true);
    g.removeAttribute('data-id');
    g.classList.remove('playable', 'cheatable', 'selected', 'dim');
    g.classList.add('drag-ghost');
    g.style.cssText = '';
    g.style.setProperty('--cw', drag.el.offsetWidth + 'px');
    Object.assign(g.style, { left: b.left + 'px', top: b.top + 'px' });
    $('#fx').appendChild(g);
    drag.ghost = g;
    drag.gx = b.left; drag.gy = b.top;
    render();
  }
  drag.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 25}deg) scale(1.08)`;
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const zone = over && over.closest('[data-drop]');
  document.querySelectorAll('[data-drop].over').forEach(z => z.classList.remove('over'));
  if (zone) zone.classList.add('over');
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
  const d = drag;
  drag = null;
  if (!d.ghost) return;            // war nur ein Antippen
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 50);
  d.ghost.remove();
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const zone = over && over.closest('[data-drop]');
  if (!(zone && playTo(d.card, zone.dataset.drop))) {
    selectedId = null;             // daneben losgelassen: Karte zurück auf die Hand
    render();
  }
}

function onAction() {
  if (animating || waitingForHost || S.over) return;
  const act = $('#action').dataset.act;
  if (!act || actor() !== ME) return;
  localMove({ t: 'act', act });
}

function onCatch() {
  if (animating || waitingForHost || S.over || !S.table.length) return;
  localMove({ t: 'catch' });
}

/* ---------- Künstliche Intelligenz ---------- */

async function aiTurn(seat) {
  const hand = P(seat).hand;
  const deckLeft = S.deck.length;

  if (S.phase === 'defend') {
    const unc = uncovered();
    // Schieben, wenn es mit einer Nicht-Trumpf-Karte geht
    if (S.rules.transfer) {
      const t = hand.filter(c => canTransfer(c, seat)).sort(byValue)[0];
      if (t && (!isTrump(t) || deckLeft === 0) && Math.random() < 0.8) return transferCard(t);
    }
    // Für die erste offene Karte die billigste passende Karte suchen
    const atk = unc[0].atk;
    const options = hand.filter(c => beats(atk, c)).sort(byValue);
    let choice = options[0];
    if (choice && isTrump(choice) && !isTrump(atk) && choice.rank >= 12 &&
        deckLeft > 10 && S.table.length === 1 && atk.rank <= 9) {
      choice = null;   // hohen Trumpf nicht verschwenden
    }
    if (!choice && S.rules.cheat && hand.length && Math.random() < 0.3) {
      // Frech schummeln: kleinste Karte drauflegen
      const c = [...hand].sort(byValue)[0];
      const target = unc[0];
      await animateChange(() => {
        removeFrom(hand, c);
        target.def = c;
        target.defCheat = true;
        if (!uncovered().length) { S.phase = 'attack'; S.turn = S.attacker; S.passed = []; }
      });
      return;
    }
    if (!choice) return takeCards(seat);
    const target = unc.find(p => beats(p.atk, choice));
    await animateChange(() => {
      removeFrom(hand, choice);
      target.def = choice;
      target.defCheat = false;
      if (!uncovered().length) { S.phase = 'attack'; S.turn = S.attacker; S.passed = []; }
    });
    return;
  }

  // Angriff / Nachlegen
  if (S.table.length === 0) return addCard(seat, pickLead(hand));
  const c = pickAdd(hand, seat);
  if (c) return addCard(seat, c);
  if (S.rules.cheat && roomToAdd() && hand.length > 2 && Math.random() < 0.12) {
    const low = [...hand].filter(x => !isTrump(x)).sort(byValue)[0];
    if (low) return addCard(seat, low);
  }
  return passTurn(seat);
}

function pickLead(hand) {
  const nonTrump = hand.filter(c => !isTrump(c));
  const pool = nonTrump.length ? nonTrump : hand;
  // Niedrigste Karte; bei Gleichstand eine, von der man ein Paar hat (zum Nachlegen)
  const counts = {};
  pool.forEach(c => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  return [...pool].sort((a, b) => (value(a) - (counts[a.rank] > 1 ? 1.5 : 0)) -
                                  (value(b) - (counts[b.rank] > 1 ? 1.5 : 0)))[0];
}

function pickAdd(hand) {
  const deckLeft = S.deck.length;
  const cands = hand.filter(canAdd).filter(c => {
    if (deckLeft === 0) return true;
    if (isTrump(c)) return false;
    if (c.rank >= 13 && deckLeft > 4) return false;
    return true;
  }).sort(byValue);
  return cands[0] || null;
}

/* ---------- Bildschirme & Statistik ---------- */

function loadStats() {
  try { return JSON.parse(localStorage.getItem('pokedurak-stats')) || { win: 0, lose: 0, draw: 0 }; }
  catch { return { win: 0, lose: 0, draw: 0 }; }
}
function saveStat(result) {
  const s = loadStats();
  s[result]++;
  try { localStorage.setItem('pokedurak-stats', JSON.stringify(s)); } catch { /* egal */ }
}
function showStats() {
  const s = loadStats();
  const total = s.win + s.lose + s.draw;
  $('#stats').textContent = total
    ? `Siege: ${s.win} · Durak: ${s.lose} · Unentschieden: ${s.draw}`
    : '';
}

function hideScreens() {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
}
function showScreen(id) {
  hideScreens();
  $(id).classList.remove('hidden');
}

function showGameOver(result, durak) {
  const dn = durak === null ? '' : nameOf(durak);
  const txt = {
    win:  ['🏆', 'Gewonnen!', `Du bist deine Karten losgeworden. ${dn} ist der Durak!`],
    lose: ['🤡', 'Du bist der Durak!', 'Du hattest am Ende noch Karten auf der Hand. Revanche?'],
    draw: ['🤝', 'Unentschieden', 'Die Letzten sind gleichzeitig alle Karten losgeworden – kein Durak.'],
  }[result];
  $('#over-emoji').textContent = txt[0];
  $('#over-title').textContent = txt[1];
  $('#over-text').textContent = txt[2];
  // Rangliste bei mehr als zwei Spielern
  const list = $('#over-ranking');
  list.innerHTML = '';
  if (N() > 2) {
    const order = S.players.map((p, i) => i).sort((a, b) => (P(a).place || 99) - (P(b).place || 99));
    for (const s of order) {
      const li = document.createElement('li');
      li.textContent = `${s === S.durak ? '🤡' : P(s).place === 1 ? '🥇' : '🏁'} ${nameOf(s)}${s === ME ? ' (du)' : ''}`;
      list.appendChild(li);
    }
  }
  $('#btn-again').textContent = 'Nochmal spielen';
  $('#btn-menu').classList.toggle('hidden', MODE === 'ai');
  $('#screen-over').classList.remove('hidden');
}

/* =========================================================
 *  Online-Spiel (Peer-to-Peer über WebRTC mit PeerJS)
 *
 *  Der Gastgeber führt das komplette Spiel und ist mit jedem Gast
 *  direkt verbunden. Gäste schicken nur ihre Züge und bekommen nach
 *  jeder Änderung den Spielstand, den sie mit denselben Animationen
 *  darstellen.
 * ========================================================= */

const PEER_PREFIX = 'pokedurak-v2-';
const PEERJS_URL = 'vendor/peerjs.min.js';   // PeerJS 1.5.5 (MIT)
// ?local=1: Verbindung über BroadcastChannel zwischen Tabs (zum Testen ohne Internet)
const LOCAL_TEST = new URLSearchParams(location.search).has('local');
// ?peerserver=host:port: eigenen PeerJS-Server statt des öffentlichen verwenden (zum Testen)
const PEER_SERVER = new URLSearchParams(location.search).get('peerserver');
function peerOptions() {
  if (!PEER_SERVER) return {};
  const [host, port] = PEER_SERVER.split(':');
  return { host, port: +port || 9000, path: '/', secure: false };
}

let transport = null;       // Gast: Verbindung zum Gastgeber
let peer = null;
let lobby = [];             // Gastgeber: Spieler in der Lobby (werden zu S.players)
let gameStarted = false;
let pendingOrder = null;    // IDs neu gezogener Karten für die nächste Übertragung
let lastSent = '';
let guestQueue = Promise.resolve();
let myName = loadName();
let hostName = '';

function send(msg) { if (transport) transport.send(msg); }
function broadcast(msg) { for (const p of lobby) if (p.link) p.link.send(msg); }
function broadcastEach(fn) { lobby.forEach(p => { if (p.link) p.link.send(fn(S.players.indexOf(p))); }); }
function sendTo(seat, msg) { const p = P(seat); if (p && p.link) p.link.send(msg); }

function loadName() {
  try { return localStorage.getItem('pokedurak-name') || ''; } catch { return ''; }
}
function saveName(n) {
  try { localStorage.setItem('pokedurak-name', n); } catch { /* egal */ }
}
function currentName() {
  const n = $('#player-name').value.trim().slice(0, 12);
  if (n) { myName = n; saveName(n); }
  return myName || 'Trainer';
}
const cleanName = n => String(n || 'Freund').replace(/[<>]/g, '').slice(0, 12) || 'Freund';

// Spielstand für die Gäste (ohne Schummel-Markierungen und ohne Stapelreihenfolge)
function serialize() {
  return {
    players: S.players.map(p => ({ name: p.name, kind: p.kind, hand: p.hand.map(c => c.id), out: p.out, place: p.place })),
    deck: { trump: S.deck.length ? S.deck[0].id : null, n: S.deck.length },
    trump: S.trump,
    table: S.table.map(p => [p.atk.id, p.def ? p.def.id : null, p.atkBy]),
    discard: S.discard.map(c => c.id),
    attacker: S.attacker, defender: S.defender, turn: S.turn, passed: S.passed,
    phase: S.phase, firstRound: S.firstRound, over: S.over, durak: S.durak,
    finished: S.finished, rules: S.rules,
  };
}

function applyState(st) {
  const card = id => CARD_BY_ID.get(id);
  S.trump = st.trump;
  S.players = st.players.map(p => ({ ...p, hand: p.hand.map(card) }));
  S.deck = st.deck.n ? [card(st.deck.trump), ...Array(st.deck.n - 1).fill(null)] : [];
  S.table = st.table.map(([a, d, by]) => ({ atk: card(a), def: d ? card(d) : null, atkBy: by }));
  S.discard = st.discard.map(card);
  Object.assign(S, {
    attacker: st.attacker, defender: st.defender, turn: st.turn, passed: st.passed,
    phase: st.phase, firstRound: st.firstRound, over: st.over, durak: st.durak,
    finished: st.finished, rules: st.rules,
  });
}

function syncState() {
  if (MODE !== 'host' || !gameStarted) return;
  const order = pendingOrder || [];
  pendingOrder = null;
  const st = JSON.stringify(serialize());
  if (st === lastSent && !order.length) return;
  lastSent = st;
  broadcast({ t: 'state', s: st, order });
}

/* ----- Gastgeber ----- */

function acceptGuest(link) {
  link.handler = m => onHostMessage(link, m);
  link.closeHandler = () => guestLeft(link);
}

function onHostMessage(link, m) {
  if (m.t === 'hello') {
    if (gameStarted || lobby.length >= MAX_PLAYERS) {
      link.send({ t: 'full' });
      setTimeout(() => link.close(), 500);
      return;
    }
    const p = { name: cleanName(m.name), kind: 'remote', hand: [], out: false, place: 0, link };
    link.player = p;
    lobby.push(p);
    link.send({ t: 'welcome', host: currentName() });
    renderLobby();
    return;
  }
  const p = link.player;
  if (!p) return;
  const seat = S.players.indexOf(p);
  if (m.t === 'again') {
    if (gameStarted && S.over && !animating) newGame(lobby);
    return;
  }
  if (seat < 0 || !gameStarted) return;
  if (m.t === 'card' || m.t === 'act' || m.t === 'catch') {
    exclusive(() => applyMove(seat, m)).then(ok => {
      // Immer antworten – auch wenn sich am Spielstand nichts geändert hat
      link.send({ t: ok ? 'ack' : 'nack' });
      drive();
    });
  }
}

function guestLeft(link) {
  const p = link.player;
  if (!p || !p.link) return;
  p.link = null;
  if (!gameStarted) {
    lobby = lobby.filter(x => x !== p);
    renderLobby();
    return;
  }
  p.kind = 'ai';
  p.name = p.name + ' 🤖';
  say(null, `📡 ${p.name.replace(' 🤖', '')} ist weg – Computer übernimmt`, undefined, 1800);
  drive();
}

function renderLobby() {
  const list = $('#lobby-list');
  const players = MODE === 'host' ? lobby : guestLobby;
  list.innerHTML = '';
  players.forEach((p, i) => {
    const li = document.createElement('li');
    const icon = p.kind === 'ai' ? '🤖' : i === 0 ? '👑' : '🙂';
    li.textContent = `${icon} ${p.name}`;
    list.appendChild(li);
  });
  $('#lobby-count').textContent = `${players.length} / ${MAX_PLAYERS} Spieler`;
  if (MODE === 'host') {
    $('#btn-host-start').disabled = lobby.length < 2;
    $('#btn-add-ai').disabled = lobby.length >= MAX_PLAYERS;
    $('#btn-remove-ai').disabled = !lobby.some(p => p.kind === 'ai');
    broadcast({ t: 'lobby', players: lobby.map(p => ({ name: p.name, kind: p.kind })), rules: settings });
  }
}

function addLobbyAI() {
  if (lobby.length >= MAX_PLAYERS) return;
  const used = new Set(lobby.map(p => p.name));
  const name = AI_NAMES.find(n => !used.has(n)) || 'KI';
  lobby.push({ name, kind: 'ai', hand: [], out: false, place: 0 });
  renderLobby();
}

function removeLobbyAI() {
  for (let i = lobby.length - 1; i >= 0; i--) {
    if (lobby[i].kind === 'ai') { lobby.splice(i, 1); break; }
  }
  renderLobby();
}

function startHostedGame() {
  if (lobby.length < 2) return;
  settings.transfer = $('#host-transfer').checked;
  settings.cheat = $('#host-cheat').checked;
  saveSettings();
  gameStarted = true;
  newGame(lobby);
}

/* ----- Gast ----- */

let guestLobby = [];

function onGuestMessage(m) {
  guestQueue = guestQueue.then(() => guestHandle(m)).catch(err => console.error(err));
}

async function guestHandle(m) {
  switch (m.t) {
    case 'welcome':
      hostName = cleanName(m.host);
      $('#online-menu').classList.add('hidden');
      $('#online-wait').classList.remove('hidden');
      document.querySelectorAll('.host-only').forEach(e => e.classList.add('hidden'));
      $('#online-status').textContent = `Verbunden! Warte, bis ${hostName} das Spiel startet…`;
      onlineMsg('');
      break;
    case 'lobby':
      guestLobby = m.players;
      renderLobby();
      $('#guest-rules').textContent =
        `Regeln: ${m.rules.transfer ? 'Schieben erlaubt' : 'kein Schieben'} · ${m.rules.cheat ? 'Schummeln erlaubt' : 'kein Schummeln'}`;
      break;
    case 'full':
      onlineMsg('Das Spiel ist voll oder läuft schon.');
      $('#btn-join').disabled = false;
      break;
    case 'new':
      ME = m.you;
      elCache = new Map();
      hideScreens();
      computeSizes();
      waitingForHost = false;
      break;
    case 'state': {
      const st = JSON.parse(m.s);
      await animateChange(() => { applyState(st); return m.order; }, { stagger: 60 });
      waitingForHost = false;
      render();
      break;
    }
    case 'say':
      showSay(m.seat, m.mine, m.theirs, m.ms, m.sfx);
      break;
    case 'over':
      finishGame(m.durak);
      break;
    case 'ack':
    case 'nack':
      waitingForHost = false;
      render();
      break;
  }
}

/* ----- Verbindungsaufbau ----- */

function onDisconnect() {
  if (!transport) return;
  transport = null;
  $('#over-emoji').textContent = '📡';
  $('#over-title').textContent = 'Verbindung getrennt';
  $('#over-text').textContent = `Die Verbindung zu ${hostName || 'deinem Gastgeber'} ist abgebrochen.`;
  $('#over-ranking').innerHTML = '';
  $('#btn-again').textContent = 'Zum Menü';
  $('#btn-menu').classList.add('hidden');
  showScreen('#screen-over');
}

function backToMenu() {
  location.href = location.pathname + (LOCAL_TEST ? '?local=1' : PEER_SERVER ? '?peerserver=' + PEER_SERVER : '');
}

function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += abc[Math.floor(Math.random() * abc.length)];
  return c;
}

// In der Android-App läuft die Seite unter https://localhost – Einladungen zeigen dann auf die Web-Version
const PUBLIC_URL = 'https://walterdeiss-blip.github.io/TEst/';
function webBaseUrl() {
  if (window.Capacitor || location.protocol === 'file:') return PUBLIC_URL;
  return location.origin + location.pathname;
}

function onlineMsg(text) { $('#online-msg').textContent = text; }

function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error('PeerJS konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
}

// Einheitliche Verbindung: { send, close, handler, closeHandler }
function peerLink(conn) {
  const link = { send: m => conn.send(m), close: () => conn.close(), handler: null, closeHandler: null };
  conn.on('data', m => link.handler && link.handler(m));
  conn.on('close', () => link.closeHandler && link.closeHandler());
  conn.on('error', () => link.closeHandler && link.closeHandler());
  return link;
}

function localHostChannel(code, onGuest) {
  const ch = new BroadcastChannel('pokedurak-' + code);
  const links = new Map();
  ch.onmessage = e => {
    const { from, to, m } = e.data;
    if (to !== 'host') return;
    let link = links.get(from);
    if (!link) {
      link = { send: msg => ch.postMessage({ from: 'host', to: from, m: msg }), close() {}, handler: null, closeHandler: null };
      links.set(from, link);
      onGuest(link);
    }
    if (link.handler) link.handler(m);
  };
}

function localGuestLink(code) {
  const id = Math.random().toString(36).slice(2);
  const ch = new BroadcastChannel('pokedurak-' + code);
  const link = { send: m => ch.postMessage({ from: id, to: 'host', m }), close: () => ch.close(), handler: null, closeHandler: null };
  ch.onmessage = e => { if (e.data.to === id && link.handler) link.handler(e.data.m); };
  return link;
}

async function hostGame() {
  MODE = 'host';
  ME = 0;
  lobby = [{ name: currentName(), kind: 'human', hand: [], out: false, place: 0 }];
  onlineMsg('');
  $('#online-menu').classList.add('hidden');
  $('#online-wait').classList.remove('hidden');
  document.querySelectorAll('.host-only').forEach(e => e.classList.remove('hidden'));
  $('#guest-rules').textContent = '';
  $('#host-transfer').checked = !!settings.transfer;
  $('#host-cheat').checked = !!settings.cheat;
  $('#room-code').textContent = '…';
  renderLobby();
  const code = makeCode();

  if (LOCAL_TEST) {
    $('#room-code').textContent = code;
    localHostChannel(code, acceptGuest);
    return;
  }
  try { await loadPeerJS(); } catch (e) { return onlineMsg(e.message + '. Bist du online?'); }
  peer = new Peer(PEER_PREFIX + code, peerOptions());
  peer.on('open', () => { $('#room-code').textContent = code; });
  peer.on('connection', conn => {
    conn.on('open', () => acceptGuest(peerLink(conn)));
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); hostGame(); return; }
    if (!gameStarted) onlineMsg('Verbindungsfehler: ' + e.type);
  });
}

async function joinGame() {
  const code = $('#join-code').value.trim().toUpperCase();
  if (code.length < 4) return onlineMsg('Bitte den Spielcode eingeben.');
  currentName();
  onlineMsg('Verbinde…');
  $('#btn-join').disabled = true;
  MODE = 'guest';

  const connected = link => {
    transport = link;
    link.handler = onGuestMessage;
    link.closeHandler = onDisconnect;
    send({ t: 'hello', name: currentName() });
  };
  if (LOCAL_TEST) return connected(localGuestLink(code));

  try { await loadPeerJS(); } catch (e) {
    $('#btn-join').disabled = false;
    return onlineMsg(e.message + '. Bist du online?');
  }
  peer = new Peer(peerOptions());
  const timer = setTimeout(() => {
    if (!transport) {
      onlineMsg('Keine Verbindung möglich. Prüfe den Code oder versucht es in einem anderen Netz (z. B. WLAN statt Mobilfunk).');
      $('#btn-join').disabled = false;
    }
  }, 20000);
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      clearTimeout(timer);
      connected(peerLink(conn));
    });
  });
  peer.on('error', e => {
    if (transport) return;
    clearTimeout(timer);
    $('#btn-join').disabled = false;
    onlineMsg(e.type === 'peer-unavailable'
      ? 'Spiel nicht gefunden – stimmt der Code?'
      : 'Verbindungsfehler: ' + e.type);
  });
}

async function shareInvite() {
  const code = $('#room-code').textContent;
  const extra = LOCAL_TEST ? '&local=1' : PEER_SERVER ? '&peerserver=' + PEER_SERVER : '';
  const url = `${webBaseUrl()}?join=${code}${extra}`;
  const text = `Spiel mit mir PokéDurak! Code: ${code}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'PokéDurak', text, url }); return; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    $('#online-status').textContent = 'Link kopiert! Warte auf Mitspieler…';
  } catch { /* abgebrochen */ }
}

/* ---------- Spiel gegen den Computer ---------- */

function openSetup() {
  $('#opt-transfer').checked = !!settings.transfer;
  $('#opt-cheat').checked = !!settings.cheat;
  document.querySelectorAll('#opp-count-select button').forEach(b =>
    b.classList.toggle('sel', +b.dataset.n === settings.opponents));
  showScreen('#screen-setup');
}

function startAIGame() {
  settings.transfer = $('#opt-transfer').checked;
  settings.cheat = $('#opt-cheat').checked;
  saveSettings();
  MODE = 'ai';
  ME = 0;
  const players = [{ name: 'Du', kind: 'human', hand: [], out: false, place: 0 }];
  for (let i = 0; i < settings.opponents; i++) {
    players.push({ name: AI_NAMES[i], kind: 'ai', hand: [], out: false, place: 0 });
  }
  newGame(players);
}

function restartGame() {
  if (MODE === 'ai') return newGame(S.players);
  if (MODE === 'host') return newGame(lobby);
  send({ t: 'again' });
}

/* ---------- Start ---------- */

$('#action').addEventListener('click', onAction);
$('#btn-catch').addEventListener('click', onCatch);
$('#table').addEventListener('click', onTableTap);
$('#btn-start').addEventListener('click', openSetup);
$('#btn-setup-start').addEventListener('click', startAIGame);
$('#btn-setup-back').addEventListener('click', () => showScreen('#screen-start'));
document.querySelectorAll('#opp-count-select button').forEach(b => b.addEventListener('click', () => {
  settings.opponents = +b.dataset.n;
  saveSettings();
  document.querySelectorAll('#opp-count-select button').forEach(x => x.classList.toggle('sel', x === b));
}));

$('#btn-again').addEventListener('click', () => {
  if (MODE === 'guest' && !transport) return backToMenu();
  if (MODE === 'guest') {
    send({ t: 'again' });
    $('#btn-again').textContent = `Warte auf ${hostName}…`;
    return;
  }
  restartGame();
});
$('#btn-menu').addEventListener('click', backToMenu);
$('#btn-new').addEventListener('click', () => {
  if (animating || S.phase === 'idle' && !S.over && !N()) return;
  if (MODE === 'guest') {
    if (S.over) send({ t: 'again' });
    else toast(`Nur ${hostName} kann neu starten`);
    return;
  }
  if (!N()) return;
  if (S.over || confirm('Neues Spiel starten? Das laufende Spiel geht verloren.')) restartGame();
});
let rulesReturn = null;
function openRules(from) {
  rulesReturn = from;
  if (from) from.classList.add('hidden');
  $('#screen-rules').classList.remove('hidden');
}
$('#btn-rules').addEventListener('click', () => openRules(null));
$('#btn-start-rules').addEventListener('click', () => openRules($('#screen-start')));
$('#btn-rules-close').addEventListener('click', () => {
  $('#screen-rules').classList.add('hidden');
  if (rulesReturn) rulesReturn.classList.remove('hidden');
});

$('#btn-online').addEventListener('click', () => showScreen('#screen-online'));
$('#btn-online-back').addEventListener('click', backToMenu);
$('#btn-host').addEventListener('click', hostGame);
$('#btn-join').addEventListener('click', joinGame);
$('#btn-share').addEventListener('click', shareInvite);
$('#btn-add-ai').addEventListener('click', addLobbyAI);
$('#btn-remove-ai').addEventListener('click', removeLobbyAI);
$('#btn-host-start').addEventListener('click', startHostedGame);
['#host-transfer', '#host-cheat'].forEach(id => $(id).addEventListener('change', () => {
  settings.transfer = $('#host-transfer').checked;
  settings.cheat = $('#host-cheat').checked;
  saveSettings();
  renderLobby();
}));
$('#join-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });

window.addEventListener('resize', () => {
  computeSizes();
  if (!animating) render();
});

$('#player-name').value = myName;
computeSizes();
showStats();
render();

/* ----- Musik ----- */

function updateMusicButton() {
  const on = Music.enabled();
  const b = $('#btn-music');
  b.textContent = on ? '🎵' : '🔇';
  b.classList.toggle('off', !on);
}
$('#btn-music').addEventListener('click', () => {
  Music.setEnabled(!Music.enabled());
  updateMusicButton();
});
updateMusicButton();

/* ----- Als App installieren ----- */

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !window.Capacitor) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Modus weiter */ });
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  $('#btn-install').classList.remove('hidden');
});
window.addEventListener('appinstalled', () => $('#btn-install').classList.add('hidden'));
$('#btn-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#btn-install').classList.add('hidden');
});
// iPhone/iPad: kein Installations-Dialog, stattdessen Hinweis zeigen
if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !isStandalone() && !window.Capacitor) {
  $('#ios-install').classList.remove('hidden');
}

// Einladungslink ?join=CODE öffnet direkt den Beitreten-Dialog
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) {
  $('#screen-start').classList.add('hidden');
  $('#screen-online').classList.remove('hidden');
  $('#join-code').value = joinParam.toUpperCase();
  onlineMsg(myName ? '' : 'Gib oben deinen Namen ein und tippe auf „Beitreten“.');
}
