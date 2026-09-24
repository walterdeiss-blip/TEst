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

const artUrl = dex =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;

// Sitzplätze 0 und 1. ME = eigener Platz (unten), OPP = Gegner (oben).
// Gegen den Computer und als Gastgeber ist man Platz 0, als Gast Platz 1.
let ME = 0, OPP = 1;
let MODE = 'ai';            // 'ai' | 'host' | 'guest'
let oppName = 'Rivale';
const HAND_SIZE = 6;

const $ = sel => document.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Spielzustand ---------- */

const S = {
  deck: [],        // deck[0] ist die offene Trumpfkarte (unten), gezogen wird vom Ende
  trump: null,
  hands: [[], []],
  table: [],       // [{atk, def}]
  discard: [],
  attacker: ME,
  defender: OPP,
  phase: 'idle',   // 'attack' | 'defend' | 'throwin' (Verteidiger nimmt, Angreifer darf nachlegen)
  firstRound: true,
  over: false,
};
let busy = false;
let sizes = { hand: 80, table: 58, opp: 44 };

const isTrump = c => c.suit === S.trump;
const value = c => c.rank + (isTrump(c) ? 20 : 0);
const byValue = (a, b) => value(a) - value(b);

function beats(atk, def) {
  if (def.suit === atk.suit) return def.rank > atk.rank;
  return isTrump(def);
}

function uncoveredPair() { return S.table.find(p => !p.def); }

function tableRanks() {
  const r = new Set();
  for (const p of S.table) { r.add(p.atk.rank); if (p.def) r.add(p.def.rank); }
  return r;
}

function maxAttacks() { return S.firstRound ? 5 : 6; }

// Darf der Angreifer diese Karte (jetzt) legen?
function canAdd(card) {
  if (S.table.length === 0) return true;
  if (S.table.length >= maxAttacks()) return false;
  const open = S.table.filter(p => !p.def).length;
  if (open >= S.hands[S.defender].length) return false;
  return tableRanks().has(card.rank);
}

