// Kalenderbrädet — dra en figur från en bricka till en annan för att flytta händelsen dit.
// Ligger i en egen fil så att raycast-lyssnarna i world.js får vara i fred: den här
// fångar pointer-händelserna i capture-fasen på window (kör före canvasens egna
// lyssnare) och stoppar dem bara när greppet faktiskt sitter på en figur.
(function (root) {
  'use strict';
  const T = root.THREE;
  const LYFT = 2.6;          // hur högt figuren svävar medan man drar
  const TROSKEL = 8;         // px innan ett grepp räknas som ett drag och inte ett klick

  let app = null, world = null, canvas = null;
  let drag = null, ring = null, hoverKey = null, senasteHover = 0, angraTimer = null;
  const ray = new T.Raycaster(), v2 = new T.Vector2();

  // ------------------------------------------------------------ raycast
  function pick(e, groups) {
    const r = canvas.getBoundingClientRect();
    v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, world.camera);
    return ray.intersectObjects(groups, true);
  }
  function traverseUp(o, prop) { while (o) { if (o.userData && o.userData[prop] != null) return o.userData[prop]; o = o.parent; } return null; }
  function figurAt(e) { for (const h of pick(e, [world.npcGroup])) { const k = traverseUp(h.object, 'eventKey'); if (k) return k; } return null; }
  function brickaAt(e) { for (const h of pick(e, [world.boardGroup])) { const k = traverseUp(h.object, 'tile'); if (k) return k; } return null; }
  function holderFor(key) { return world.npcGroup.children.find((c) => c.userData.eventKey === key) || null; }

  // ------------------------------------------------------------ måltavlan
  function visaRing(key) {
    if (hoverKey === key) return;
    hoverKey = key;
    const rec = key && world.tiles.get(key);
    if (!ring) {
      ring = new T.Mesh(new T.TorusGeometry(2.1, 0.16, 10, 36),
        new T.MeshStandardMaterial({ color: '#ffd60a', emissive: '#ffd60a', emissiveIntensity: 1.4, roughness: 0.4 }));
      ring.rotation.x = Math.PI / 2; ring.castShadow = false; ring.receiveShadow = false;
      world.fxGroup.add(ring);
    }
    ring.visible = !!rec;
    if (rec) ring.position.set(rec.pos.x, 0.55, rec.pos.z);
  }
  function doljRing() { hoverKey = null; if (ring) ring.visible = false; }
  const giltigt = (key) => { const rec = key && world.tiles.get(key); return !!(rec && rec.day && !rec.special); };

  // ------------------------------------------------------------ ångra-raden
  function visaAngra(text, undo) {
    clearTimeout(angraTimer);
    let bar = document.querySelector('#dragUndo');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dragUndo';
      bar.innerHTML = '<span></span><button type="button">Ångra</button>';
      document.body.appendChild(bar);
      bar.querySelector('button').addEventListener('click', () => {
        const fn = bar._undo; bar._undo = null; bar.classList.remove('on');
        if (fn) { fn(); app.toast('Flytten ångrad'); }
      });
    }
    bar.querySelector('span').textContent = text;
    bar._undo = undo;
    bar.classList.add('on');
    angraTimer = setTimeout(() => { bar.classList.remove('on'); bar._undo = null; }, 7000);
  }

  // ------------------------------------------------------------ dragningen
  function onDown(e) {
    if (!world || drag || (e.button != null && e.button > 0)) return;
    if (world.view === 'hela') return;                       // helhetsvyn: brickorna är för små, låt kameran snurra
    if (world.figState && world.figState.queue.length) return; // figuren hoppar — vänta tills den landat
    const key = figurAt(e); if (!key) return;
    const evs = app.eventsOn(key); if (!evs.length) return;
    const ev = evs.find((x) => !x.klar) || evs[0];
    const holder = holderFor(key); if (!holder) return;
    drag = { key, ev, kvar: evs.length - 1, holder, origo: holder.position.clone(), x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* äldre webbläsare klarar sig utan */ }
    e.stopPropagation();  // hindrar kamerasnurr (world.js) och svep (app.js)
  }

  function onMove(e) {
    if (!drag) {
      if (!world || e.pointerType === 'touch' || Date.now() - senasteHover < 60) return;
      senasteHover = Date.now();
      canvas.style.cursor = world.view === 'hela' ? '' : (figurAt(e) ? 'grab' : '');
      return;
    }
    e.stopPropagation();
    if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < TROSKEL) return;
    if (!drag.moved) {
      drag.moved = true;
      canvas.style.cursor = 'grabbing';
      document.body.classList.add('dragging');
      drag.holder.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    }
    const mal = brickaAt(e);
    visaRing(giltigt(mal) && mal !== drag.key ? mal : null);
    const rec = hoverKey && world.tiles.get(hoverKey);
    if (rec) drag.holder.position.set(rec.pos.x, rec.pos.y + LYFT, rec.pos.z);
    else drag.holder.position.set(drag.origo.x, drag.origo.y + LYFT, drag.origo.z);
  }

  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    e.stopPropagation();
    canvas.style.cursor = ''; document.body.classList.remove('dragging');
    try { canvas.releasePointerCapture(d.id); } catch (err) { /* redan släppt */ }
    const mal = brickaAt(e); doljRing();   // brickan under pekaren, inte ringen: annars går egen bricka inte att skilja från tomma luften
    if (!d.moved) { aterstall(); app.goTo(d.key, { open: true }); return; }
    if (!giltigt(mal) || mal === d.key) { aterstall(); if (mal !== d.key) app.toast('Släpp figuren på en dagbricka'); return; }
    const res = app.moveEvent(d.key, d.ev.id, mal);
    if (!res) { aterstall(); app.toast('Händelsen kunde inte flyttas'); return; }
    app.sound('hop');
    const dit = datumText(mal);
    if (res.arligen) app.toast(`↔ ${res.titel} flyttad till ${dit} — varje år`);
    else app.toast(`↔ ${res.titel} → ${dit}${d.kvar ? ` (${d.kvar} kvar på dagen)` : ''}`);
    visaAngra(`${res.titel} flyttad till ${dit}`, res.undo);
  }

  function aterstall() { if (world) world.setNpcMonth(world.focusMonth, true); }
  function onCancel() { if (!drag) return; drag = null; doljRing(); canvas.style.cursor = ''; document.body.classList.remove('dragging'); aterstall(); }

  function datumText(key) {
    const rec = world.tiles.get(key); if (!rec) return key;
    const M = (root.KB_DATA && root.KB_DATA.MANADER) || [];
    return `${rec.day} ${(M[rec.m] || '').toLowerCase()}`.trim() || key;
  }

  // ------------------------------------------------------------ start
  function koppla() {
    app = root.KB_APP; world = app && app.world; canvas = document.querySelector('#scene');
    if (!app || !world || !canvas || !app.moveEvent) return false;
    addEventListener('pointerdown', onDown, true);
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onCancel, true);
    return true;
  }
  let forsok = 0;
  (function vanta() { if (koppla()) return; if (++forsok > 60) return; setTimeout(vanta, 200); })();
})(window);
