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

const HUMAN = 0, AI = 1;
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
  attacker: HUMAN,
  defender: AI,
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
  const humanTurn = !busy && !S.over && actor() === HUMAN;

  // Trumpf-Anzeige
  $('#trump-info').innerHTML = S.trump
    ? `<span>Trumpf:</span><span class="ti">${SUITS[S.trump].icon}</span><span>${SUITS[S.trump].name}</span>`
    : '';

  // Gegner
  const opp = $('#opp-hand');
  const oppEls = S.hands[AI].map(c => prep(c, sizes.opp, { down: true }));
  opp.replaceChildren(...oppEls);
  layoutFan(opp, oppEls, sizes.opp, true);
  $('#opp-count').textContent = S.hands[AI].length;
  $('#opp').classList.toggle('active', !S.over && actor() === AI && S.phase !== 'idle');

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
  const sorted = sortHand(S.hands[HUMAN]);
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
}

function actor() {
  return S.phase === 'defend' ? S.defender : S.attacker;
}

function isPlayable(card) {
  if (S.phase === 'defend' && S.defender === HUMAN) {
    const p = uncoveredPair();
    return !!p && beats(p.atk, card);
  }
  if ((S.phase === 'attack' || S.phase === 'throwin') && S.attacker === HUMAN) return canAdd(card);
  return false;
}

function renderControls(humanTurn) {
  const status = $('#status');
  const btn = $('#action');
  btn.className = 'hidden';
  btn.dataset.act = '';

  if (S.over || S.phase === 'idle') { status.textContent = ''; return; }

  if (!humanTurn) {
    if (actor() === AI) {
      status.textContent = S.phase === 'defend' ? 'Rivale verteidigt…'
        : S.phase === 'throwin' ? 'Rivale legt dir noch Karten dazu…'
        : 'Rivale greift an…';
    }
    return;
  }

  if (S.phase === 'defend') {
    const canBeat = S.hands[HUMAN].some(isPlayable);
    status.textContent = canBeat
      ? 'Verteidige dich! Schlage die markierte Karte – oder nimm auf.'
      : 'Du kannst nicht schlagen – nimm die Karten auf.';
    btn.className = 'take';
    btn.textContent = 'Nehmen';
    btn.dataset.act = 'take';
  } else if (S.phase === 'attack') {
    if (S.table.length === 0) {
      status.textContent = 'Du greifst an – spiele eine Karte.';
    } else {
      status.textContent = 'Alles geschlagen. Lege eine passende Karte nach oder sag Bito.';
      btn.className = '';
      btn.textContent = 'Bito';
      btn.dataset.act = 'bito';
    }
  } else if (S.phase === 'throwin') {
    status.textContent = 'Rivale nimmt auf – du darfst noch passende Karten dazugeben.';
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

/* ---------- Spielablauf ---------- */

async function newGame() {
  busy = true;
  // Kurz auf die Pokémon-Bilder warten (höchstens 4 s, danach geht's auch ohne)
  const btn = $('#btn-start');
  btn.textContent = 'Lade Pokémon…';
  await Promise.race([imagesReady, sleep(4000)]);
  btn.textContent = 'Spiel starten';
  hideScreens();
  elCache = new Map();
  S.deck = shuffle([...ALL_CARDS]);
  S.trump = S.deck[0].suit;
  S.hands = [[], []];
  S.table = [];
  S.discard = [];
  S.phase = 'idle';
  S.firstRound = true;
  S.over = false;
  computeSizes();
  render();
  await sleep(250);
  toast(`Trumpf: ${SUITS[S.trump].icon} ${SUITS[S.trump].name}`, 1300);
  await sleep(700);

  await animateChange(() => {
    const ids = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      for (const p of [HUMAN, AI]) {
        const c = S.deck.pop();
        S.hands[p].push(c);
        ids.push(c.id);
      }
    }
    return ids;
  }, { stagger: 80 });

  // Wer den niedrigsten Trumpf hat, beginnt
  const low = p => Math.min(...S.hands[p].filter(isTrump).map(c => c.rank), 99);
  const lh = low(HUMAN), la = low(AI);
  let first;
  if (lh === 99 && la === 99) first = Math.random() < 0.5 ? HUMAN : AI;
  else first = lh < la ? HUMAN : AI;
  S.attacker = first;
  S.defender = 1 - first;
  S.phase = 'attack';
  await sleep(200);
  toast(first === HUMAN ? 'Du beginnst!' : 'Rivale beginnt!', 1200);
  await sleep(900);
  busy = false;
  loop();
}

async function loop() {
  if (S.over) return;
  const who = actor();

  if (who === AI) {
    busy = true;
    render();
    await sleep(S.phase === 'throwin' ? 550 : 750);
    await aiTurn();
    busy = false;
    return loop();
  }

  // Automatische Züge, wenn der Mensch nichts mehr legen kann
  if (S.phase === 'attack' && S.table.length > 0 && !S.hands[HUMAN].some(canAdd)) {
    busy = true;
    render();
    await sleep(700);
    toast('Bito!');
    await endRound(false);
    busy = false;
    return loop();
  }
  if (S.phase === 'throwin' && !S.hands[HUMAN].some(canAdd)) {
    busy = true;
    render();
    await sleep(500);
    await endRound(true);
    busy = false;
    return loop();
  }

  busy = false;
  render();
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
  await sleep(150);
  toast(S.attacker === HUMAN ? 'Dein Angriff!' : 'Rivale greift an!', 900);
  await sleep(400);
}

function checkGameOver() {
  if (S.deck.length > 0) return false;
  const humanOut = S.hands[HUMAN].length === 0;
  const aiOut = S.hands[AI].length === 0;
  if (!humanOut && !aiOut) return false;

  S.over = true;
  S.phase = 'idle';
  render();
  let result;
  if (humanOut && aiOut) result = 'draw';
  else result = humanOut ? 'win' : 'lose';
  saveStat(result);
  setTimeout(() => showGameOver(result), 500);
  return true;
}

/* ---------- Eingaben ---------- */

async function onCardTap(card, el) {
  if (busy || S.over) return;
  if (!S.hands[HUMAN].includes(card)) return;
  if (actor() !== HUMAN) return;

  if (!isPlayable(card)) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    if (navigator.vibrate) navigator.vibrate(30);
    return;
  }
  busy = true;
  if (S.phase === 'defend') await playDefend(card);
  else await playAttack(HUMAN, card);
  busy = false;
  loop();
}

