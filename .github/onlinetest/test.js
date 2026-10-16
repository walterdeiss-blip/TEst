// Echter Online-Test: Gastgeber und Gast auf der veröffentlichten Seite, über den öffentlichen PeerJS-Server.
const { chromium } = require('playwright');
const URL = process.env.GAME_URL || 'https://walterdeiss-blip.github.io/TEst/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const log = [];
  const blockRtc = process.env.BLOCK_RTC === '1';
  console.log(blockRtc ? 'Direkte Verbindung blockiert (wie im Mobilfunk) → Server-Ausweichweg' : 'Normale Verbindung');
  const mk = async t => {
    const p = await ctx.newPage();
    if (blockRtc) await p.addInitScript(() => {
      const O = window.RTCPeerConnection;
      window.RTCPeerConnection = function (cfg) { return new O({ ...(cfg || {}), iceServers: [], iceTransportPolicy: 'relay' }); };
      window.RTCPeerConnection.prototype = O.prototype;
    });
    p.on('console', m => log.push(`[${t} console.${m.type()}] ${m.text()}`));
    p.on('pageerror', e => log.push(`[${t} FEHLER] ${e.message}`));
    p.on('requestfailed', r => log.push(`[${t} Anfrage fehlgeschlagen] ${r.url()} ${r.failure() && r.failure().errorText}`));
    return p;
  };
  const H = await mk('Gastgeber'), G = await mk('Gast');
  await H.goto(URL + '?t=' + Date.now());
  await H.click('#btn-online'); await H.fill('#player-name', 'Host'); await H.click('#btn-host');
  let code = '';
  for (let i = 0; i < 30; i++) {
    await H.waitForTimeout(500);
    code = (await H.textContent('#room-code')).trim();
    if (/^[A-Z0-9]{5}$/.test(code)) break;
  }
  console.log('Spielcode beim Gastgeber:', JSON.stringify(code), '| Meldung:', await H.textContent('#online-msg'));
  if (!/^[A-Z0-9]{5}$/.test(code)) { console.log(log.join('\n')); console.log('ERGEBNIS: Gastgeber bekommt keinen Spielcode'); process.exit(1); }
  await G.goto(URL + '?join=' + code);
  // Einladungslink sucht automatisch, wenn der Name schon gespeichert ist – sonst selbst tippen
  await G.waitForTimeout(800);
  if (await G.isEnabled('#btn-join') && await G.isVisible('#btn-join')) { await G.fill('#player-name', 'Gast'); await G.click('#btn-join'); }
  let found = false, ok = false;
  for (let i = 0; i < 60 && !found; i++) {
    await G.waitForTimeout(500);
    found = await G.isVisible('#join-found');
  }
  console.log('1) Gruppe gefunden:', found, '|', found ? (await G.innerText('#join-found')).replace(/\n+/g, ' | ') : await G.textContent('#online-msg'));
  console.log('   Gastgeber sieht:', await H.textContent('#online-status'));
  if (found) {
    await G.click('#btn-confirm-join');
    for (let i = 0; i < 60; i++) {
      await G.waitForTimeout(500);
      if ((await G.textContent('#online-status')).includes('in der Gruppe')) { ok = true; break; }
    }
    if (ok) console.log('2) Beitritt bestätigt über:', await G.evaluate(() => transport.relay ? 'Server-Ausweichweg' : 'direkte Verbindung'));
  }
  console.log('Gast-Status:', await G.textContent('#online-status'), '| Gast-Meldung:', await G.textContent('#online-msg'));
  console.log('Lobby beim Gastgeber:', await H.$$eval('#lobby-list li', l => l.map(x => x.textContent).join(', ')));
  if (ok) {
    await H.click('#btn-host-start');
    await G.waitForTimeout(8000);
    console.log('Spiel läuft beim Gast:', await G.evaluate(() => S.phase !== 'idle' ? S.players.map(p => p.name).join(', ') : 'nein'));
  }
  console.log('--- Browser-Protokoll ---\n' + log.filter(l => !/favicon/.test(l)).slice(-40).join('\n'));
  console.log(ok ? 'ERGEBNIS: Einladen funktioniert' : 'ERGEBNIS: Gast kann nicht beitreten');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
