// Kör drag.js mot en stubbad DOM + THREE och kontrollerar att ett drag verkligen
// flyttar händelsen, att ett klick inte gör det, och att Ångra lägger tillbaka den.
// Körs med: node tools/test-drag.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fel = 0;
const ok = (namn, villkor, extra) => { console.log((villkor ? 'OK   ' : 'FEL  ') + namn + (villkor || extra == null ? '' : ' → ' + extra)); if (!villkor) fel++; };

// ---------------------------------------------------------------- stubbar
const V3 = (x, y, z) => ({ x, y, z, clone() { return V3(this.x, this.y, this.z); }, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
const THREE = {
  Raycaster: function () { this.setFromCamera = () => {}; this.intersectObjects = (groups) => scen.traff(groups); },
  Vector2: function () { this.set = () => {}; },
  TorusGeometry: function () {}, MeshStandardMaterial: function () {},
  Mesh: function () { this.rotation = { x: 0 }; this.position = V3(0, 0, 0); this.visible = true; },
};

// en enkel DOM: bara det drag.js rör
const lyssnare = { window: [], canvas: [] };
function nyEl(id) {
  return {
    id, className: '', innerHTML: '', textContent: '', style: {}, _barn: [], _lyss: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    appendChild(b) { this._barn.push(b); return b; },
    addEventListener(t, f) { (this._lyss[t] = this._lyss[t] || []).push(f); },
    querySelector(sel) { return this._barn.find((b) => b.tag === sel) || (sel === 'span' ? this._span : sel === 'button' ? this._btn : null); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    setPointerCapture() {}, releasePointerCapture() {},
  };
}
const canvas = nyEl('scene');
const body = nyEl('body');
const doc = {
  body,
  createElement() { const el = nyEl(''); el._span = nyEl('span'); el._btn = nyEl('button'); return el; },
  querySelector(sel) { return sel === '#scene' ? canvas : (sel === '#dragUndo' ? doc._undo || null : null) },
};

// ---------------------------------------------------------------- appen
const tiles = new Map();
for (const [key, m, day] of [['2026-03-05', 2, 5], ['2026-03-12', 2, 12], ['2026-03-20', 2, 20]]) tiles.set(key, { key, m, day, special: null, pos: V3(day, 0.4, m) });
tiles.set('2026-2-start', { key: '2026-2-start', m: 2, day: null, special: 'start', pos: V3(0, 0.4, 0) });

const S = { events: { '2026-03-05': [{ id: 'e1', titel: 'Läkarbesök', klar: false }, { id: 'e2', titel: 'Gym', klar: false }] }, arliga: [{ id: 'a1', md: '03-12', titel: 'Mammas födelsedag', typ: 'fodelsedag' }], arligaKlar: {} };
const holder = { userData: { eventKey: '2026-03-05' }, position: V3(5, 0.4, 2), traverse() {} };
const world = {
  view: 'lutande', focusMonth: 2, camera: {}, tiles, fxGroup: { add() {} },
  npcGroup: { children: [holder] }, boardGroup: {}, figState: { queue: [] },
  setNpcMonth() { world._rebuilt = (world._rebuilt || 0) + 1; },
};
// vad raycasten "ser": styrs av scen.lage
const scen = {
  lage: 'figur',
  traff(groups) {
    if (groups[0] === world.npcGroup) return scen.lage === 'figur' ? [{ object: { userData: { eventKey: '2026-03-05' } } }] : [];
    return scen.mal ? [{ object: { userData: { tile: scen.mal } } }] : [];
  },
};
const toasts = [], ljud = [];
const KB_APP = {
  world, state: S, toast: (t) => toasts.push(t), sound: (k) => ljud.push(k),
  goTo: (k, o) => { KB_APP._goTo = [k, o]; },
  eventsOn: (key) => {
    const ut = (S.events[key] || []).slice();
    for (const r of S.arliga) if (`2026-${r.md}` === key) ut.push({ id: 'r:' + r.id, titel: r.titel, klar: !!S.arligaKlar['2026:' + r.id] });
    return ut;
  },
  moveEvent: laddaMoveEvent(),   // den riktiga funktionen, hämtad ur js/app.js
};

// Klipper ut moveEvent ur js/app.js och kör den skarpt mot stubbarna ovan, så att
// testet inte kan gå igenom på en kopia som driftat ifrån appen.
function laddaMoveEvent() {
  const kod = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const start = kod.indexOf('  function moveEvent(');
  const slut = kod.indexOf('\n  function toggleEvent(', start);
  if (start < 0 || slut < 0) { console.log('FEL  hittade inte moveEvent i js/app.js'); process.exit(1); }
  const sandlada = { S, save: () => {}, refreshTiles: () => {}, refreshAllTiles: () => {} };
  vm.createContext(sandlada);
  return vm.runInContext(`${kod.slice(start, slut)}\nmoveEvent;`, sandlada, { filename: 'app.js#moveEvent' });
}

// ---------------------------------------------------------------- kör drag.js
const win = {
  THREE, KB_APP, KB_DATA: { MANADER: ['Januari', 'Februari', 'Mars'] },
  document: doc, setTimeout, clearTimeout, Date, Math, console,
  addEventListener: (t, f) => (lyssnare.window[t] = lyssnare.window[t] || []).push(f),
};
win.window = win;
vm.createContext(win);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'drag.js'), 'utf8'), win, { filename: 'drag.js' });
ok('drag.js kopplade sina lyssnare', !!(lyssnare.window.pointerdown && lyssnare.window.pointermove && lyssnare.window.pointerup));

