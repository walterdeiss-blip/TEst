/* Padel – Grafiken: Abzeichen, Schlag-Diagramme, Momentum-Kurve, Konfetti. */
'use strict';

(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------- Abzeichen ---------- */

  // Sechseck-Plakette; Farbe nach Stufe (1 Türkis, 2 Silber-Blau, 3 Gold), gesperrt = grau mit Schloss
  function badgeSvg(b, { locked = false, size = 64 } = {}) {
    const fill = locked ? 'url(#grad-lock)' : `url(#grad-t${b.tier})`;
    return `<svg class="badge ${locked ? 'locked' : 't' + b.tier}" viewBox="0 0 64 72" width="${size}" height="${size * 72 / 64}" role="img" aria-label="${esc(b.name)}${locked ? ' (noch gesperrt)' : ''}">
      <path d="M32 3l26 15v32L32 69 6 50V18z" fill="${fill}" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
      <path d="M32 9l21 12v26L32 61 11 47V21z" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>
      <path d="M12 22l20-11 20 11" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2" stroke-linecap="round"/>
      <svg x="18" y="20" width="28" height="28" class="badge-ico"><use href="#i-${locked ? 'lock' : b.icon}"/></svg>
    </svg>`;
  }

  /* ---------- Schlag-Lexikon ---------- */

  // Seitenansicht des Courts: 20 m lang (x 14–306), Glas 3 m, Gitter bis 4 m, Netz in der Mitte.
  const STROKES = [
    {
      id: 'volea', name: 'Volea', de: 'Volley',
      text: 'Flugball am Netz, ohne dass der Ball aufspringt. Kurz ausholen, Schläger vor dem Körper.',
      tip: 'Auf die Füße der Gegner oder in die Mitte zwischen beide spielen.',
      player: [124, 'net'], hit: [134, 100],
      out: 'M134 100 Q178 92 228 130 Q240 118 250 112',
    },
    {
      id: 'globo', name: 'Globo', de: 'Lob',
      text: 'Hoher Ball über die Netzspieler hinweg in den hinteren Bereich – der wichtigste Verteidigungsschlag.',
      tip: 'Ein guter Globo schickt die Gegner ans Glas und gibt euch das Netz zurück.',
      player: [40], hit: [48, 116],
      out: 'M48 116 Q150 -18 268 130 Q290 108 306 96',
    },
    {
      id: 'bandeja', name: 'Bandeja', de: 'kontrollierter Überkopfball',
      text: 'Überkopfball mit Slice aus dem Halbfeld. Ziel ist nicht der direkte Punkt, sondern die Netzposition zu halten.',
      tip: 'Tief ins Feld spielen – der Ball soll nur flach vom Glas zurückkommen.',
      player: [98], hit: [106, 70],
      out: 'M106 70 Q190 66 262 130 L306 112 Q296 118 288 130',
    },
    {
      id: 'vibora', name: 'Víbora', de: 'aggressiver Überkopfball',
      text: 'Die schärfere Schwester der Bandeja: mehr Tempo und Seitenschnitt, der Ball springt flach vom Seitenglas weg.',
      tip: 'Seitlich am Ball vorbeischlagen, Kontaktpunkt etwas tiefer als bei der Bandeja.',
      player: [102], hit: [110, 74],
      out: 'M110 74 Q178 82 252 130 L306 124 Q298 127 292 130',
    },
    {
      id: 'remate', name: 'Remate por tres', de: 'Smash über die Rückwand',
      text: 'Kraftvoller Schmetterball, der so hoch abspringt, dass er über die Rückwand aus dem Court fliegt (por cuatro: über die Seite).',
      tip: 'Nur bei kurzen, hohen Bällen nahe am Netz – sonst lieber Bandeja.',
      player: [116, 'net'], hit: [122, 62],
      out: 'M122 62 L226 130 Q286 40 316 12',
    },
    {
      id: 'bajada', name: 'Bajada de pared', de: 'Angriff nach der Rückwand',
      text: 'Ein hoher Ball prallt von der eigenen Rückwand ab; im Herunterfallen wird er angegriffen.',
      tip: 'Mit dem Ball mitgehen und ihn auf Schulterhöhe treffen.',
      player: [54], hit: [60, 84],
      inc: 'M220 40 Q80 44 14 92 L58 82',
      out: 'M60 84 Q150 86 250 130',
    },
    {
      id: 'chiquita', name: 'Chiquita', de: 'kurzer, weicher Ball',
      text: 'Weicher, flacher Ball auf die Füße der Netzspieler – sie müssen von unten spielen.',
      tip: 'Danach selbst ans Netz vorrücken.',
      player: [66], hit: [74, 120],
      out: 'M74 120 Q148 96 184 130',
    },
    {
      id: 'pared', name: 'Salida de pared', de: 'Ball aus der Rückwand',
      text: 'Den Ball nach dem Aufprall von der eigenen Rückwand zurückkommen lassen und dann spielen – die typische Padel-Verteidigung.',
      tip: 'Früh seitlich drehen und dem Ball Platz lassen.',
      player: [44], hit: [52, 112],
      inc: 'M230 56 Q120 70 72 130 Q36 104 14 96 L46 110',
      out: 'M52 112 Q150 26 262 130',
    },
  ];

  function figure(x) {
    return `<g class="fig"><circle cx="${x}" cy="92" r="5"/><path d="M${x} 97v16M${x} 113l-6 16M${x} 113l6 16M${x} 102l-7 7"/></g>`;
  }

  function strokeSvg(s) {
    const [px] = s.player;
    const [hx, hy] = s.hit;
    return `<svg class="stroke-svg" viewBox="0 0 320 140" role="img" aria-label="${esc(s.name)}: Flugbahn des Balls in der Seitenansicht">
      <rect x="14" y="70" width="292" height="60" class="air"/>
      <path class="glass" d="M14 130V86M306 130V86"/>
      <path class="fence" d="M14 86V70M306 86V70"/>
      <path class="floor" d="M6 130H314"/>
      <path class="net" d="M160 130V116"/><circle class="net-top" cx="160" cy="116" r="2"/>
      <g class="opp"><circle cx="214" cy="92" r="5"/><path d="M214 97v16M214 113l-6 16M214 113l6 16"/>
        <circle cx="270" cy="92" r="5"/><path d="M270 97v16M270 113l-6 16M270 113l6 16"/></g>
      ${figure(px)}
      <path class="arm" d="M${px} 102L${hx} ${hy + 6}"/>
      <ellipse class="racket" cx="${hx}" cy="${hy}" rx="5" ry="7" transform="rotate(-25 ${hx} ${hy})"/>
      ${s.inc ? `<path class="inc" d="${s.inc}"/>` : ''}
      <path class="out" d="${s.out}" marker-end="url(#arrow-ball)"/>
      <circle class="ball" cx="${hx + 6}" cy="${hy - 4}" r="4"/>
    </svg>`;
  }

  /* ---------- Momentum-Kurve ---------- */

  // Punktdifferenz im Verlauf: oberhalb der Null führt Team A, unterhalb Team B.
  function momentumSvg(st, names) {
    const W = 300, H = 130, P = { l: 8, r: 8, t: 18, b: 16 };
    const v = st.momentum;
    const ext = Math.max(3, ...v.map(Math.abs));
    const x = i => P.l + i * (W - P.l - P.r) / Math.max(1, v.length - 1);
    const y = d => P.t + (ext - d) * (H - P.t - P.b) / (2 * ext);
    const pts = v.map((d, i) => `${x(i).toFixed(1)},${y(d).toFixed(1)}`).join(' ');
    const area = `M${x(0)},${y(0)} L${pts.replace(/ /g, ' L')} L${x(v.length - 1)},${y(0)} Z`;
    const id = 'mclip' + Math.random().toString(36).slice(2, 7);
    return `<svg id="momentum-chart" class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Momentum über ${v.length - 1} Punkte">
      <defs>
        <clipPath id="${id}-a"><rect x="0" y="0" width="${W}" height="${y(0)}"/></clipPath>
        <clipPath id="${id}-b"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath>
      </defs>
      ${st.setEnds.slice(0, -1).map((i, k) => `<line class="set-end" x1="${x(i)}" x2="${x(i)}" y1="${P.t - 6}" y2="${H - P.b}"/><text class="axis" x="${x(i) + 3}" y="${P.t - 8}">Satz ${k + 2}</text>`).join('')}
      <path class="area-a" d="${area}" clip-path="url(#${id}-a)"/>
      <path class="area-b" d="${area}" clip-path="url(#${id}-b)"/>
      <line class="zero" x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}"/>
      <polyline class="line" points="${pts}"/>
      <text class="lbl-a" x="${P.l}" y="${P.t - 6}">▲ ${esc(names[0].join(' & '))}</text>
      <text class="lbl-b" x="${P.l}" y="${H - 3}">▼ ${esc(names[1].join(' & '))}</text>
      <g class="hover hidden"><line class="cross" y1="${P.t}" y2="${H - P.b}"/><circle class="dot" r="4.5"/></g>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
    </svg>`;
  }

  // Fadenkreuz + Tooltip für Liniendiagramme (Polyline mit Klasse .line)
  function bindChart(svg, tip, label) {
    if (!svg || !tip) return;
    const W = svg.viewBox.baseVal.width;
    const pts = svg.querySelector('.line').getAttribute('points').split(' ').map(p => p.split(',').map(Number));
    const hover = svg.querySelector('.hover');
    const show = e => {
      const r = svg.getBoundingClientRect();
      const vx = (e.clientX - r.left) * W / r.width;
      let i = 0;
      pts.forEach((p, k) => { if (Math.abs(p[0] - vx) < Math.abs(pts[i][0] - vx)) i = k; });
      const [px, py] = pts[i];
      hover.classList.remove('hidden');
      ['x1', 'x2'].forEach(a => hover.querySelector('.cross').setAttribute(a, px));
      hover.querySelector('.dot').setAttribute('cx', px);
      hover.querySelector('.dot').setAttribute('cy', py);
      tip.innerHTML = label(i);
      tip.classList.remove('hidden');
      tip.style.left = `${Math.min(r.width - 130, Math.max(0, px * r.width / W - 65))}px`;
    };
    const hide = () => { hover.classList.add('hidden'); tip.classList.add('hidden'); };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
  }

  /* ---------- Konfetti mit Padelbällen ---------- */

  function confetti(ms = 2600) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    // Ein offener Dialog liegt über allem – dort hinein, sonst wäre das Konfetti verdeckt
    (document.querySelector('dialog[open]') || document.body).appendChild(c);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const colors = ['#d9f43a', '#2fd3bd', '#ff9a4d', '#ffffff', '#3b9bff'];
    const parts = Array.from({ length: 90 }, (_, i) => ({
      x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35,
      vx: (Math.random() - .5) * 9, vy: -Math.random() * 11 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3,
      ball: i % 6 === 0, size: i % 6 === 0 ? 7 + Math.random() * 4 : 5 + Math.random() * 5,
      color: colors[i % colors.length],
    }));
    let start = null;
    const frame = now => {
      start = start ?? now;
      const t = now - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.min(1, (ms - t) / 500);
      parts.forEach(p => {
        p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        if (p.ball) {
          ctx.fillStyle = '#d9f43a';
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(-p.size, 0, p.size * .8, -.9, .9); ctx.stroke();
          ctx.beginPath(); ctx.arc(p.size, 0, p.size * .8, Math.PI - .9, Math.PI + .9); ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      });
      if (t < ms) requestAnimationFrame(frame); else c.remove();
    };
    setTimeout(() => requestAnimationFrame(frame), 220);  // erst nach der Dialog-Animation
  }

  root.PadelGraphics = { badgeSvg, STROKES, strokeSvg, momentumSvg, bindChart, confetti };
})(window);
