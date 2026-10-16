// Prüft, welche Nachrichten der öffentliche PeerJS-Server zwischen zwei Teilnehmern weiterleitet.
const BASE = 'wss://0.peerjs.com/peerjs?key=peerjs';
const rnd = () => Math.random().toString(36).slice(2, 10);
function client(id) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${BASE}&id=${id}&token=${rnd()}&version=1.5.5`);
    const c = { ws, id, got: [], closed: null };
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.type === 'OPEN') res(c); else c.got.push(d); };
    ws.onclose = e => { c.closed = `${e.code} ${e.reason}`; };
    ws.onerror = () => rej(new Error('ws error ' + id));
    setTimeout(() => rej(new Error('timeout ' + id)), 10000);
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const variants = {
  candidate_plain: (dst, m) => ({ type: 'CANDIDATE', dst, payload: { pokedurakRelay: 1, m } }),
  candidate_like: (dst, m) => ({ type: 'CANDIDATE', dst, payload: { type: 'data', connectionId: 'dc_relay', candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 }, pokedurakRelay: 1, m } }),
  answer_like: (dst, m) => ({ type: 'ANSWER', dst, payload: { type: 'data', connectionId: 'dc_relay', sdp: { type: 'answer', sdp: '' }, pokedurakRelay: 1, m } }),
  offer_like: (dst, m) => ({ type: 'OFFER', dst, payload: { type: 'data', connectionId: 'dc_relay', sdp: { type: 'offer', sdp: '' }, pokedurakRelay: 1, m } }),
  leave: (dst, m) => ({ type: 'LEAVE', dst, payload: { pokedurakRelay: 1, m } }),
};
(async () => {
  for (const [name, mk] of Object.entries(variants)) {
    try {
      const a = await client('pdtest-a-' + rnd()), b = await client('pdtest-b-' + rnd());
      for (let i = 0; i < 5; i++) a.ws.send(JSON.stringify(mk(b.id, { t: 'probe', i, pad: 'x'.repeat(i === 4 ? 3000 : 10) })));
      await wait(3000);
      const ok = b.got.filter(d => d.payload && d.payload.pokedurakRelay).length;
      console.log(`${name}: B hat ${ok}/5 bekommen | A geschlossen: ${a.closed} | B geschlossen: ${b.closed} | A bekam: ${JSON.stringify(a.got).slice(0, 200)} | B sonst: ${JSON.stringify(b.got.filter(d => !(d.payload && d.payload.pokedurakRelay))).slice(0, 200)}`);
      a.ws.close(); b.ws.close();
    } catch (e) { console.log(name, 'FEHLER', e.message); }
  }
  // Ausweich-Kandidaten: öffentliche MQTT-Broker über WebSocket erreichbar?
  for (const url of ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt']) {
    await new Promise(res => {
      const t0 = Date.now();
      const ws = new WebSocket(url, ['mqtt']);
      ws.onopen = () => { console.log('MQTT erreichbar', url, Date.now() - t0, 'ms'); ws.close(); res(); };
      ws.onerror = () => { console.log('MQTT nicht erreichbar', url); res(); };
      setTimeout(res, 8000);
    });
  }
  process.exit(0);
})();