function removeFrom(arr, card) {
  const i = arr.indexOf(card);
  if (i >= 0) arr.splice(i, 1);
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
  const i = card.rank - 6;
  const cost = energy(card.suit).repeat(Math.min(ENERGY[i], 2)) + energy('colorless').repeat(Math.max(ENERGY[i] - 2, 0));
  el.innerHTML =
    `<div class="inner">
      <div class="front"><div class="face">
        <div class="top">
          <span class="stage">${i >= 4 ? 'PHASE' : 'BASIS'}</span>
          <span class="name">${card.name}</span>
          <span class="hp"><small>KP</small>${card.hp}</span>${energy(card.suit)}
        </div>
        <div class="art" data-icon="${s.icon}"><img alt="" draggable="false"></div>
        <div class="rank">${rk}</div>
        <div class="dex">Nr. ${String(card.dex).padStart(3, '0')} · ${s.name}-Pokémon</div>
        <div class="attack"><span class="cost">${cost}</span>
          <span class="atk-name">${ATTACKS[card.suit][i]}</span><span class="dmg">${DAMAGE[i]}</span></div>
        <div class="foot">
          <span>Schwäche ${energy(WEAKNESS[card.suit])}+20</span>
          <span>${isTrump(card) ? '<b class="trump-tag">★ TRUMPF</b>' : 'Rückzug ' + energy('colorless').repeat(Math.ceil(ENERGY[i] / 2))}</span>
        </div>
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
    if (++tries <= 3) setTimeout(() => { img.src = artUrl(card.dex) + '?r=' + tries; }, 1500 * tries);
  };
  img.src = artUrl(card.dex);
  el.addEventListener('click', () => onCardTap(card, el));
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

function render() {
  const humanTurn = !busy && !S.over && actor() === ME;

  // Trumpf-Anzeige
  $('#trump-info').innerHTML = S.trump
    ? `<span>Trumpf:</span><span class="ti">${SUITS[S.trump].icon}</span><span>${SUITS[S.trump].name}</span>`
    : '';

  // Gegner
  const opp = $('#opp-hand');
  const oppEls = S.hands[OPP].map(c => prep(c, sizes.opp, { down: true }));
  opp.replaceChildren(...oppEls);
  layoutFan(opp, oppEls, sizes.opp, true);
  $('#opp-count').textContent = S.hands[OPP].length;
  $('#opp-name').textContent = oppName;
  $('#opp').classList.toggle('active', !S.over && actor() === OPP && S.phase !== 'idle');

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
  const pairs = S.table.map((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'pair';
    const a = prep(p.atk, tcw, { rot: ((i * 5) % 7) - 3, extra: humanDefending && !p.def ? 'target' : '' });
    wrap.appendChild(a);
    if (p.def) {
      const d = prep(p.def, tcw, { rot: 6 + ((i * 3) % 5), extra: 'def' });
      wrap.appendChild(d);
    }
    return wrap;
  });
  table.replaceChildren(...pairs);

  // Eigene Hand
  const hand = $('#hand');
  const sorted = sortHand(S.hands[ME]);
  // Bei vielen Karten etwas kleiner, damit jede Karte antippbar bleibt
  const hcw = Math.round(sizes.hand * (sorted.length > 12 ? 0.8 : sorted.length > 8 ? 0.9 : 1));
  const handEls = sorted.map(c => {
    let extra = '';
    if (humanTurn) extra = isPlayable(c) ? 'playable' : 'dim';
    return prep(c, hcw, { extra });
  });
  hand.replaceChildren(...handEls);
  layoutFan(hand, handEls, hcw, false);

  renderControls(humanTurn);
  syncState();
}

function actor() {
  return S.phase === 'defend' ? S.defender : S.attacker;
}

function isPlayable(card, seat = ME) {
  if (S.phase === 'defend' && S.defender === seat) {
    const p = uncoveredPair();
    return !!p && beats(p.atk, card);
  }
  if ((S.phase === 'attack' || S.phase === 'throwin') && S.attacker === seat) return canAdd(card);
  return false;
}

function renderControls(humanTurn) {
  const status = $('#status');
  const btn = $('#action');
  btn.className = 'hidden';
  btn.dataset.act = '';

  if (S.over || S.phase === 'idle') { status.textContent = ''; return; }

  if (!humanTurn) {
    if (actor() === OPP) {
      status.textContent = S.phase === 'defend' ? `${oppName} verteidigt…`
        : S.phase === 'throwin' ? `${oppName} legt dir noch Karten dazu…`
        : `${oppName} greift an…`;
    }
    return;
  }

  if (S.phase === 'defend') {
    const canBeat = S.hands[ME].some(c => isPlayable(c));
    status.textContent = canBeat
      ? 'Verteidige dich! Schlage die markierte Karte – oder sag Bljat und nimm auf.'
      : 'Du kannst nicht schlagen – sag Bljat und nimm die Karten auf.';
    btn.className = 'take';
    btn.textContent = 'Bljat';
    btn.dataset.act = 'take';
  } else if (S.phase === 'attack') {
    if (S.table.length === 0) {
      status.textContent = 'Du greifst an – spiele eine Karte.';
    } else {
      status.textContent = 'Alles geschlagen. Lege eine passende Karte nach oder sag Dawai.';
      btn.className = '';
      btn.textContent = 'Dawai';
      btn.dataset.act = 'bito';
    }
  } else if (S.phase === 'throwin') {
    status.textContent = `${oppName} nimmt auf – du darfst noch passende Karten dazugeben.`;
    btn.className = '';
    btn.textContent = 'Fertig';
    btn.dataset.act = 'done';
  }
}

let toastTimer = null;
function toast(text, ms = 1100) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
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
  const before = snapshot();
  const stack = $('#deck-stack') || $('#deck');
  const deckBox = { ...box(stack), rot: 0, down: true };
  const order = mutate() || [];
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

/* ---------- Spielablauf (Computer-Spiel und Gastgeber) ---------- */

const isAISeat = seat => MODE === 'ai' && seat === OPP;
const isRemoteSeat = seat => MODE === 'host' && seat === OPP;

// Meldung anzeigen – aus Sicht von "seat". '{n}' wird durch den Gegnernamen ersetzt.
// Als Gastgeber geht die Meldung auch an den Gast, der sie aus seiner Sicht zeigt.
function say(seat, mine, theirs = mine, ms) {
  showSay(seat, mine, theirs, ms);
  if (MODE === 'host') send({ t: 'say', seat, mine, theirs, ms });
}
function showSay(seat, mine, theirs, ms) {
  const text = seat === null || seat === ME ? mine : theirs;
  toast(text.replace('{n}', oppName), ms);
}

async function newGame() {
  if (MODE === 'guest') { send({ t: 'again' }); return; }
  busy = true;
  // Kurz auf die Pokémon-Bilder warten (höchstens 4 s, danach geht's auch ohne)
  const btn = $('#btn-start');
  btn.textContent = 'Lade Pokémon…';
  await Promise.race([imagesReady, sleep(4000)]);
  btn.textContent = 'Gegen den Computer';
  hideScreens();
  elCache = new Map();
  pendingRemote = null;
  S.deck = shuffle([...ALL_CARDS]);
  S.trump = S.deck[0].suit;
  S.hands = [[], []];
  S.table = [];
  S.discard = [];
  S.phase = 'idle';
  S.firstRound = true;
  S.over = false;
  if (MODE === 'host') send({ t: 'new' });
  computeSizes();
  render();
  await sleep(250);
  say(null, `Trumpf: ${SUITS[S.trump].icon} ${SUITS[S.trump].name}`, undefined, 1300);
  await sleep(700);

  await animateChange(() => {
    const ids = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      for (const p of [0, 1]) {
        const c = S.deck.pop();
        S.hands[p].push(c);
        ids.push(c.id);
      }
    }
    return ids;
  }, { stagger: 80 });

  // Wer den niedrigsten Trumpf hat, beginnt
  const low = p => Math.min(...S.hands[p].filter(isTrump).map(c => c.rank), 99);
  const l0 = low(0), l1 = low(1);
  let first;
  if (l0 === 99 && l1 === 99) first = Math.random() < 0.5 ? 0 : 1;
  else first = l0 < l1 ? 0 : 1;
  S.attacker = first;
  S.defender = 1 - first;
  S.phase = 'attack';
  render();
  await sleep(200);
  say(first, 'Du beginnst!', '{n} beginnt!', 1200);
  await sleep(900);
  busy = false;
  loop();
}

async function loop() {
  if (S.over || MODE === 'guest') return;
  const who = actor();

  if (isAISeat(who)) {
    busy = true;
    render();
    await sleep(S.phase === 'throwin' ? 550 : 750);
    await aiTurn();
    busy = false;
    return loop();
  }

  // Automatische Züge, wenn der Spieler am Zug nichts mehr legen kann
  const hand = S.hands[who];
  if (S.phase === 'attack' && S.table.length > 0 && !hand.some(canAdd)) {
    busy = true;
    render();
    await sleep(700);
    say(null, 'Dawai!');
    await endRound(false);
    busy = false;
    return loop();
  }
  if (S.phase === 'throwin' && !hand.some(canAdd)) {
    busy = true;
    render();
    await sleep(500);
    await endRound(true);
    busy = false;
    return loop();
  }

  busy = false;
  render();
  if (isRemoteSeat(who)) tryRemote();
}

async function playAttack(p, card) {
  await animateChange(() => {
    removeFrom(S.hands[p], card);
    S.table.push({ atk: card, def: null });
    if (S.phase === 'attack') S.phase = 'defend';
  });
}

async function playDefend(card) {
  await animateChange(() => {
    removeFrom(S.hands[S.defender], card);
    uncoveredPair().def = card;
    S.phase = 'attack';
  });
}

async function endRound(taken) {
  const att = S.attacker, def = S.defender;
  await animateChange(() => {
    const cards = S.table.flatMap(p => (p.def ? [p.atk, p.def] : [p.atk]));
    if (taken) S.hands[def].push(...cards);
    else S.discard.push(...cards);
    S.table = [];
  }, { dur: 520 });

  await sleep(150);
  await animateChange(() => {
    const ids = [];
    for (const p of [att, def]) {
      while (S.hands[p].length < HAND_SIZE && S.deck.length) {
        const c = S.deck.pop();
        S.hands[p].push(c);
        ids.push(c.id);
      }
    }
    return ids;
  });

  S.firstRound = false;
  if (!taken) { S.attacker = def; S.defender = att; }
  if (checkGameOver()) return;
  S.phase = 'attack';
  render();
  await sleep(150);
  say(S.attacker, 'Dein Angriff!', '{n} greift an!', 900);
  await sleep(400);
}

function checkGameOver() {
  if (S.deck.length > 0) return false;
  const out = [S.hands[0].length === 0, S.hands[1].length === 0];
  if (!out[0] && !out[1]) return false;

  S.over = true;
  S.phase = 'idle';
  render();
  if (MODE === 'host') send({ t: 'over', out });
  finishGame(out);
  return true;
}

function finishGame(out) {
  let result;
  if (out[ME] && out[OPP]) result = 'draw';
  else result = out[ME] ? 'win' : 'lose';
  saveStat(result);
  setTimeout(() => showGameOver(result), 500);
}

/* ---------- Züge (lokal oder vom Gast) ---------- */

async function doCard(seat, card) {
  if (busy || S.over || actor() !== seat) return false;
  if (!S.hands[seat].includes(card) || !isPlayable(card, seat)) return false;
  busy = true;
  if (S.phase === 'defend') await playDefend(card);
  else await playAttack(seat, card);
  busy = false;
  loop();
  return true;
}

async function doAction(seat, act) {
  if (busy || S.over || actor() !== seat) return false;
  if (act === 'take' && S.phase === 'defend') {
    busy = true;
    S.phase = 'throwin';
    render();
    say(seat, 'Bljat! Du nimmst auf', '{n}: Bljat!');
    await sleep(300);
  } else if (act === 'bito' && S.phase === 'attack' && S.table.length > 0) {
    busy = true;
    say(null, 'Dawai!');
    await endRound(false);
  } else if (act === 'done' && S.phase === 'throwin') {
    busy = true;
    await endRound(true);
  } else {
    return false;
  }
  busy = false;
  loop();
  return true;
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  if (navigator.vibrate) navigator.vibrate(30);
}

function onCardTap(card, el) {
  if (busy || S.over) return;
  if (!S.hands[ME].includes(card) || actor() !== ME) return;
  if (!isPlayable(card)) return shake(el);
  if (MODE === 'guest') {
    busy = true;
    render();
    send({ t: 'card', id: card.id });
  } else {
    doCard(ME, card);
  }
}

function onAction() {
  if (busy || S.over) return;
  const act = $('#action').dataset.act;
  if (!act) return;
  if (MODE === 'guest') {
    busy = true;
    render();
    send({ t: 'act', act });
  } else {
    doAction(ME, act);
  }
}

/* ---------- Künstliche Intelligenz ---------- */

async function aiTurn() {
  const hand = S.hands[OPP];
  const deckLeft = S.deck.length;

  if (S.phase === 'defend') {
    const atk = uncoveredPair().atk;
    const options = hand.filter(c => beats(atk, c)).sort(byValue);
    let choice = options[0];
    // Einen hohen Trumpf nicht für eine kleine Karte früh im Spiel verschwenden
    if (choice && isTrump(choice) && !isTrump(atk) && choice.rank >= 12 &&
        deckLeft > 10 && S.table.length === 1 && atk.rank <= 9) {
      choice = null;
    }
    if (!choice) {
      say(OPP, 'Bljat! Du nimmst auf', '{n}: Bljat!');
      S.phase = 'throwin';
      await sleep(400);
      return;
    }
    return playDefend(choice);
  }

  if (S.phase === 'attack') {
    if (S.table.length === 0) return playAttack(OPP, pickLead(hand));
    const c = pickAdd(hand);
    if (c) return playAttack(OPP, c);
    say(null, 'Dawai!');
    return endRound(false);
  }

  if (S.phase === 'throwin') {
    const c = pickAdd(hand);
    if (c) return playAttack(OPP, c);
    return endRound(true);
  }
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
    ? `Siege: ${s.win} · Niederlagen: ${s.lose} · Unentschieden: ${s.draw}`
    : '';
}

function hideScreens() {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
}

function showGameOver(result) {
  const txt = {
    win:  ['🏆', 'Gewonnen!', `Du hast alle Karten losgeworden. ${oppName} ist der Durak!`],
    lose: ['🤡', 'Du bist der Durak!', 'Du hattest am Ende noch Karten auf der Hand. Revanche?'],
    draw: ['🤝', 'Unentschieden', 'Beide sind gleichzeitig alle Karten losgeworden.'],
  }[result];
  $('#over-emoji').textContent = txt[0];
  $('#over-title').textContent = txt[1];
  $('#over-text').textContent = txt[2];
  $('#btn-again').textContent = 'Nochmal spielen';
  $('#btn-menu').classList.toggle('hidden', MODE === 'ai');
  $('#screen-over').classList.remove('hidden');
}

/* =========================================================
 *  Online-Spiel (Peer-to-Peer über WebRTC mit PeerJS)
 *
 *  Der Gastgeber führt das komplette Spiel. Der Gast schickt nur
 *  seine Züge und bekommt nach jeder Änderung den Spielstand zurück,
 *  den er mit denselben Animationen darstellt.
 * ========================================================= */

const PEER_PREFIX = 'pokedurak-v1-';
const PEERJS_URL = 'vendor/peerjs.min.js';   // PeerJS 1.5.5 (MIT)
// ?local=1: Verbindung über BroadcastChannel zwischen zwei Tabs (zum Testen ohne Internet)
const LOCAL_TEST = new URLSearchParams(location.search).has('local');
// ?peerserver=host:port: eigenen PeerJS-Server statt des öffentlichen verwenden (zum Testen)
const PEER_SERVER = new URLSearchParams(location.search).get('peerserver');
function peerOptions() {
  if (!PEER_SERVER) return {};
  const [host, port] = PEER_SERVER.split(':');
  return { host, port: +port || 9000, path: '/', secure: false };
}

let transport = null;       // { send(msg), close() }
let peer = null;
let pendingOrder = null;    // IDs neu gezogener Karten für die nächste Übertragung
let pendingRemote = null;   // Zug des Gastes, der noch verarbeitet werden muss
let lastSent = '';
let guestQueue = Promise.resolve();
let myName = loadName();

function send(msg) {
  if (transport) transport.send(msg);
}

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

// Spielstand für den Gast. Vom Nachziehstapel wird nur die Trumpfkarte übertragen.
function serialize() {
  return {
    deck: { trump: S.deck.length ? S.deck[0].id : null, n: S.deck.length },
    trump: S.trump,
    hands: S.hands.map(h => h.map(c => c.id)),
    table: S.table.map(p => [p.atk.id, p.def ? p.def.id : null]),
    discard: S.discard.map(c => c.id),
    attacker: S.attacker,
    defender: S.defender,
    phase: S.phase,
    firstRound: S.firstRound,
    over: S.over,
  };
}

function applyState(st) {
  const card = id => CARD_BY_ID.get(id);
  S.trump = st.trump;
  S.deck = st.deck.n ? [card(st.deck.trump), ...Array(st.deck.n - 1).fill(null)] : [];
  S.hands = st.hands.map(h => h.map(card));
  S.table = st.table.map(([a, d]) => ({ atk: card(a), def: d ? card(d) : null }));
  S.discard = st.discard.map(card);
  S.attacker = st.attacker;
  S.defender = st.defender;
  S.phase = st.phase;
  S.firstRound = st.firstRound;
  S.over = st.over;
}

function syncState() {
  if (MODE !== 'host' || !transport) return;
  const order = pendingOrder || [];
  pendingOrder = null;
  const st = JSON.stringify(serialize());
  if (st === lastSent && !order.length) return;
  lastSent = st;
  send({ t: 'state', s: st, order });
}

/* ----- Gastgeber: Nachrichten vom Gast ----- */

function onHostMessage(m) {
  if (m.t === 'hello') {
    oppName = String(m.name || 'Freund').slice(0, 12);
    send({ t: 'hello', name: currentName() });
    lastSent = '';
    newGame();
  } else if (m.t === 'card' || m.t === 'act') {
    pendingRemote = m;
    tryRemote();
  } else if (m.t === 'again') {
    if (S.over && !busy) newGame();
  }
}

function tryRemote() {
  if (!pendingRemote || busy || S.over || S.phase === 'idle') return;
  const m = pendingRemote;
  pendingRemote = null;
  let ok = false;
  if (actor() === OPP) {
    if (m.t === 'card') {
      const c = CARD_BY_ID.get(m.id);
      ok = !!c && S.hands[OPP].includes(c) && isPlayable(c, OPP);
      if (ok) doCard(OPP, c);
    } else {
      ok = true;
      doAction(OPP, m.act).then(done => { if (!done) send({ t: 'nack' }); });
    }
  }
  if (!ok) send({ t: 'nack' });
}

/* ----- Gast: Nachrichten vom Gastgeber (streng der Reihe nach) ----- */

function onGuestMessage(m) {
  guestQueue = guestQueue.then(() => guestHandle(m)).catch(err => console.error(err));
}

async function guestHandle(m) {
  switch (m.t) {
    case 'hello':
      oppName = String(m.name || 'Freund').slice(0, 12);
      hideScreens();
      $('#status').textContent = `Verbunden mit ${oppName} – das Spiel startet gleich…`;
      break;
    case 'new':
      elCache = new Map();
      hideScreens();
      computeSizes();
      break;
    case 'state': {
      busy = true;
      const st = JSON.parse(m.s);
      await animateChange(() => { applyState(st); return m.order; }, { stagger: 80 });
      busy = false;
      render();
      break;
    }
    case 'say':
      showSay(m.seat, m.mine, m.theirs, m.ms);
      break;
    case 'over':
      finishGame(m.out);
      break;
    case 'nack':
      busy = false;
      render();
      break;
  }
}

/* ----- Verbindungsaufbau ----- */

function useTransport(t, role) {
  transport = t;
  MODE = role;
  if (role === 'host') { ME = 0; OPP = 1; } else { ME = 1; OPP = 0; }
}

function onDisconnect() {
  if (!transport) return;
  transport = null;
  busy = true;
  $('#over-emoji').textContent = '📡';
  $('#over-title').textContent = 'Verbindung getrennt';
  $('#over-text').textContent = `Die Verbindung zu ${oppName} ist abgebrochen.`;
  $('#btn-again').textContent = 'Zum Menü';
  $('#btn-menu').classList.add('hidden');
  hideScreens();
  $('#screen-over').classList.remove('hidden');
}

function backToMenu() {
  location.href = location.pathname + (LOCAL_TEST ? '?local=1' : '');
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

function peerTransport(conn, onMessage) {
  conn.on('data', onMessage);
  conn.on('close', onDisconnect);
  conn.on('error', onDisconnect);
  return { send: m => conn.send(m), close: () => conn.close() };
}

function localTransport(code, role, onMessage) {
  const ch = new BroadcastChannel('pokedurak-' + code);
  ch.onmessage = e => { if (e.data.from !== role) onMessage(e.data.m); };
  return { send: m => ch.postMessage({ from: role, m }), close: () => ch.close() };
}

async function hostGame() {
  currentName();
  onlineMsg('');
  $('#online-menu').classList.add('hidden');
  $('#online-wait').classList.remove('hidden');
  $('#room-code').textContent = '…';
  const code = makeCode();

  if (LOCAL_TEST) {
    $('#room-code').textContent = code;
    useTransport(localTransport(code, 'host', onHostMessage), 'host');
    return;
  }
  try { await loadPeerJS(); } catch (e) { return onlineMsg(e.message + '. Bist du online?'); }
  peer = new Peer(PEER_PREFIX + code, peerOptions());
  peer.on('open', () => { $('#room-code').textContent = code; });
  peer.on('connection', conn => {
    if (transport) { conn.close(); return; }   // nur ein Mitspieler
    conn.on('open', () => {
      $('#online-status').textContent = 'Mitspieler verbunden!';
      useTransport(peerTransport(conn, onHostMessage), 'host');
    });
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); hostGame(); return; }
    if (!transport) onlineMsg('Verbindungsfehler: ' + e.type);
  });
}

async function joinGame() {
  const code = $('#join-code').value.trim().toUpperCase();
  if (code.length < 4) return onlineMsg('Bitte den Spielcode eingeben.');
  currentName();
  onlineMsg('Verbinde…');
  $('#btn-join').disabled = true;

  const hello = () => send({ t: 'hello', name: currentName() });
  if (LOCAL_TEST) {
    useTransport(localTransport(code, 'guest', onGuestMessage), 'guest');
    hello();
    return;
  }
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
      useTransport(peerTransport(conn, onGuestMessage), 'guest');
      onlineMsg('Verbunden!');
      hello();
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

/* ---------- Start ---------- */

$('#action').addEventListener('click', onAction);
$('#btn-start').addEventListener('click', () => { currentName(); newGame(); });
$('#btn-again').addEventListener('click', () => {
  if (MODE !== 'ai' && !transport) return backToMenu();
  if (MODE === 'guest') {
    send({ t: 'again' });
    $('#btn-again').textContent = `Warte auf ${oppName}…`;
    return;
  }
  newGame();
});
$('#btn-menu').addEventListener('click', backToMenu);
$('#btn-new').addEventListener('click', () => {
  if (busy) return;
  if (MODE === 'guest') {
    if (S.over) send({ t: 'again' });
    else toast(`Nur ${oppName} kann neu starten`);
    return;
  }
  if (S.over || S.phase === 'idle' || confirm('Neues Spiel starten? Das laufende Spiel geht verloren.')) newGame();
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

$('#btn-online').addEventListener('click', () => {
  currentName();
  $('#screen-start').classList.add('hidden');
  $('#screen-online').classList.remove('hidden');
});
$('#btn-online-back').addEventListener('click', backToMenu);
$('#btn-host').addEventListener('click', hostGame);
$('#btn-join').addEventListener('click', joinGame);
$('#btn-share').addEventListener('click', shareInvite);
$('#join-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });

window.addEventListener('resize', () => {
  computeSizes();
  if (!busy) render();
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