let stoppade = 0;
const pek = (typ, x, y) => {
  const e = { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', stopPropagation() { stoppade++; } };
  for (const f of lyssnare.window[typ] || []) f(e);
};
const dra = (fran, till, malBricka) => { scen.mal = null; pek('pointerdown', ...fran); scen.mal = malBricka; pek('pointermove', ...till); pek('pointerup', ...till); };

// 1) drag till en annan dag flyttar den översta händelsen
dra([500, 400], [620, 430], '2026-03-20');
ok('greppet stoppade kamerasnurren', stoppade >= 3, stoppade);
ok('händelsen flyttades till måldagen', (S.events['2026-03-20'] || []).some((e) => e.id === 'e1'));
ok('händelsen ligger inte kvar på ursprungsdagen', !(S.events['2026-03-05'] || []).some((e) => e.id === 'e1'));
ok('den andra händelsen blev kvar', (S.events['2026-03-05'] || []).some((e) => e.id === 'e2'));
ok('toast nämner titel och måldag', /Läkarbesök/.test(toasts.join(' ')) && /20 mars/.test(toasts.join(' ')), toasts.join(' | '));
ok('ångra-raden visas', !!doc.body._barn.find((b) => b.id === 'dragUndo' && b.classList.contains('on')));

// 2) Ångra lägger tillbaka den
const bar = doc.body._barn.find((b) => b.id === 'dragUndo');
bar._btn._lyss.click[0]();
ok('Ångra la tillbaka händelsen', (S.events['2026-03-05'] || []).some((e) => e.id === 'e1') && !(S.events['2026-03-20'] || []).some((e) => e.id === 'e1'));
ok('Ångra behöll ordningen (e1 först)', (S.events['2026-03-05'][0] || {}).id === 'e1', JSON.stringify(S.events['2026-03-05'].map((e) => e.id)));

// 3) kort grepp utan rörelse = klick, öppnar dagen i stället
KB_APP._goTo = null; const fore = JSON.stringify(S.events);
scen.mal = null; pek('pointerdown', 500, 400); pek('pointerup', 502, 401);
ok('litet grepp öppnar dagen i stället för att flytta', KB_APP._goTo && KB_APP._goTo[0] === '2026-03-05' && KB_APP._goTo[1].open);
ok('litet grepp ändrade ingenting', JSON.stringify(S.events) === fore);

// 4) släpp på START-brickan flyttar inte
toasts.length = 0;
dra([500, 400], [640, 440], '2026-2-start');
ok('släpp på START flyttar ingenting', JSON.stringify(S.events) === fore);
ok('START ger en förklarande toast', /dagbricka/.test(toasts.join(' ')), toasts.join(' | '));

// 5) släpp på samma bricka gör ingenting, utan gnäll
toasts.length = 0;
dra([500, 400], [510, 415], '2026-03-05');
ok('släpp på samma dag ändrar ingenting', JSON.stringify(S.events) === fore);
ok('släpp på samma dag ger ingen toast', toasts.length === 0, toasts.join(' | '));

// 6) återkommande händelse: figuren på 12 mars visar mammas födelsedag
holder.userData.eventKey = '2026-03-12';
scen.traff = (groups) => (groups[0] === world.npcGroup ? [{ object: { userData: { eventKey: '2026-03-12' } } }] : (scen.mal ? [{ object: { userData: { tile: scen.mal } } }] : []));
toasts.length = 0;
dra([500, 400], [660, 450], '2026-03-20');
ok('återkommande händelse bytte datum', S.arliga[0].md === '03-20', S.arliga[0].md);
ok('toast säger att den gäller varje år', /varje år/.test(toasts.join(' ')), toasts.join(' | '));

// 7) helhetsvyn rör inte figurerna
world.view = 'hela'; const fore2 = JSON.stringify(S.arliga);
stoppade = 0; dra([500, 400], [660, 450], '2026-03-05');
ok('helhetsvyn låter kameran vara i fred', stoppade === 0 && JSON.stringify(S.arliga) === fore2);

console.log(fel ? `\n${fel} test misslyckades` : '\nAlla test gick igenom');
process.exit(fel ? 1 : 0);