async function onAction() {
  if (busy || S.over) return;
  const act = $('#action').dataset.act;
  if (!act) return;
  busy = true;
  if (act === 'take') {
    S.phase = 'throwin';
    toast('Du nimmst auf');
    await sleep(300);
  } else if (act === 'bito') {
    toast('Bito!');
    await endRound(false);
  } else if (act === 'done') {
    await endRound(true);
  }
  busy = false;
  loop();
}

/* ---------- Künstliche Intelligenz ---------- */

async function aiTurn() {
  const hand = S.hands[AI];
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
      toast('Rivale nimmt auf!');
      S.phase = 'throwin';
      await sleep(400);
      return;
    }
    return playDefend(choice);
  }

  if (S.phase === 'attack') {
    if (S.table.length === 0) return playAttack(AI, pickLead(hand));
    const c = pickAdd(hand);
    if (c) return playAttack(AI, c);
    toast('Bito!');
    return endRound(false);
  }

  if (S.phase === 'throwin') {
    const c = pickAdd(hand);
    if (c) return playAttack(AI, c);
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
    win:  ['🏆', 'Gewonnen!', 'Du hast alle Karten losgeworden. Der Rivale ist der Durak!'],
    lose: ['🤡', 'Du bist der Durak!', 'Du hattest am Ende noch Karten auf der Hand. Revanche?'],
    draw: ['🤝', 'Unentschieden', 'Beide sind gleichzeitig alle Karten losgeworden.'],
  }[result];
  $('#over-emoji').textContent = txt[0];
  $('#over-title').textContent = txt[1];
  $('#over-text').textContent = txt[2];
  $('#screen-over').classList.remove('hidden');
}

/* ---------- Start ---------- */

$('#action').addEventListener('click', onAction);
$('#btn-start').addEventListener('click', newGame);
$('#btn-again').addEventListener('click', newGame);
$('#btn-new').addEventListener('click', () => {
  if (busy) return;
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

window.addEventListener('resize', () => {
  computeSizes();
  if (!busy) render();
});

computeSizes();
showStats();
render();
