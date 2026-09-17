// Kalenderbrädet — limmet: tillstånd, poäng, dagens kort, figur, miljö, konto & synk.
(function () {
  'use strict';
  const D = window.KB_DATA, W = window.KB_WORLD;
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const LS_KEY = 'kalenderbradet.v1';
  const API = '/api/sync';

  // ------------------------------------------------------------ tillstånd
  const todayKey = () => { const d = new Date(); return W.keyOf(d.getFullYear(), d.getMonth(), d.getDate()); };
  const defaultFigure = () => ({ ...W.resolvePreset(D.FIGURER[0]), preset: 'lakare', harstil: D.FIGURER[0].harstil, stil: D.FIGURER[0].stil });
  const defaults = () => ({
    version: 1, events: {}, arliga: [], arligaKlar: {},
    figur: defaultFigure(), miljo: { land: 'sverige', morkt: 'auto', rekvisita: true, lutning: 25, ljud: true },
    poang: { total: 0, streak: 0, senastOppnad: null, besokta: {}, klara: 0, manad: {}, bonus: {}, fodelsedagar: {}, nyar: {} },
    konto: { email: '', pin: '' }, vy: 'lutande', updatedAt: 0,
  });
  let S = load();
  function load() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) { const s = JSON.parse(raw); return deepMerge(defaults(), s); } } catch (e) { console.warn('kunde inte läsa lokalt', e); }
    return defaults();
  }
  function deepMerge(a, b) { for (const k of Object.keys(b || {})) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]); else a[k] = b[k]; } return a; }
  let saveTimer = null, syncTimer = null;
  function save(opts) {
    S.updatedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { toast('Kunde inte spara lokalt: ' + e.message); }
    if (S.konto.email && !(opts && opts.noSync)) { clearTimeout(syncTimer); syncTimer = setTimeout(() => pushServer(true), 1800); }
  }

  // ------------------------------------------------------------ händelser
  const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function eventsForYear(y) {
    const out = {};
    for (const [k, list] of Object.entries(S.events)) if (k.startsWith(y + '-') && list.length) out[k] = list.map((e) => ({ ...e }));
    for (const r of S.arliga) {
      const k = `${y}-${r.md}`;
      if (!W.daysIn) continue;
      (out[k] = out[k] || []).push({ id: 'r:' + r.id, titel: r.titel, tid: r.tid || '', typ: r.typ, beskrivning: r.beskrivning || '', arligen: true, klar: !!S.arligaKlar[`${y}:${r.id}`] });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => (a.tid || '99').localeCompare(b.tid || '99'));
    return out;
  }
  function eventsOn(key) { return eventsForYear(key.slice(0, 4))[key] || []; }
  function addEvent(key, ev) {
    if (ev.arligen) { S.arliga.push({ id: uid(), md: key.slice(5), titel: ev.titel, tid: ev.tid, typ: ev.typ, beskrivning: ev.beskrivning }); }
    else { (S.events[key] = S.events[key] || []).push({ id: uid(), titel: ev.titel, tid: ev.tid, typ: ev.typ, beskrivning: ev.beskrivning, klar: false }); }
    save(); refreshTiles([key]);
  }
  function removeEvent(key, id) {
    if (id.startsWith('r:')) { const rid = id.slice(2); S.arliga = S.arliga.filter((r) => r.id !== rid); for (const k of Object.keys(S.arligaKlar)) if (k.endsWith(':' + rid)) delete S.arligaKlar[k]; save(); refreshAllTiles(); return; }
    S.events[key] = (S.events[key] || []).filter((e) => e.id !== id); if (!S.events[key].length) delete S.events[key];
    save(); refreshTiles([key]);
  }
  // flyttar en händelse till en annan dag (js/drag.js drar figuren dit).
  // Returnerar { titel, arligen, undo } eller null om den inte gick att flytta.
  function moveEvent(fromKey, id, toKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toKey) || fromKey === toKey) return null;
    if (id.startsWith('r:')) {
      const r = S.arliga.find((x) => x.id === id.slice(2)); if (!r) return null;
      const fore = r.md; r.md = toKey.slice(5);
      save(); refreshAllTiles();
      return { titel: r.titel, arligen: true, undo: () => { r.md = fore; save(); refreshAllTiles(); } };
    }
    const lista = S.events[fromKey] || [], i = lista.findIndex((e) => e.id === id);
    if (i < 0) return null;
    const ev = lista[i];
    lista.splice(i, 1); if (!lista.length) delete S.events[fromKey];
    (S.events[toKey] = S.events[toKey] || []).push(ev);
    save(); refreshTiles([fromKey, toKey]);
    return { titel: ev.titel || 'Händelsen', arligen: false, undo: () => {
      const efter = S.events[toKey] || [], j = efter.findIndex((e) => e.id === id);
      if (j >= 0) efter.splice(j, 1);
      if (!efter.length) delete S.events[toKey];
      (S.events[fromKey] = S.events[fromKey] || []).splice(i, 0, ev);
      save(); refreshTiles([fromKey, toKey]);
    } };
  }
  function toggleEvent(key, id, klar) {
    if (id.startsWith('r:')) { const k = `${key.slice(0, 4)}:${id.slice(2)}`; if (klar) S.arligaKlar[k] = true; else delete S.arligaKlar[k]; }
    else { const e = (S.events[key] || []).find((x) => x.id === id); if (e) e.klar = klar; }
    S.poang.klara += klar ? 1 : -1;
    givePoints(klar ? 25 : -25, klar ? 'Avbockat' : 'Ångrat');
    save(); refreshTiles([key]);
  }

  // ------------------------------------------------------------ 3D
  const canvas = $('#scene');
  let world, currentKey = todayKey(), viewYear = new Date().getFullYear();
  function refreshTiles(keys) { world.setEvents(eventsForYear(viewYear), keys.filter((k) => k.startsWith(viewYear + '-'))); if (dayOpen()) renderDay(); updateStats(); }
  function refreshAllTiles() { world.setEvents(eventsForYear(viewYear)); if (dayOpen()) renderDay(); updateStats(); }
  function buildYear(y) {
    viewYear = y; world.buildYear(y, eventsForYear(y), todayKey());
    const k = currentKey.startsWith(y + '-') ? currentKey : W.keyOf(y, 0, 1);
    world.placeAt(k); currentKey = k; updateMonthLabel();
  }
  function init3d() {
    world = new W.World(canvas, {
      onTileClick: (hit) => {
        if (hit.month != null) { if (world.view === 'hela') setView('lutande'); world.setFocusMonth(hit.month); const k = W.keyOf(viewYear, hit.month, 1); goTo(k); return; }
        if (hit.tile) { goTo(hit.tile, { open: !hit.special }); }
      },
      onHop: () => sound('hop'),
      onArrive: (rec, last) => { onArrive(rec); if (last) { currentKey = rec.key; updateMonthLabel(); if (pendingOpen) { pendingOpen = false; openDay(); } } },
    });
    applyEnvironment(); applyFigure();
    buildYear(viewYear);
    setView(S.vy || 'lutande', true);
    world.setTilt(S.miljo.lutning || 25);
    setTimeout(() => $('#splash').classList.add('hide'), 600);
  }
  let pendingOpen = false;
  function goTo(key, o) {
    o = o || {};
    if (!key.startsWith(viewYear + '-') && /^\d{4}-\d{2}-\d{2}$/.test(key)) { buildYear(Number(key.slice(0, 4))); }
    pendingOpen = !!o.open;
    if (world.currentKey() === key && !world.figState.queue.length) { currentKey = key; updateMonthLabel(); if (o.open) { pendingOpen = false; openDay(); } return; }
    world.moveTo(key);
  }
  function stepDays(n) {
    const rec = world.tiles.get(currentKey); if (!rec) return;
    let d;
    if (rec.day) d = new Date(viewYear, rec.m, rec.day + n);
    else d = new Date(viewYear, rec.m, (n > 0 ? 1 : W.daysIn(viewYear, rec.m)));
    const k = W.keyOf(d.getFullYear(), d.getMonth(), d.getDate());
    goTo(k);
  }
  function onArrive(rec) {
    if (rec.special === 'start') { const mk = `${viewYear}-${rec.m}`; if (!S.poang.manad[mk]) { S.poang.manad[mk] = true; givePoints(50, 'Månadsbonus'); sound('bonus'); save(); } return; }
    if (rec.special === 'bonus') { const mk = `${viewYear}-${rec.m}`; if (!S.poang.bonus[mk]) { S.poang.bonus[mk] = true; givePoints(30, 'Bonusbrickan'); sound('bonus'); save(); } return; }
    let changed = false;
    if (!S.poang.besokta[rec.key]) { S.poang.besokta[rec.key] = true; givePoints(10, 'Ny dag'); changed = true; }
    const evs = eventsOn(rec.key);
    if (evs.some((e) => e.typ === 'fodelsedag')) {
      world.confetti(rec.pos.clone(), 260); sound('confetti');
      if (!S.poang.fodelsedagar[rec.key]) { S.poang.fodelsedagar[rec.key] = true; givePoints(100, '🎂 Födelsedag!'); changed = true; }
      else toast('🎂 Grattis igen!');
    }
    if (arNyarsafton(rec.key)) firaNyar(rec.key, rec.pos);
    if (changed) save();
    world.setFocusMonth(rec.m);
  }

  // ------------------------------------------------------------ poäng
  function level() { return Math.floor(Math.sqrt(Math.max(0, S.poang.total) / 100)) + 1; }
  function givePoints(n, why) {
    const before = level();
    S.poang.total = Math.max(0, S.poang.total + n);
    toast(`${n > 0 ? '+' : ''}${n} poäng · ${why}`, 'pts'); if (n > 0) sound('points');
    if (level() > before) { toast(`⭐ Nivå ${level()}!`); world.confetti(world.figState.pos.clone(), 160); sound('confetti'); }
    updateHud();
  }
  function dailyOpen() {
    const t = todayKey();
    if (S.poang.senastOppnad === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yk = W.keyOf(y.getFullYear(), y.getMonth(), y.getDate());
    S.poang.streak = S.poang.senastOppnad === yk ? S.poang.streak + 1 : 1;
    S.poang.senastOppnad = t;
    setTimeout(() => givePoints(5, `Dag ${S.poang.streak} i rad`), 1200);
    save();
  }
  function updateHud() { $('#hudPoints').textContent = S.poang.total; $('#hudStreak').textContent = S.poang.streak; $('#hudLevel').textContent = level(); }
  function updateStats() {
    let n = 0, done = 0; for (const l of Object.values(S.events)) for (const e of l) { n++; if (e.klar) done++; }
    n += S.arliga.length; done += Object.keys(S.arligaKlar).length;
    $('#stEvents').textContent = n; $('#stDone').textContent = done; $('#stVisited').textContent = Object.keys(S.poang.besokta).length;
  }

  // ------------------------------------------------------------ ljud
  let actx = null;
  function sound(kind) {
    if (!S.miljo.ljud) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination);
      const env = (a, d, v) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); };
      if (kind === 'hop') { o.type = 'sine'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(760, t + 0.12); env(0.01, 0.16, 0.08); }
      else if (kind === 'points') { o.type = 'triangle'; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(880, t + 0.08); env(0.01, 0.22, 0.09); }
      else if (kind === 'bonus') { o.type = 'square'; o.frequency.setValueAtTime(523, t); o.frequency.setValueAtTime(659, t + 0.1); o.frequency.setValueAtTime(784, t + 0.2); env(0.01, 0.4, 0.06); }
      else { o.type = 'sawtooth'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.35); env(0.02, 0.6, 0.07); }
      o.start(t); o.stop(t + 0.7);
    } catch (e) { /* ljud är inte viktigt */ }
  }

  // ------------------------------------------------------------ UI-hjälp
  function toast(text, cls) { const el = document.createElement('div'); el.className = 'toast ' + (cls || ''); el.textContent = text; $('#toasts').appendChild(el); setTimeout(() => el.remove(), 2700); }
  function openDrawer(id) { $$('.drawer').forEach((d) => d.classList.toggle('open', d.id === id)); }
  function closeDrawers() { $$('.drawer').forEach((d) => d.classList.remove('open')); }
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeDrawers));
  const dayOpen = () => $('#dayDrawer').classList.contains('open');
  function setView(v, silent) { world.setView(v); S.vy = v; $$('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v)); if (!silent) save({ noSync: true }); }
  $$('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  function updateMonthLabel() { const rec = world.tiles.get(currentKey); const m = rec ? rec.m : 0; $('#monthLabel').textContent = `${D.MANADER[m]} ${viewYear}`; }
  $('#prevMonth').addEventListener('click', () => { const rec = world.tiles.get(currentKey); const m = rec ? rec.m : 0; if (m === 0) { buildYear(viewYear - 1); goTo(W.keyOf(viewYear, 11, 1)); } else goTo(W.keyOf(viewYear, m - 1, 1)); });
  $('#nextMonth').addEventListener('click', () => { const rec = world.tiles.get(currentKey); const m = rec ? rec.m : 0; if (m === 11) { buildYear(viewYear + 1); goTo(W.keyOf(viewYear, 0, 1)); } else goTo(W.keyOf(viewYear, m + 1, 1)); });
  $('#todayBtn').addEventListener('click', () => goTo(todayKey()));
  $('#openDay').addEventListener('click', () => openDay());
  $('#openFigure').addEventListener('click', () => openDrawer('figureDrawer'));
  $('#openEnv').addEventListener('click', () => openDrawer('envDrawer'));
  $('#openTips').addEventListener('click', () => { renderTips(); openDrawer('tipsDrawer'); });
  $('#tipMore').addEventListener('click', () => { renderTips(); openDrawer('tipsDrawer'); });
  $('#openHelp').addEventListener('click', () => openDrawer('helpDrawer'));
  $('#accountBtn').addEventListener('click', () => { renderAccount(); openDrawer('accountDrawer'); });

  // tangenter
  addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
    const k = e.key;
    if (k === 'ArrowRight' || k === ' ') { e.preventDefault(); stepDays(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); stepDays(-1); }
    else if (k === 'ArrowDown') { e.preventDefault(); stepDays(7); }
    else if (k === 'ArrowUp') { e.preventDefault(); stepDays(-7); }
    else if (k === '1') setView('ovan'); else if (k === '2') setView('perspektiv'); else if (k === '3') setView('hela'); else if (k === '4') setView('lutande');
    else if (k === 't' || k === 'T') goTo(todayKey());
    else if (k === 'Enter') openDay();
    else if (k === 'å' || k === 'Å') openYear(viewYear);
    else if (k === 'Escape') closeDrawers();
  });
  // svep på mobil: snabb horisontell rörelse = nästa/föregående dag
  let swipe = null;
  canvas.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY, t: Date.now(), yaw: world && world.yaw }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!swipe || !world) return; const sw = swipe; swipe = null;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y, dt = Date.now() - sw.t;
    if (dt < 320 && Math.abs(dx) > 70 && Math.abs(dy) < 50 && e.pointerType === 'touch') { world.yaw = sw.yaw; stepDays(dx < 0 ? 1 : -1); }
  });

  // ------------------------------------------------------------ dagens kort
  function openDay() { renderDay(); openDrawer('dayDrawer'); setTimeout(() => $('#evTitle').focus(), 300); }
  function renderDay() {
    const rec = world.tiles.get(currentKey);
    if (!rec || !rec.day) { $('#dayTitle').textContent = rec && rec.special === 'start' ? 'START' : 'BONUS'; $('#daySub').textContent = 'Gå till en dag för att lägga in händelser.'; $('#evList').innerHTML = ''; return; }
    const d = new Date(viewYear, rec.m, rec.day), wd = (d.getDay() + 6) % 7;
    const isToday = currentKey === todayKey();
    $('#dayTitle').textContent = `${D.VECKODAGAR[wd]} ${rec.day} ${D.MANADER[rec.m].toLowerCase()}${isToday ? ' · i dag' : ''}`;
    const diff = Math.round((d - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
    $('#daySub').textContent = diff === 0 ? 'Det är i dag.' : diff > 0 ? `Om ${diff} dag${diff > 1 ? 'ar' : ''}.` : `För ${-diff} dag${-diff > 1 ? 'ar' : ''} sedan.`;
    const evs = eventsOn(currentKey);
    $('#evList').innerHTML = evs.length ? evs.map((e) => { const t = D.typAv(e.typ); return `<div class="ev ${e.klar ? 'klar' : ''}" data-id="${e.id}"><input type="checkbox" ${e.klar ? 'checked' : ''} title="Klar (+25 poäng)"><div class="mark" style="background:${t.farg}"></div><div class="txt"><b>${t.emoji} ${esc(e.titel)}${e.arligen ? ' <span class="small">· varje år</span>' : ''}</b><span class="small">${e.tid ? 'kl ' + e.tid + ' · ' : ''}${t.namn}${e.beskrivning ? ' · ' + esc(e.beskrivning) : ''}</span></div><button class="x" title="Ta bort">✕</button></div>`; }).join('') : '<p class="small">Ingen händelse ännu. En tom bricka är också ett val.</p>';
    $$('#evList .ev').forEach((el) => {
      const id = el.dataset.id;
      el.querySelector('input').addEventListener('change', (ev) => toggleEvent(currentKey, id, ev.target.checked));
      el.querySelector('.x').addEventListener('click', () => { if (confirm('Ta bort händelsen?')) removeEvent(currentKey, id); });
    });
  }
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const typeSel = $('#evType');
  typeSel.innerHTML = '<option value="">Gissa själv</option>' + D.HANDELSETYPER.map((t) => `<option value="${t.id}">${t.emoji} ${t.namn}</option>`).join('');
  $('#evTitle').addEventListener('input', () => { const g = D.gissaTyp($('#evTitle').value); if (!typeSel.dataset.manual) typeSel.value = g === 'ovrigt' ? '' : g; const m = $('#evTitle').value.match(/\b(\d{1,2})[:.](\d{2})\b/); if (m && !$('#evTime').value) $('#evTime').value = `${m[1].padStart(2, '0')}:${m[2]}`; if (/födelsedag|fyller/i.test($('#evTitle').value)) $('#evYearly').checked = true; });
  typeSel.addEventListener('change', () => { typeSel.dataset.manual = typeSel.value ? '1' : ''; });
  $('#evAdd').addEventListener('click', () => {
    const rec = world.tiles.get(currentKey); if (!rec || !rec.day) { toast('Välj en dag först.'); return; }
    const titel = $('#evTitle').value.trim(); if (!titel) { $('#evTitle').focus(); return; }
    const typ = typeSel.value || D.gissaTyp(titel);
    addEvent(currentKey, { titel: titel.slice(0, 120), tid: $('#evTime').value, typ, beskrivning: $('#evDesc').value.trim().slice(0, 600), arligen: $('#evYearly').checked });
    $('#evTitle').value = ''; $('#evTime').value = ''; $('#evDesc').value = ''; $('#evYearly').checked = false; typeSel.value = ''; typeSel.dataset.manual = '';
    toast(`${D.typAv(typ).emoji} ${D.typAv(typ).namn} tillagd`);
    if (typ === 'fodelsedag' && currentKey === world.currentKey()) { world.confetti(world.figState.pos.clone(), 200); sound('confetti'); }
    $('#evTitle').focus();
  });
  $('#evMail').addEventListener('click', () => {
    const rec = world.tiles.get(currentKey); if (!rec || !rec.day) return;
    const evs = eventsOn(currentKey);
    const subject = `Plan ${currentKey}`;
    const body = [`Kalenderbrädet — ${$('#dayTitle').textContent}`, '', ...(evs.length ? evs.map((e) => `${e.klar ? '[x]' : '[ ]'} ${e.tid ? e.tid + ' ' : ''}${e.titel}${e.beskrivning ? ' — ' + e.beskrivning : ''}`) : ['(inga händelser)']), '', `Poäng: ${S.poang.total} · streak ${S.poang.streak}`, `Dagens tips: ${D.dagensTips().text}`].join('\n');
    location.href = `mailto:${encodeURIComponent(S.konto.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  // ------------------------------------------------------------ figuren
  const HATTAR = [...new Set(['ingen', ...D.FIGURER.map((f) => f.hatt)])];
  function applyFigure() { world.setFigure(S.figur); }
  function renderFigure() {
    const F = S.figur;
    $('#figCount').textContent = D.FIGURER.length;
    const q = ($('#figSearch').value || '').toLowerCase();
    $('#figGrid').innerHTML = D.FIGURER.filter((f) => !q || f.namn.toLowerCase().includes(q)).map((f) => `<button data-id="${f.id}" class="${F.preset === f.id ? 'on' : ''}"><span class="e">${f.emoji}</span>${f.namn}</button>`).join('');
    $$('#figGrid button').forEach((b) => b.addEventListener('click', () => { const p = D.FIGURER.find((f) => f.id === b.dataset.id); S.figur = { ...W.resolvePreset(p), preset: p.id, harstil: p.harstil, stil: p.stil }; save({ noSync: false }); applyFigure(); renderFigure(); toast(`${p.emoji} Nu är du ${p.namn.toLowerCase()}`); }));
    pills('#figBody', D.KROPPAR.map((k) => ({ v: k.id, t: k.label })), F.kropp, (v) => { F.kropp = v; });
    swatches('#figSkin', D.HUDFARGER.map((h) => h.hex), F.hud, (v) => { F.hud = v; });
    swatches('#figHair', D.HARFARGER.map((h) => h.hex), F.har, (v) => { F.har = v; });
    pills('#figHairStyle', D.HARSTILAR.map((h) => ({ v: h, t: h })), F.harstil, (v) => { F.harstil = v; });
    pills('#figStyle', D.STILAR.map((h) => ({ v: h, t: h })), F.stil, (v) => { F.stil = v; });
    swatches('#figCloth', D.KLADFARGER, F.farg, (v) => { F.farg = v; });
    pills('#figFace', [['glad', '😀 glad'], ['lugn', '😌 lugn'], ['cool', '😎 cool'], ['arg', '😠 arg'], ['robot', '🤖 robot']].map(([v, t]) => ({ v, t })), F.ansikte, (v) => { F.ansikte = v; });
    const hs = $('#figHat'); hs.innerHTML = HATTAR.map((h) => `<option value="${h}" ${F.hatt === h ? 'selected' : ''}>${h.replace(/_/g, ' ')}</option>`).join('');
    hs.onchange = () => { F.hatt = hs.value; F.preset = ''; save(); applyFigure(); };
  }
  function pills(sel, items, cur, set) {
    const el = $(sel); el.innerHTML = items.map((i) => `<button data-v="${i.v}" class="${cur === i.v ? 'on' : ''}">${i.t}</button>`).join('');
    $$(sel + ' button').forEach((b) => b.addEventListener('click', () => { set(b.dataset.v); S.figur.preset = ''; save(); applyFigure(); renderFigure(); }));
  }
  function swatches(sel, colors, cur, set) {
    const el = $(sel); el.innerHTML = colors.map((c) => `<button data-v="${c}" style="background:${c}" class="${cur === c ? 'on' : ''}" title="${c}"></button>`).join('');
    $$(sel + ' button').forEach((b) => b.addEventListener('click', () => { set(b.dataset.v); S.figur.preset = ''; save(); applyFigure(); renderFigure(); }));
  }
  $('#figSearch').addEventListener('input', renderFigure);

  // ------------------------------------------------------------ miljön
  // Auto betyder i första hand "som telefonen står". Bara när systemet saknar
  // inställning (äldre webbläsare, no-preference) faller vi tillbaka på klockan.
  function systemTema() {
    if (!window.matchMedia) return null;
    if (matchMedia('(prefers-color-scheme: dark)').matches) return 'mork';
    if (matchMedia('(prefers-color-scheme: light)').matches) return 'ljus';
    return null;
  }
  function isDark() {
    const m = S.miljo.morkt;
    if (m === 'mork') return true;
    if (m === 'ljus') return false;
    const sys = systemTema();
    if (sys) return sys === 'mork';
    const h = new Date().getHours();
    return h >= 19 || h < 6;
  }
  // Panelerna ska aldrig lysa vitt medan brädet är mörkt, eller tvärtom: samma
  // beslut styr både 3D-världen och CSS-variablerna i index.html.
  function applyTheme(dark) {
    document.documentElement.dataset.tema = dark ? 'mork' : 'ljus';
    const mork = $('#tcMork');
    const ljus = $('#tcLjus');
    if (mork && ljus) { mork.media = dark ? 'all' : 'not all'; ljus.media = dark ? 'not all' : 'all'; }
  }
  function applyEnvironment() {
    const dark = isDark();
    applyTheme(dark);
    world.setEnvironment(S.miljo.land, { dark: dark, rekvisita: S.miljo.rekvisita !== false });
  }
  // Byter telefonen läge medan appen är öppen ska brädet följa med direkt.
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const lyssna = () => { if (world && (S.miljo.morkt || 'auto') === 'auto') applyEnvironment(); };
    if (mq.addEventListener) mq.addEventListener('change', lyssna);
    else if (mq.addListener) mq.addListener(lyssna);
  }
  function flagCss(f) { const r = f.r; if (f.typ === 'v') return `linear-gradient(90deg, ${r.map((c, i) => `${c} ${(i / r.length) * 100}% ${((i + 1) / r.length) * 100}%`).join(', ')})`; if (f.typ === 'kors') return `linear-gradient(${r[0]}, ${r[0]}), linear-gradient(90deg, transparent 30%, ${r[1]} 30% 50%, transparent 50%), linear-gradient(transparent 40%, ${r[1]} 40% 60%, transparent 60%)`; return `linear-gradient(${r.map((c, i) => `${c} ${(i / r.length) * 100}% ${((i + 1) / r.length) * 100}%`).join(', ')})`; }
  function renderEnv() {
    $('#landCount').textContent = D.LANDER.length;
    const q = ($('#landSearch').value || '').toLowerCase();
    $('#landGrid').innerHTML = D.LANDER.filter((l) => !q || l.namn.toLowerCase().includes(q)).map((l) => { const f = l.flagga; const bg = f.typ === 'kors' ? `linear-gradient(transparent 40%, ${f.r[1]} 40% 60%, transparent 60%), linear-gradient(90deg, transparent 30%, ${f.r[1]} 30% 50%, transparent 50%), ${f.r[0]}` : flagCss(f); return `<button data-id="${l.id}" class="${S.miljo.land === l.id ? 'on' : ''}"><span class="flag" style="background:${bg}"></span>${l.namn}</button>`; }).join('');
    $$('#landGrid button').forEach((b) => b.addEventListener('click', () => { S.miljo.land = b.dataset.id; save(); applyEnvironment(); renderEnv(); const l = D.LANDER.find((x) => x.id === b.dataset.id); toast(`🌍 ${l.namn}`); }));
    $$('#darkMode button').forEach((b) => { b.classList.toggle('on', (S.miljo.morkt || 'auto') === b.dataset.v); b.onclick = () => { S.miljo.morkt = b.dataset.v; save(); applyEnvironment(); renderEnv(); }; });
    $('#tilt').value = S.miljo.lutning || 25; $('#tiltVal').textContent = S.miljo.lutning || 25;
    $('#rekvisita').checked = S.miljo.rekvisita !== false; $('#ljud').checked = S.miljo.ljud !== false;
  }
  $('#landSearch').addEventListener('input', renderEnv);
  $('#tilt').addEventListener('input', () => { S.miljo.lutning = Number($('#tilt').value); $('#tiltVal').textContent = S.miljo.lutning; world.setTilt(S.miljo.lutning); if (world.view !== 'lutande') setView('lutande'); });
  $('#tilt').addEventListener('change', () => save({ noSync: true }));
  $('#rekvisita').addEventListener('change', () => { S.miljo.rekvisita = $('#rekvisita').checked; save({ noSync: true }); applyEnvironment(); });
  $('#ljud').addEventListener('change', () => { S.miljo.ljud = $('#ljud').checked; save({ noSync: true }); });
  setInterval(() => { if ((S.miljo.morkt || 'auto') === 'auto' && world && world.dark !== isDark()) applyEnvironment(); }, 60000);

  // ------------------------------------------------------------ tips
  function renderTipbar() { $('#tipText').textContent = D.dagensTips().text; }
  function renderTips() {
    const t = D.dagensTips(); const n = D.TIPS.length;
    const rows = [];
    for (let i = 0; i < 8; i++) { const idx = ((t.nr - i) % n + n) % n; const d = new Date(); d.setDate(d.getDate() - i); rows.push(`<div class="tip"><div class="n">${i === 0 ? 'I dag' : i === 1 ? 'I går' : d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })}</div>${esc(D.TIPS[idx])}</div>`); }
    $('#tipList').innerHTML = rows.join('') + `<p class="small">${n} råd i rotation. Fler idéer om appen skrivs upp automatiskt på <a href="https://marcdshark666.github.io/projects" style="color:var(--accent)">The Work List</a>.</p>`;
  }

  // ------------------------------------------------------------ årsstatistik
  // Räknar året ur S.events + S.arliga + besökta dagar. Inget sparas: allt härleds vid öppning.
  let statYear = new Date().getFullYear();

  // Åren att bläddra mellan: de år som har egna händelser eller besökta dagar, plus i år.
  // Årliga händelser finns i varje år och får därför inte styra listan (då blir den oändlig).
  function statYears() {
    const set = new Set([new Date().getFullYear()]);
    for (const [k, l] of Object.entries(S.events)) if (l.length) set.add(Number(k.slice(0, 4)));
    for (const k of Object.keys(S.poang.besokta)) set.add(Number(k.slice(0, 4)));
    return [...set].filter((y) => y > 1900 && y < 3000).sort((a, b) => a - b);
  }

  // Längsta obrutna raden av dagar i året där har(key) är sann. Returnerar längd + sista dagen.
  function langstaRaden(y, har) {
    let bast = 0, cur = 0, slut = null, bastSlut = null;
    for (let m = 0; m < 12; m++) {
      for (let d = 1; d <= W.daysIn(y, m); d++) {
        const k = W.keyOf(y, m, d);
        if (har(k)) { cur++; slut = k; if (cur > bast) { bast = cur; bastSlut = slut; } }
        else cur = 0;
      }
    }
    return { langd: bast, slut: bastSlut };
  }

  function arsStat(y) {
    const evs = eventsForYear(y);
    const perTyp = {};                                    // typ-id → antal
    const perManad = Array.from({ length: 12 }, () => ({ n: 0, klara: 0, typer: {} }));
    let n = 0, klara = 0;
    const dagarMedHandelse = new Set();
    for (const [key, list] of Object.entries(evs)) {
      if (!list.length) continue;
      const m = Number(key.slice(5, 7)) - 1;
      if (m < 0 || m > 11) continue;
      dagarMedHandelse.add(key);
      for (const e of list) {
        const t = e.typ || 'ovrigt';
        n++; perManad[m].n++; perTyp[t] = (perTyp[t] || 0) + 1;
        perManad[m].typer[t] = (perManad[m].typer[t] || 0) + 1;
        if (e.klar) { klara++; perManad[m].klara++; }
      }
    }
    // toppmånad för en viss typ, så rekordkorten kan säga "flest i mars"
    const toppManadFor = (typ) => {
      let bm = -1, bn = 0;
      for (let m = 0; m < 12; m++) { const v = perManad[m].typer[typ] || 0; if (v > bn) { bn = v; bm = m; } }
      return bm < 0 ? null : { m: bm, n: bn };
    };
    let bastaManad = -1;
    for (let m = 0; m < 12; m++) if (perManad[m].n > 0 && (bastaManad < 0 || perManad[m].n > perManad[bastaManad].n)) bastaManad = m;

    const besokta = Object.keys(S.poang.besokta).filter((k) => k.startsWith(y + '-'));
    const toppTyp = Object.entries(perTyp).sort((a, b) => b[1] - a[1])[0] || null;

    return {
      y, n, klara, perTyp, perManad, bastaManad, toppTyp, toppManadFor,
      dagarMedHandelse: dagarMedHandelse.size,
      besokta: besokta.length,
      lakare: perTyp.lakare || 0,
      traning: perTyp.traning || 0,
      fodelsedagar: perTyp.fodelsedag || 0,
      radHandelse: langstaRaden(y, (k) => dagarMedHandelse.has(k)),
      radBesok: langstaRaden(y, (k) => !!S.poang.besokta[k]),
    };
  }

  // "3 mars – 9 mars" ur sista dagen i raden och radens längd
  function radText(rad) {
    if (!rad.langd || !rad.slut) return '';
    const [ys, ms, ds] = rad.slut.split('-').map(Number);
    const slut = new Date(ys, ms - 1, ds);
    const start = new Date(ys, ms - 1, ds - rad.langd + 1);
    const f = (d) => `${d.getDate()} ${D.MANADER[d.getMonth()].toLowerCase()}`;
    return rad.langd === 1 ? f(slut) : `${f(start)} – ${f(slut)}`;
  }

  const pl = (n, en, flera) => (n === 1 ? en : flera);
  function recRad(ic, nyckel, varde, sub, tom) {
    return `<div class="rec${tom ? ' tom' : ''}"><div class="ic">${ic}</div><div class="tx">` +
      `<div class="k">${esc(nyckel)}</div><div class="v">${esc(varde)}</div>` +
      (sub ? `<div class="s">${esc(sub)}</div>` : '') + '</div></div>';
  }

  function renderYear() {
    const y = statYear, st = arsStat(y), ar = statYears();
    const iAr = new Date().getFullYear();
    $('#yearLabel').textContent = y;
    $('#yearPrev').disabled = !ar.some((v) => v < y);
    $('#yearNext').disabled = !ar.some((v) => v > y);
    $('#yearSub').textContent = st.n
      ? `${st.n} ${pl(st.n, 'händelse', 'händelser')} på ${st.dagarMedHandelse} ${pl(st.dagarMedHandelse, 'dag', 'dagar')}${y === iAr ? ' — året är inte slut än' : ''}.`
      : `Inget registrerat för ${y} än. Skriv in händelser på dagens kort så fylls den här sidan i sig själv.`;
    $('#yearTotals').innerHTML =
      `<div><b>${st.n}</b>händelser</div><div><b>${st.klara}</b>avbockade</div><div><b>${st.besokta}</b>dagar besökta</div>`;

    // rekord
    const mn = (m) => D.MANADER[m];
    const lm = st.toppManadFor('lakare'), tm = st.toppManadFor('traning');
    const rec = [];
    rec.push(recRad('🩺', 'Flest läkarbesök',
      st.lakare ? `${st.lakare} besök` : 'Inga läkarbesök',
      lm ? `Flest i ${mn(lm.m).toLowerCase()} (${lm.n})` : 'Skriv "läkare" i titeln så räknas det här', !st.lakare));
    rec.push(recRad('🏋️', 'Mest träning',
      st.traning ? `${st.traning} pass` : 'Inga träningspass',
      tm ? `Bäst i ${mn(tm.m).toLowerCase()} (${tm.n} pass)` : 'Skriv "gym", "löpning" eller "yoga" så räknas det', !st.traning));
    rec.push(recRad('🔥', 'Längsta streak',
      st.radHandelse.langd ? `${st.radHandelse.langd} ${pl(st.radHandelse.langd, 'dag', 'dagar i rad')} med något inbokat` : 'Ingen rad än',
      radText(st.radHandelse), !st.radHandelse.langd));
    rec.push(recRad('👣', 'Längsta besöksrad',
      st.radBesok.langd ? `${st.radBesok.langd} ${pl(st.radBesok.langd, 'dag', 'dagar i rad')} du varit på brädet` : 'Ingen rad än',
      radText(st.radBesok), !st.radBesok.langd));
    rec.push(recRad('🏆', 'Bästa månad',
      st.bastaManad >= 0 ? `${mn(st.bastaManad)} — ${st.perManad[st.bastaManad].n} ${pl(st.perManad[st.bastaManad].n, 'händelse', 'händelser')}` : 'Ingen månad sticker ut',
      st.bastaManad >= 0 ? `${st.perManad[st.bastaManad].klara} avbockade` : '', st.bastaManad < 0));
    if (st.fodelsedagar) rec.push(recRad('🎂', 'Födelsedagar', `${st.fodelsedagar} i kalendern`, 'Varje besök ger konfetti och 100 poäng'));
    $('#yearRecords').innerHTML = rec.join('');

    // månad för månad
    const max = Math.max(1, ...st.perManad.map((p) => p.n));
    $('#yearMonths').innerHTML = st.perManad.map((p, m) =>
      `<div class="yb${m === st.bastaManad && p.n ? ' top' : ''}"><div class="m">${mn(m).slice(0, 3)}</div>` +
      `<div class="sp"><i class="${p.n ? '' : 'noll'}" style="width:${p.n ? Math.max(4, Math.round((p.n / max) * 100)) : 100}%"></i></div>` +
      `<div class="n">${p.n}</div></div>`).join('');

    // typfördelning, störst först
    const typer = Object.entries(st.perTyp).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const tmax = Math.max(1, ...typer.map((t) => t[1]));
    $('#yearTypes').innerHTML = typer.length
      ? typer.map(([id, v]) => { const t = D.typAv(id); return `<div class="yb"><div class="m" title="${esc(t.namn)}">${t.emoji}</div>` +
        `<div class="sp"><i style="width:${Math.max(4, Math.round((v / tmax) * 100))}%;background:${t.farg}"></i></div><div class="n">${v}</div></div>`; }).join('')
      : '<p class="small">Inga händelser att fördela än.</p>';

    $('#yearFoot').textContent = st.toppTyp
      ? `Året handlade mest om: ${D.typAv(st.toppTyp[0]).namn.toLowerCase()} (${st.toppTyp[1]} av ${st.n}).`
      : 'Siffrorna räknas om varje gång du öppnar sidan.';
  }

  function openYear(y) {
    const ar = statYears();
    if (typeof y === 'number') statYear = y;
    else if (!ar.includes(statYear)) statYear = ar.includes(viewYear) ? viewYear : new Date().getFullYear();
    renderYear(); openDrawer('yearDrawer');
  }
  function stepYear(dir) {
    const ar = statYears();
    const kandidater = dir > 0 ? ar.filter((v) => v > statYear) : ar.filter((v) => v < statYear).reverse();
    if (!kandidater.length) return;
    statYear = kandidater[0]; renderYear();
  }
  $('#openYear').addEventListener('click', () => openYear(viewYear));
  $('#yearPrev').addEventListener('click', () => stepYear(-1));
  $('#yearNext').addEventListener('click', () => stepYear(1));

  // ------------------------------------------------------------ nyårsafton
  const arNyarsafton = (key) => String(key || '').slice(5) === '12-31';
  // Konfetti varje gång figuren står på 31 december; poängen bara en gång per år.
  function firaNyar(key, pos) {
    const p = (pos || world.figState.pos).clone();
    world.confetti(p, 300); sound('confetti');
    setTimeout(() => world.confetti(p, 220), 700);
    const y = key.slice(0, 4);
    if (!S.poang.nyar[y]) { S.poang.nyar[y] = true; givePoints(75, '🎆 Nyårsafton!'); save(); }
    else toast('🎆 Gott nytt år!');
  }

  // ------------------------------------------------------------ konto & synk
  let serverOk = null;
  function setSync(cls, text) { $('#syncDot').className = cls; $('#syncDot').title = text || ''; if ($('#accountDrawer').classList.contains('open')) $('#accStatus').textContent = text || ''; }
  async function checkServer() {
    try { const r = await fetch(API, { method: 'GET' }); const j = await r.json().catch(() => ({})); serverOk = !!j.ok; $('#accSvc').textContent = serverOk ? 'Servern svarar. Lagringen är kopplad.' : `Servern är inte kopplad (${j.reason || r.status}). Allt sparas lokalt.`; }
    catch (e) { serverOk = false; $('#accSvc').textContent = 'Ingen kontakt med servern (kör du lokalt?). Allt sparas lokalt.'; }
    setSync(S.konto.email && serverOk ? 'ok' : 'local', S.konto.email && serverOk ? 'Synkad med servern' : 'Sparat lokalt');
  }
  function payload(extra) { const p = { email: S.konto.email, ...extra }; if (S.konto.pin) p.pin = S.konto.pin; return p; }
  function stateForServer() { const { konto, ...rest } = S; return rest; }
  async function pushServer(quiet) {
    if (!S.konto.email) return;
    setSync('busy', 'Sparar …');
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload({ action: 'put', state: stateForServer() })) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setSync('bad', j.error || `Fel ${r.status}`); if (!quiet) toast('Kunde inte spara på servern: ' + (j.error || r.status)); return false; }
      setSync('ok', 'Sparat på servern ' + new Date().toLocaleTimeString('sv-SE')); if (!quiet) toast('☁️ Sparat på servern'); return true;
    } catch (e) { setSync('bad', 'Ingen kontakt'); if (!quiet) toast('Ingen kontakt med servern'); return false; }
  }
  async function pullServer(quiet) {
    if (!S.konto.email) return;
    setSync('busy', 'Hämtar …');
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload({ action: 'get' })) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 404) { setSync('local', 'Inget sparat än för den adressen'); if (!quiet) toast('Inget sparat på servern än — tryck Spara.'); return false; }
      if (!r.ok) { setSync('bad', j.error || `Fel ${r.status}`); if (!quiet) toast(j.error || 'Fel ' + r.status); return false; }
      const remote = j.state; if (!remote) return false;
      const localNewer = (S.updatedAt || 0) > (remote.updatedAt || 0) + 2000;
      if (localNewer && !quiet && !confirm('Datorn har nyare ändringar än servern. Hämta serverns version ändå?')) return false;
      if (localNewer && quiet) { await pushServer(true); return true; }
      const konto = S.konto; S = deepMerge(defaults(), remote); S.konto = konto;
      localStorage.setItem(LS_KEY, JSON.stringify(S));
      applyEnvironment(); applyFigure(); buildYear(viewYear); refreshAllTiles(); updateHud(); renderEnv(); renderFigure();
      setSync('ok', 'Hämtat från servern'); if (!quiet) toast('☁️ Hämtat från servern'); return true;
    } catch (e) { setSync('bad', 'Ingen kontakt'); if (!quiet) toast('Ingen kontakt med servern'); return false; }
  }
  function renderAccount() { $('#accEmail').value = S.konto.email || ''; $('#accPin').value = S.konto.pin || ''; $('#accStatus').textContent = $('#syncDot').title; updateStats(); }
  function readAccount() {
    const email = $('#accEmail').value.trim().toLowerCase(), pin = $('#accPin').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Skriv en riktig e-postadress.'); return false; }
    if (pin && !/^\d{4,8}$/.test(pin)) { toast('PIN är 4–8 siffror.'); return false; }
    S.konto.email = email; S.konto.pin = pin; save({ noSync: true }); return true;
  }
  $('#accSave').addEventListener('click', async () => { if (readAccount()) await pushServer(false); });
  $('#accLoad').addEventListener('click', async () => { if (readAccount()) await pullServer(false); });
  $('#expJson').addEventListener('click', () => { const blob = new Blob([JSON.stringify(stateForServer(), null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kalenderbradet-${todayKey()}.json`; a.click(); });
  $('#impJson').addEventListener('click', () => { $('#fileIn').accept = '.json,application/json'; $('#fileIn').click(); });
  $('#impIcs').addEventListener('click', () => { $('#fileIn').accept = '.ics,text/calendar'; $('#fileIn').click(); });
  $('#fileIn').addEventListener('change', async () => {
    const f = $('#fileIn').files[0]; if (!f) return; const text = await f.text(); $('#fileIn').value = '';
    if (/BEGIN:VCALENDAR/i.test(text)) { const n = importIcs(text); toast(`${n} händelser importerade från .ics`); }
    else { try { const j = JSON.parse(text); if (!j.events) throw new Error('inte en Kalenderbrädet-fil'); const konto = S.konto; S = deepMerge(defaults(), j); S.konto = konto; save(); applyEnvironment(); applyFigure(); buildYear(viewYear); refreshAllTiles(); updateHud(); toast('Importerat'); } catch (e) { toast('Kunde inte läsa filen: ' + e.message); } }
  });
  function importIcs(text) {
    const lines = text.replace(/\r/g, '').replace(/\n[ \t]/g, '').split('\n'); let cur = null, n = 0;
    for (const l of lines) {
      if (l === 'BEGIN:VEVENT') cur = {}; else if (l === 'END:VEVENT' && cur) {
        if (cur.d) {
          const typ = D.gissaTyp(cur.s || ''); const key = cur.d;
          if (cur.yearly) { if (!S.arliga.some((r) => r.md === key.slice(5) && r.titel === cur.s)) { S.arliga.push({ id: uid(), md: key.slice(5), titel: cur.s || 'Årligt', tid: cur.t || '', typ, beskrivning: cur.desc || '' }); n++; } }
          else if (!(S.events[key] || []).some((e) => e.titel === cur.s)) { (S.events[key] = S.events[key] || []).push({ id: uid(), titel: cur.s || 'Händelse', tid: cur.t || '', typ, beskrivning: cur.desc || '', klar: false }); n++; }
        }
        cur = null;
      } else if (cur) {
        const i = l.indexOf(':'); if (i < 0) continue; const k = l.slice(0, i).split(';')[0], v = l.slice(i + 1);
        if (k === 'SUMMARY') cur.s = v.slice(0, 120); else if (k === 'DESCRIPTION') cur.desc = v.replace(/\\n/g, ' ').slice(0, 600);
        else if (k === 'DTSTART') { const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/); if (m) { cur.d = `${m[1]}-${m[2]}-${m[3]}`; if (m[4]) cur.t = `${m[4]}:${m[5]}`; } }
        else if (k === 'RRULE' && /FREQ=YEARLY/.test(v)) cur.yearly = true;
      }
    }
    if (n) { save(); refreshAllTiles(); }
    return n;
  }
  $('#resetAll').addEventListener('click', () => { if (confirm('Rensa allt som sparats lokalt i den här webbläsaren? Servern rörs inte.')) { localStorage.removeItem(LS_KEY); location.reload(); } });

  // ------------------------------------------------------------ start
  function start() {
    try { init3d(); }
    catch (e) { console.error(e); $('#splash .card').innerHTML = `<h1>Hoppsan</h1><p>3D kunde inte startas: ${esc(e.message)}</p><p class="small">Prova en nyare webbläsare med WebGL.</p>`; return; }
    updateHud(); updateStats(); renderTipbar(); renderFigure(); renderEnv(); updateMonthLabel();
    dailyOpen();
    // Öppnar man appen på nyårsafton smäller konfettin direkt, oavsett var figuren står.
    if (arNyarsafton(todayKey())) setTimeout(() => firaNyar(todayKey()), 1600);
    checkServer().then(() => { if (S.konto.email && serverOk) pullServer(true); });
    // midnatt: flytta dagens ring
    setInterval(() => { const t = todayKey(); if (world.today !== t) { world.setToday(t); dailyOpen(); renderTipbar(); } }, 60000);
    addEventListener('online', () => { if (S.konto.email) pushServer(true); });
  }
  start();
  // felsökning i konsolen: KB_APP.world, KB_APP.state, KB_APP.goTo('2026-12-24')
  window.KB_APP = { get world() { return world; }, get state() { return S; }, goTo, setView, addEvent, moveEvent, eventsOn, toast, sound, applyEnvironment, applyFigure };
})();
