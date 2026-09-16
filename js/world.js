// Kalenderbrädet — 3D-världen. Tolv månadsbräden i ett rutnät, en figur som hoppar
// dag för dag, figurer som står på dagar med händelser, miljöer per land och fyra
// kameravyer. Bygger allt av primitiv (inga modeller att ladda).
(function (root) {
  'use strict';
  const T = root.THREE;
  const D = root.KB_DATA;

  const TILE = 4;            // en dag = 4×4 enheter
  const GAP = 0.3;
  const BOARD_GAP = 48;      // avstånd mellan månadsbrädenas mittpunkter
  const COLS = 4;            // 4 × 3 månader

  // ------------------------------------------------------------ material & primitiv
  const matCache = new Map();
  function mat(color, o) {
    o = o || {};
    const key = `${color}|${o.rough ?? 0.8}|${o.metal ?? 0}|${o.emissive || ''}|${o.opacity ?? 1}|${o.flat ? 1 : 0}`;
    if (matCache.has(key)) return matCache.get(key);
    const m = new T.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, flatShading: !!o.flat });
    if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 0.6; }
    if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; }
    matCache.set(key, m);
    return m;
  }
  const geoCache = new Map();
  function geo(kind, ...args) {
    const key = kind + args.join(',');
    if (!geoCache.has(key)) geoCache.set(key, new T[kind](...args));
    return geoCache.get(key);
  }
  function mesh(g, m, x, y, z) { const o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; return o; }
  function box(w, h, d, color, x, y, z, o) { return mesh(geo('BoxGeometry', w, h, d), mat(color, o), x, y, z); }
  function cyl(rt, rb, h, color, x, y, z, seg, o) { return mesh(geo('CylinderGeometry', rt, rb, h, seg || 16), mat(color, o), x, y, z); }
  function cone(r, h, color, x, y, z, seg, o) { return mesh(geo('ConeGeometry', r, h, seg || 16), mat(color, o), x, y, z); }
  function sph(r, color, x, y, z, o) { return mesh(geo('SphereGeometry', r, 14, 10), mat(color, o), x, y, z); }
  function torus(r, t, color, x, y, z, o) { return mesh(geo('TorusGeometry', r, t, 8, 24), mat(color, o), x, y, z); }
  function grp(...kids) { const g = new T.Group(); kids.forEach((k) => k && g.add(k)); return g; }
  function shade(hex, f) { const c = new T.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }
  function mix(a, b, t) { const c = new T.Color(a); c.lerp(new T.Color(b), t); return '#' + c.getHexString(); }

  // deterministisk slump, så rekvisitan står på samma ställe varje gång
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // ------------------------------------------------------------ texturer (canvas)
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function faceTexture(ansikte, skin) {
    return canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = skin; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d1d24';
      if (ansikte === 'robot') {
        g.fillStyle = '#39d0ff'; g.fillRect(28, 44, 24, 16); g.fillRect(76, 44, 24, 16);
        g.fillStyle = '#1d1d24'; for (let i = 0; i < 5; i++) g.fillRect(34 + i * 12, 84, 6, 10);
        return;
      }
      if (ansikte === 'cool') { g.fillRect(24, 46, 30, 14); g.fillRect(74, 46, 30, 14); g.fillRect(54, 50, 20, 4); }
      else if (ansikte === 'arg') { g.fillRect(30, 50, 16, 12); g.fillRect(82, 50, 16, 12); g.fillRect(26, 38, 24, 5); g.fillRect(78, 38, 24, 5); }
      else { g.beginPath(); g.arc(40, 54, 8, 0, 7); g.arc(88, 54, 8, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(43, 51, 3, 0, 7); g.arc(91, 51, 3, 0, 7); g.fill(); }
      g.strokeStyle = '#7a3b2e'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
      if (ansikte === 'lugn') { g.moveTo(48, 90); g.lineTo(80, 90); }
      else if (ansikte === 'arg') { g.moveTo(46, 96); g.quadraticCurveTo(64, 82, 82, 96); }
      else { g.moveTo(44, 86); g.quadraticCurveTo(64, 106, 84, 86); }
      g.stroke();
      g.fillStyle = 'rgba(255,120,120,0.35)'; g.beginPath(); g.arc(24, 76, 9, 0, 7); g.arc(104, 76, 9, 0, 7); g.fill();
    });
  }
  function emojiSprite(emoji, size) {
    const tex = canvasTex(128, 128, (g, w, h) => {
      g.font = '92px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 6;
      g.fillText(emoji, w / 2, h / 2 + 6);
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(size || 1.6, size || 1.6, 1);
    return s;
  }
  function flagTexture(flagga) {
    return canvasTex(96, 64, (g, w, h) => {
      const r = flagga.r;
      if (flagga.typ === 'kors') {
        g.fillStyle = r[0]; g.fillRect(0, 0, w, h);
        g.fillStyle = r[1]; g.fillRect(0, h * 0.4, w, h * 0.2); g.fillRect(w * 0.3, 0, w * 0.2, h);
        if (r[2]) { g.fillStyle = r[2]; g.fillRect(0, h * 0.45, w, h * 0.1); g.fillRect(w * 0.35, 0, w * 0.1, h); }
      } else if (flagga.typ === 'v') { r.forEach((c, i) => { g.fillStyle = c; g.fillRect((w / r.length) * i, 0, w / r.length + 1, h); }); }
      else { r.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (h / r.length) * i, w, h / r.length + 1); }); }
    });
  }

  // ------------------------------------------------------------ figurbyggaren
  // cfg: { hud, har (hex), harstil, kropp, stil, farg, hatt, ansikte }
  function buildFigure(cfg) {
    const skin = cfg.hud || '#f5cfb0', hair = cfg.har || '#3f2a1c', cloth = cfg.farg || '#4361ee';
    const kropp = cfg.kropp || 'neutral', stil = cfg.stil || 'vardag';
    const g = new T.Group();
    const body = new T.Group(); g.add(body);
    const shoulders = kropp === 'man' ? 0.92 : kropp === 'kvinna' ? 0.74 : 0.82;
    const hips = kropp === 'kvinna' ? 0.8 : 0.76;
    const pants = stil === 'drakt' ? cloth : stil === 'sport' ? shade(cloth, 0.8) : stil === 'rustning' ? '#6c757d' : stil === 'pyjamas' ? mix(cloth, '#ffffff', 0.5) : '#2b3a55';
    const dark = shade(cloth, 0.75);

    // ben
    const legL = box(0.28, 0.9, 0.3, pants, -0.18, 0.45, 0), legR = box(0.28, 0.9, 0.3, pants, 0.18, 0.45, 0);
    if (stil === 'sport') { legL.scale.y = 0.55; legL.position.y = 0.72; legR.scale.y = 0.55; legR.position.y = 0.72; body.add(box(0.26, 0.42, 0.28, skin, -0.18, 0.22, 0), box(0.26, 0.42, 0.28, skin, 0.18, 0.22, 0)); }
    body.add(legL, legR);
    body.add(box(0.32, 0.14, 0.42, '#2a2a30', -0.18, 0.07, 0.04), box(0.32, 0.14, 0.42, '#2a2a30', 0.18, 0.07, 0.04)); // skor

    // bål
    const torsoH = stil === 'rock' ? 1.5 : 1.05;
    const torso = box(1, 1, 1, cloth, 0, 0.9 + torsoH / 2, 0, stil === 'rustning' ? { metal: 0.6, rough: 0.35 } : undefined);
    torso.scale.set(shoulders, torsoH, 0.48);
    torso.position.y = stil === 'rock' ? 0.7 + torsoH / 2 : 0.9 + torsoH / 2;
    body.add(torso);
    if (kropp === 'kvinna' && stil !== 'rock') { const waist = box(hips * 0.95, 0.35, 0.46, cloth, 0, 1.05, 0); body.add(waist); }
    if (stil === 'klanning') { const skirt = cyl(0.42, 0.75, 0.9, cloth, 0, 0.6, 0, 12); body.add(skirt); }
    if (stil === 'kostym') { body.add(box(0.5, 1.02, 0.05, '#ffffff', 0, 1.42, 0.25), box(0.12, 0.6, 0.06, dark === cloth ? '#c1121f' : '#c1121f', 0, 1.5, 0.28)); }
    if (stil === 'uniform') { body.add(box(shoulders + 0.02, 0.12, 0.5, dark, 0, 1.0, 0), box(0.16, 0.16, 0.05, '#ffd166', 0.22, 1.7, 0.26)); }
    if (stil === 'rustning') { body.add(box(0.34, 0.2, 0.5, '#8d99ae', -shoulders / 2 - 0.05, 1.92, 0, { metal: 0.6, rough: 0.35 }), box(0.34, 0.2, 0.5, '#8d99ae', shoulders / 2 + 0.05, 1.92, 0, { metal: 0.6, rough: 0.35 })); }
    if (stil === 'pyjamas') { for (let i = 0; i < 3; i++) body.add(box(shoulders + 0.02, 0.1, 0.5, mix(cloth, '#ffffff', 0.2), 0, 1.05 + i * 0.32, 0)); }

    // armar
    const armY = 1.42, ax = shoulders / 2 + 0.14;
    const sleeve = stil === 'sport' ? skin : cloth;
    const armL = new T.Group(), armR = new T.Group();
    armL.position.set(-ax, armY + 0.4, 0); armR.position.set(ax, armY + 0.4, 0);
    armL.add(box(0.22, 0.6, 0.22, sleeve, 0, -0.3, 0), box(0.2, 0.3, 0.2, skin, 0, -0.72, 0));
    armR.add(box(0.22, 0.6, 0.22, sleeve, 0, -0.3, 0), box(0.2, 0.3, 0.2, skin, 0, -0.72, 0));
    body.add(armL, armR);

    // huvud
    const headY = stil === 'rock' ? 2.55 : 2.42;
    const head = new T.Group(); head.position.y = headY; body.add(head);
    const faceMat = new T.MeshStandardMaterial({ map: faceTexture(cfg.ansikte || 'glad', skin), roughness: 0.8 });
    const skinMat = mat(skin);
    const headMesh = new T.Mesh(geo('BoxGeometry', 0.82, 0.82, 0.82), [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat]);
    headMesh.castShadow = true; headMesh.receiveShadow = true; head.add(headMesh);
    head.add(box(0.28, 0.2, 0.3, skin, 0, -0.5, 0)); // hals

    // hår
    const hs = cfg.harstil || 'kort';
    const H = hair;
    if (hs !== 'flint') head.add(box(0.88, 0.26, 0.88, H, 0, 0.36, 0));
    if (hs === 'lang') head.add(box(0.9, 0.9, 0.3, H, 0, -0.15, -0.32), box(0.24, 0.7, 0.6, H, -0.36, -0.1, -0.1), box(0.24, 0.7, 0.6, H, 0.36, -0.1, -0.1));
    if (hs === 'lockigt') for (let i = 0; i < 9; i++) head.add(sph(0.2, H, Math.sin(i * 0.7) * 0.42, 0.34 + Math.cos(i * 1.3) * 0.12, Math.cos(i * 0.7) * 0.42));
    if (hs === 'knut') head.add(sph(0.2, H, 0, 0.55, -0.15));
    if (hs === 'hastsvans') head.add(box(0.22, 0.8, 0.22, H, 0, -0.05, -0.5));
    if (hs === 'tuppkam') head.add(box(0.16, 0.5, 0.9, H, 0, 0.6, 0));
    if (hs === 'afro') head.add(sph(0.62, H, 0, 0.3, -0.05));
    if (hs === 'page') head.add(box(0.9, 0.6, 0.3, H, 0, 0, -0.32), box(0.18, 0.62, 0.7, H, -0.4, 0, -0.06), box(0.18, 0.62, 0.7, H, 0.4, 0, -0.06));
    if (hs === 'sidbena') { head.children[head.children.length - 1].position.x = 0.06; head.add(box(0.5, 0.2, 0.3, H, -0.15, 0.3, 0.3)); }
    if (hs === 'flator') head.add(box(0.2, 0.9, 0.2, H, -0.46, -0.3, 0), box(0.2, 0.9, 0.2, H, 0.46, -0.3, 0));
    if (hs === 'kalufs') head.add(box(0.5, 0.3, 0.3, H, 0.08, 0.5, 0.25));

    // hatt / prop
    addHat(cfg.hatt || 'ingen', head, body, torso, cloth);

    g.userData.parts = { body, head, armL, armR, legL, legR };
    g.userData.baseScale = kropp === 'barn' ? 0.72 : 1;
    g.scale.setScalar(g.userData.baseScale);
    return g;
  }

  function addHat(kind, head, body, torso, cloth) {
    const gold = { metal: 0.7, rough: 0.3 }, met = { metal: 0.6, rough: 0.35 }, glass = { opacity: 0.35, rough: 0.1 };
    const brim = (color, w) => box(w || 1.4, 0.08, w || 1.4, color, 0, 0.44, 0);
    const cap = (color, h) => box(0.9, h || 0.3, 0.9, color, 0, 0.5, 0);
    switch (kind) {
      case 'stetoskop': body.add(torus(0.36, 0.05, '#2b2b2b', 0, 1.98, 0.12), cyl(0.12, 0.12, 0.06, '#c0c0c0', 0.28, 1.5, 0.28, 12, met)); break;
      case 'sjukmossa': head.add(cap('#ffffff', 0.24), box(0.3, 0.1, 0.1, '#e63946', 0, 0.56, 0.36), box(0.1, 0.1, 0.3, '#e63946', 0, 0.56, 0.36)); break;
      case 'munskydd': head.add(box(0.7, 0.34, 0.12, '#bde0fe', 0, -0.18, 0.4)); break;
      case 'lampa': head.add(torus(0.46, 0.05, '#1d3557', 0, 0.2, 0), cyl(0.12, 0.12, 0.1, '#ffffff', 0, 0.2, 0.46, 12, { emissive: '#fff3b0', emissiveIntensity: 1 })); break;
      case 'rymdhjalm': head.add(sph(0.62, '#cfe8ff', 0, 0.02, 0, glass), torus(0.5, 0.08, '#ffffff', 0, -0.5, 0).rotateX(Math.PI / 2)); break;
      case 'kockmossa': head.add(cyl(0.42, 0.44, 0.35, '#ffffff', 0, 0.58, 0), sph(0.48, '#ffffff', 0, 0.9, 0)); break;
      case 'pirathatt': head.add(box(1.5, 0.12, 1.1, '#111111', 0, 0.48, 0), box(1.2, 0.4, 0.7, '#111111', 0, 0.72, 0), box(1.22, 0.08, 0.72, '#e63946', 0, 0.56, 0), box(0.5, 0.2, 0.2, '#e9c46a', 0, 0.78, 0.36)); break;
      case 'riddarhjalm': head.add(box(0.94, 0.9, 0.94, '#b0b8c4', 0, 0.06, -0.03, met), box(0.6, 0.12, 0.1, '#222', 0, 0.02, 0.46), box(0.12, 0.5, 0.6, '#e63946', 0, 0.7, -0.1)); break;
      case 'ninjamask': head.add(box(0.9, 0.36, 0.9, '#111111', 0, 0.36, 0), box(0.9, 0.42, 0.9, '#111111', 0, -0.24, 0), box(0.5, 0.5, 0.15, '#111111', 0, 0.1, -0.5)); break;
      case 'antenn': head.add(cyl(0.03, 0.03, 0.6, '#8d99ae', 0, 0.75, 0, 8, met), sph(0.1, '#ff595e', 0, 1.06, 0, { emissive: '#ff595e', emissiveIntensity: 1 })); break;
      case 'hornhjalm': head.add(cap('#8d99ae', 0.36).translateY(-0.02), cone(0.12, 0.5, '#f1e4c8', -0.55, 0.5, 0).rotateZ(1.1), cone(0.12, 0.5, '#f1e4c8', 0.55, 0.5, 0).rotateZ(-1.1)); break;
      case 'krona': head.add(cyl(0.44, 0.44, 0.24, '#ffd60a', 0, 0.58, 0, 8, gold)); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; head.add(box(0.1, 0.24, 0.1, '#ffd60a', Math.cos(a) * 0.42, 0.8, Math.sin(a) * 0.42, gold)); head.add(sph(0.05, ['#e63946', '#4361ee', '#2a9d8f'][i % 3], Math.cos(a) * 0.42, 0.93, Math.sin(a) * 0.42)); } break;
      case 'liten_krona': head.add(cyl(0.22, 0.22, 0.16, '#ffd60a', 0.22, 0.58, 0.1, 6, gold)); break;
      case 'tiara': head.add(torus(0.42, 0.04, '#ffd60a', 0, 0.42, 0, gold).rotateX(Math.PI / 2), sph(0.08, '#ff85c0', 0, 0.55, 0.42)); break;
      case 'brandhjalm': head.add(cap('#e63946', 0.34), box(1.1, 0.08, 1.2, '#e63946', 0, 0.42, -0.15), box(0.3, 0.2, 0.06, '#ffd166', 0, 0.55, 0.46)); break;
      case 'polismossa': head.add(cap('#1d3557', 0.28), box(0.9, 0.06, 0.4, '#111111', 0, 0.4, 0.55), box(0.18, 0.18, 0.06, '#ffd60a', 0, 0.55, 0.46, gold)); break;
      case 'strahatt': head.add(brim('#e9c46a', 1.6), cyl(0.5, 0.5, 0.36, '#e9c46a', 0, 0.62, 0), torus(0.5, 0.05, '#c1121f', 0, 0.5, 0).rotateX(Math.PI / 2)); break;
      case 'cowboyhatt': head.add(brim('#8b5a2b', 1.7), cyl(0.5, 0.52, 0.5, '#8b5a2b', 0, 0.7, 0), torus(0.5, 0.06, '#5a3a1a', 0, 0.5, 0).rotateX(Math.PI / 2)); break;
      case 'deerstalker': head.add(cap('#8b7355', 0.32), box(0.9, 0.06, 0.4, '#8b7355', 0, 0.42, 0.6), box(0.9, 0.06, 0.4, '#8b7355', 0, 0.42, -0.6), box(0.12, 0.5, 0.5, '#8b7355', -0.5, 0.15, 0), box(0.12, 0.5, 0.5, '#8b7355', 0.5, 0.15, 0)); break;
      case 'trollkarlshatt': head.add(brim('#3a0ca3', 1.7), cone(0.5, 1.4, '#3a0ca3', 0, 1.1, 0, 12), sph(0.09, '#ffd60a', 0.2, 1.2, 0.35)); break;
      case 'haxhatt': head.add(brim('#111111', 1.7), cone(0.48, 1.3, '#111111', 0, 1.05, 0, 12), torus(0.4, 0.06, '#7209b7', 0, 0.52, 0).rotateX(Math.PI / 2)); break;
      case 'cape': body.add(box(1.2, 1.7, 0.08, '#8b0000', 0, 1.15, -0.32)); break;
      case 'cape_mask': body.add(box(1.2, 1.6, 0.08, shade(cloth, 0.6), 0, 1.2, -0.32)); head.add(box(0.86, 0.22, 0.12, shade(cloth, 0.5), 0, 0.08, 0.4)); break;
      case 'hockeyhjalm': head.add(cap(cloth, 0.4).translateY(0.02), box(0.9, 0.3, 0.1, '#dfe7ef', 0, 0.06, 0.46, glass)); break;
      case 'skidglasogon': head.add(box(0.9, 0.3, 0.14, '#ff9f1c', 0, 0.1, 0.42), box(0.7, 0.18, 0.16, '#48cae4', 0, 0.1, 0.44, { metal: 0.4, rough: 0.2 })); break;
      case 'dykmask': head.add(box(0.86, 0.36, 0.12, '#023e8a', 0, 0.1, 0.42), box(0.7, 0.24, 0.14, '#bde0fe', 0, 0.1, 0.44, glass), cyl(0.05, 0.05, 0.9, '#ffb703', 0.5, 0.35, 0.2, 8)); break;
      case 'pilotmossa': head.add(cap('#1d3557', 0.28), box(0.9, 0.06, 0.4, '#111111', 0, 0.4, 0.55), box(0.3, 0.1, 0.06, '#ffd60a', 0, 0.5, 0.46, gold)); break;
      case 'sjomansmossa': head.add(cyl(0.52, 0.52, 0.22, '#ffffff', 0, 0.52, 0), torus(0.5, 0.05, '#1d3557', 0, 0.44, 0).rotateX(Math.PI / 2)); break;
      case 'basker': { const b = cyl(0.56, 0.5, 0.22, '#111111', 0.12, 0.5, 0); b.rotation.z = -0.25; head.add(b, cyl(0.03, 0.03, 0.14, '#111111', 0.14, 0.66, 0, 6)); break; }
      case 'horlurar': head.add(torus(0.5, 0.05, '#222', 0, 0.12, 0), cyl(0.2, 0.2, 0.14, cloth, -0.5, 0, 0, 12).rotateZ(Math.PI / 2), cyl(0.2, 0.2, 0.14, cloth, 0.5, 0, 0, 12).rotateZ(Math.PI / 2)); break;
      case 'solglasogon': head.add(box(0.32, 0.2, 0.08, '#111111', -0.2, 0.1, 0.44), box(0.32, 0.2, 0.08, '#111111', 0.2, 0.1, 0.44), box(0.1, 0.05, 0.06, '#111111', 0, 0.12, 0.44)); break;
      case 'glasogon': head.add(torus(0.14, 0.03, '#222', -0.2, 0.1, 0.44), torus(0.14, 0.03, '#222', 0.2, 0.1, 0.44), box(0.1, 0.03, 0.03, '#222', 0, 0.1, 0.44)); break;
      case 'skyddsglasogon': head.add(box(0.86, 0.3, 0.14, '#dfe7ef', 0, 0.1, 0.42, glass), box(0.9, 0.06, 0.9, '#8d99ae', 0, 0.12, 0)); break;
      case 'studentmossa': head.add(cap('#ffffff', 0.22), box(0.9, 0.06, 0.4, '#111111', 0, 0.4, 0.55), torus(0.46, 0.04, '#111111', 0, 0.42, 0).rotateX(Math.PI / 2)); break;
      case 'keps': head.add(cap('#e63946', 0.3), box(0.8, 0.06, 0.45, '#e63946', 0, 0.42, 0.58)); break;
      case 'kattoron': head.add(cone(0.16, 0.34, '#f4a261', -0.3, 0.62, 0, 4), cone(0.16, 0.34, '#f4a261', 0.3, 0.62, 0, 4)); break;
      case 'hundoron': head.add(box(0.2, 0.6, 0.34, '#8b5a2b', -0.5, 0.05, 0), box(0.2, 0.6, 0.34, '#8b5a2b', 0.5, 0.05, 0)); break;
      case 'bjornoron': head.add(sph(0.16, '#6b4423', -0.34, 0.56, 0), sph(0.16, '#6b4423', 0.34, 0.56, 0)); break;
      case 'drakhorn': head.add(cone(0.1, 0.5, '#e9c46a', -0.28, 0.7, -0.1, 6).rotateX(-0.6), cone(0.1, 0.5, '#e9c46a', 0.28, 0.7, -0.1, 6).rotateX(-0.6)); for (let i = 0; i < 4; i++) body.add(cone(0.08, 0.2, '#2d6a4f', 0, 1.2 + i * 0.28, -0.3, 4).rotateX(-1.2)); break;
      case 'clownnasa': head.add(sph(0.14, '#e63946', 0, -0.06, 0.46)); break;
      case 'bygghjalm': head.add(cap('#ffb703', 0.36), box(1.1, 0.06, 1.1, '#ffb703', 0, 0.4, 0)); break;
      case 'kamera': body.add(box(0.5, 0.34, 0.24, '#111111', 0, 1.35, 0.36), cyl(0.12, 0.12, 0.14, '#333', 0, 1.35, 0.52, 12).rotateX(Math.PI / 2)); break;
      case 'tomteluva': { const c = cone(0.5, 1.1, '#c1121f', 0.1, 0.9, 0, 12); c.rotation.z = -0.35; head.add(c, torus(0.46, 0.09, '#ffffff', 0, 0.44, 0).rotateX(Math.PI / 2), sph(0.13, '#ffffff', 0.42, 1.36, 0)); break; }
      case 'haroron': head.add(box(0.2, 0.8, 0.12, '#ffffff', -0.24, 0.8, 0), box(0.2, 0.8, 0.12, '#ffffff', 0.24, 0.8, 0), box(0.1, 0.6, 0.13, '#ffb6c1', -0.24, 0.8, 0.005), box(0.1, 0.6, 0.13, '#ffb6c1', 0.24, 0.8, 0.005)); break;
      case 'hoghatt': head.add(brim('#111111', 1.3), cyl(0.42, 0.42, 0.8, '#111111', 0, 0.85, 0), torus(0.42, 0.05, '#e63946', 0, 0.55, 0).rotateX(Math.PI / 2)); break;
      case 'pumpahatt': head.add(sph(0.36, '#f77f00', 0, 0.62, 0), cyl(0.05, 0.05, 0.2, '#2d6a4f', 0, 0.98, 0, 6)); break;
      case 'pannband': head.add(box(0.9, 0.12, 0.9, cloth === '#ffffff' ? '#e63946' : '#ffffff', 0, 0.2, 0)); break;
      case 'cykelhjalm': head.add(cap(cloth, 0.4).translateY(0.02), box(0.3, 0.1, 0.94, '#111111', 0, 0.62, 0), box(0.3, 0.1, 0.94, '#111111', -0.3, 0.6, 0), box(0.3, 0.1, 0.94, '#111111', 0.3, 0.6, 0)); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ brädets geometri
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function keyOf(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  function ringSpec(n) {
    // n dagar + START (+ BONUS när det behövs för att ringen ska bli jämn)
    const bonus = (n + 1) % 2 === 1;
    const L = n + 1 + (bonus ? 1 : 0);
    const W = 9, H = (L - 2 * W + 4) / 2;
    return { L, W, H, bonus };
  }
  function ringCells(W, H) {
    const c = [];
    for (let x = 0; x < W; x++) c.push([x, H - 1]);
    for (let z = H - 2; z >= 0; z--) c.push([W - 1, z]);
    for (let x = W - 2; x >= 0; x--) c.push([x, 0]);
    for (let z = 1; z <= H - 2; z++) c.push([0, z]);
    return c;
  }
  function boardCenter(m) { const col = m % COLS, row = Math.floor(m / COLS); return { x: (col - (COLS - 1) / 2) * BOARD_GAP, z: (row - 1) * BOARD_GAP }; }
  const MONTH_HUES = [210, 190, 150, 95, 60, 45, 25, 10, 340, 285, 250, 225];
  function monthColor(m, l) { return `hsl(${MONTH_HUES[m]} 55% ${l ?? 70}%)`; }

  // ------------------------------------------------------------ världen
  function World(canvas, opts) {
    const self = this;
    opts = opts || {};
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(50, 1, 0.5, 900);
    this.camera.position.set(0, 40, 40);
    this.hemi = new T.HemisphereLight('#bfe0ff', '#6b7a55', 1.1); this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight('#fff4e0', 2.6); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.02;
    Object.assign(this.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 });
    this.scene.add(this.sun, this.sun.target);
    this.envGroup = new T.Group(); this.boardGroup = new T.Group(); this.npcGroup = new T.Group(); this.fxGroup = new T.Group();
    this.scene.add(this.envGroup, this.boardGroup, this.npcGroup, this.fxGroup);
    this.tiles = new Map();       // dateKey → { mesh, m, idx, pos }
    this.months = [];             // per månad: { cells, spec, center, startPos, tiles[] }
    this.view = 'lutande'; this.tilt = 25; this.yaw = 0; this.zoom = 1;
    this.dark = false; this.rekvisita = true;
    this.figure = null; this.figState = { m: 0, idx: 1, pos: new T.Vector3(), forward: new T.Vector3(0, 0, -1), queue: [], hop: null, t: 0 };
    this.confettiList = []; this.spinning = []; this.time = 0;
    this.camPos = new T.Vector3(0, 40, 40); this.camTarget = new T.Vector3();
    this.onTileClick = opts.onTileClick || (() => {}); this.onHop = opts.onHop || (() => {}); this.onArrive = opts.onArrive || (() => {});
    this.focusMonth = new Date().getMonth();
    this._setupInput(canvas);
    this.resize();
    const clock = new T.Clock();
    const loop = () => { requestAnimationFrame(loop); self._update(Math.min(clock.getDelta(), 0.05)); self.renderer.render(self.scene, self.camera); };
    loop();
  }

  World.prototype.resize = function () {
    const c = this.renderer.domElement, w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };

  // ---------------------------------------------------------------- brädet
  World.prototype.buildYear = function (year, eventsByDate, today) {
    this.year = year; this.events = eventsByDate || {}; this.today = today;
    while (this.boardGroup.children.length) this.boardGroup.remove(this.boardGroup.children[0]);
    this.tiles.clear(); this.months = [];
    for (let m = 0; m < 12; m++) {
      const n = daysIn(year, m), spec = ringSpec(n), cells = ringCells(spec.W, spec.H), c = boardCenter(m);
      const mg = new T.Group(); mg.position.set(c.x, 0, c.z); this.boardGroup.add(mg);
      const bw = spec.W * TILE + 1.2, bh = spec.H * TILE + 1.2;
      const base = box(bw, 0.5, bh, monthColor(m, 32), 0, -0.3, 0, { rough: 0.9 }); base.receiveShadow = true; base.castShadow = false; mg.add(base);
      const rim = box(bw + 0.8, 0.3, bh + 0.8, monthColor(m, 22), 0, -0.45, 0); rim.castShadow = false; mg.add(rim);
      // mittplattan: månadsnamn
      const inner = new T.Mesh(geo('PlaneGeometry', (spec.W - 2) * TILE - 1, (spec.H - 2) * TILE - 1), new T.MeshStandardMaterial({ map: this._centerTexture(m, year), roughness: 0.9 }));
      inner.rotation.x = -Math.PI / 2; inner.position.y = 0.02; inner.receiveShadow = true; inner.userData = { month: m }; mg.add(inner);
      const info = { m, spec, cells, center: c, tiles: [], inner };
      cells.forEach(([gx, gz], idx) => {
        const lx = (gx - (spec.W - 1) / 2) * TILE, lz = (gz - (spec.H - 1) / 2) * TILE;
        let day = null, special = null;
        if (idx === 0) special = 'start'; else if (idx <= n) day = idx; else special = 'bonus';
        const key = day ? keyOf(year, m, day) : `${year}-${m}-${special}`;
        const tile = this._makeTile({ m, day, special, key, gx, gz, spec, idx });
        tile.position.set(lx, 0, lz); mg.add(tile);
        const world = new T.Vector3(c.x + lx, 0.4, c.z + lz);
        const rec = { mesh: tile, m, idx, day, special, key, pos: world, gx, gz };
        info.tiles.push(rec); this.tiles.set(key, rec);
      });
      this.months.push(info);
    }
    this._placeToday();
    this.setNpcMonth(this.focusMonth, true);
  };

  World.prototype._centerTexture = function (m, year) {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = monthColor(m, 78); g.fillRect(0, 0, w, h);
      g.strokeStyle = monthColor(m, 55); g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = monthColor(m, 25); g.textAlign = 'center';
      g.font = 'bold 96px "Segoe UI", system-ui, sans-serif'; g.fillText(D.MANADER[m].toUpperCase(), w / 2, h / 2 + 20);
      g.font = '48px "Segoe UI", system-ui, sans-serif'; g.fillText(String(year), w / 2, h / 2 + 90);
      g.font = '30px "Segoe UI", system-ui, sans-serif'; g.fillText('KALENDERBRÄDET', w / 2, 110);
    });
  };

  World.prototype._tileTexture = function (t) {
    const evs = t.day ? (this.events[t.key] || []) : [];
    const date = t.day ? new Date(this.year, t.m, t.day) : null;
    const wd = date ? (date.getDay() + 6) % 7 : 0;
    const weekend = wd >= 5;
    const isToday = this.today && t.key === this.today;
    const past = date && this.today && t.key < this.today;
    let bg = t.special === 'start' ? '#ffd166' : t.special === 'bonus' ? '#c8b6ff' : weekend ? monthColor(t.m, 84) : '#fbfaf6';
    if (past) bg = t.special ? bg : mix(bg, '#d9d4c7', 0.45);
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = monthColor(t.m, 50); g.fillRect(0, 0, w, 26);
      if (isToday) { g.strokeStyle = '#ff5d8f'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14); }
      g.fillStyle = '#1d1d24'; g.textAlign = 'center';
      if (t.special) {
        g.font = 'bold 54px "Segoe UI", system-ui, sans-serif';
        g.fillText(t.special === 'start' ? 'START' : 'BONUS', w / 2, 120);
        g.font = '70px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        g.fillText(t.special === 'start' ? '🚩' : '🎁', w / 2, 205);
        return;
      }
      g.font = 'bold 88px "Segoe UI", system-ui, sans-serif';
      g.fillStyle = weekend ? '#b23a48' : '#1d1d24'; g.fillText(String(t.day), w / 2, evs.length ? 100 : 130);
      g.font = 'bold 26px "Segoe UI", system-ui, sans-serif'; g.fillStyle = '#ffffff'; g.fillText(D.VECKODAGAR[wd].toUpperCase(), w / 2, 21);
      if (!evs.length) return;
      g.font = '22px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'left';
      evs.slice(0, 3).forEach((e, i) => {
        const typ = D.typAv(e.typ);
        g.fillStyle = typ.farg; g.fillRect(14, 122 + i * 36, 10, 26);
        g.fillStyle = e.klar ? '#8a8a8a' : '#1d1d24';
        const txt = (e.tid ? e.tid + ' ' : '') + (e.titel || '');
        g.fillText(txt.length > 17 ? txt.slice(0, 16) + '…' : txt, 32, 142 + i * 36);
        if (e.klar) { g.fillRect(32, 134 + i * 36, Math.min(txt.length, 17) * 11, 2); }
      });
      if (evs.length > 3) { g.fillStyle = '#555'; g.fillText(`+${evs.length - 3} till`, 32, 244); }
    });
  };

  World.prototype._makeTile = function (t) {
    const side = mat(t.special === 'start' ? '#e0a800' : t.special === 'bonus' ? '#9d7fe0' : monthColor(t.m, 60));
    const top = new T.MeshStandardMaterial({ map: this._tileTexture(t), roughness: 0.75 });
    const m = new T.Mesh(geo('BoxGeometry', TILE - GAP, 0.8, TILE - GAP), [side, side, top, side, side, side]);
    m.position.y = 0; m.castShadow = true; m.receiveShadow = true;
    m.userData = { tile: t.key, day: t.day, m: t.m, special: t.special };
    return m;
  };

  World.prototype.setEvents = function (eventsByDate, keys) {
    this.events = eventsByDate || {};
    const list = keys || [...this.tiles.keys()];
    for (const k of list) {
      const rec = this.tiles.get(k); if (!rec || rec.special) continue;
      const old = rec.mesh.material[2]; rec.mesh.material[2] = new T.MeshStandardMaterial({ map: this._tileTexture({ ...rec, key: k }), roughness: 0.75 });
      if (old.map) old.map.dispose(); old.dispose();
    }
    this.setNpcMonth(this.focusMonth, true);
  };

  World.prototype.setToday = function (todayKey) {
    const old = this.today; this.today = todayKey;
    this.setEvents(this.events, [old, todayKey].filter(Boolean));
    this._placeToday();
  };
  World.prototype._placeToday = function () {
    if (!this.todayRing) { this.todayRing = torus(1.9, 0.12, '#ff5d8f', 0, 0, 0, { emissive: '#ff5d8f', emissiveIntensity: 1.2 }); this.todayRing.rotation.x = Math.PI / 2; this.todayRing.castShadow = false; this.fxGroup.add(this.todayRing); }
    const rec = this.today && this.tiles.get(this.today);
    this.todayRing.visible = !!rec;
    if (rec) this.todayRing.position.set(rec.pos.x, 0.5, rec.pos.z);
  };

  // figurer på dagar med händelser — bara för månaden i fokus (prestanda), sprites för alla
  World.prototype.setNpcMonth = function (m, force) {
    if (!force && this.npcMonth === m) return;
    this.npcMonth = m;
    while (this.npcGroup.children.length) this.npcGroup.remove(this.npcGroup.children[0]);
    for (const [key, rec] of this.tiles) {
      if (rec.special) continue;
      const evs = this.events[key] || []; if (!evs.length) continue;
      const first = evs.find((e) => !e.klar) || evs[0];
      const typ = D.typAv(first.typ);
      const holder = new T.Group(); holder.position.copy(rec.pos); holder.position.y = 0.4;
      // utåt från brädets mitt
      const cx = this.months[rec.m].center;
      const outward = new T.Vector3(rec.pos.x - cx.x, 0, rec.pos.z - cx.z);
      if (Math.abs(outward.x) > Math.abs(outward.z)) outward.z = 0; else outward.x = 0;
      outward.normalize();
      if (rec.m === m) {
        const preset = D.FIGURER.find((f) => f.id === typ.figur) || D.FIGURER[0];
        const fig = buildFigure(resolvePreset(preset));
        fig.scale.setScalar(0.62 * fig.userData.baseScale);
        fig.position.set(-outward.x * 0.9, 0, -outward.z * 0.9);
        fig.rotation.y = Math.atan2(outward.x, outward.z);
        fig.traverse((o) => { if (o.isMesh) o.userData.eventKey = key; });
        holder.add(fig);
        const sp = emojiSprite(typ.emoji, 1.5); sp.position.set(-outward.x * 0.9, 2.5, -outward.z * 0.9); holder.add(sp);
      } else {
        const sp = emojiSprite(typ.emoji, 2.2); sp.position.set(0, 1.6, 0); holder.add(sp);
      }
      if (evs.length > 1) {
        const stack = new T.Group(); stack.position.set(outward.x * 1.1 - outward.z * 1.1, 0, outward.z * 1.1 + outward.x * 1.1);
        evs.slice(1, 6).forEach((e, i) => { const b = box(0.55, 0.35, 0.55, D.typAv(e.typ).farg, 0, 0.18 + i * 0.37, 0); b.userData.eventKey = key; stack.add(b); });
        holder.add(stack);
      }
      holder.userData.eventKey = key;
      this.npcGroup.add(holder);
    }
  };

  function resolvePreset(p) {
    const hud = (D.HUDFARGER.find((h) => h.id === p.hud) || D.HUDFARGER[1]).hex;
    const har = (D.HARFARGER.find((h) => h.id === p.har) || D.HARFARGER[0]).hex;
    return { hud, har, harstil: norm(p.harstil), kropp: p.kropp, stil: norm(p.stil), farg: p.farg, hatt: p.hatt, ansikte: p.ansikte || 'glad' };
  }
  function norm(s) { return String(s || '').replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o'); }

  // ---------------------------------------------------------------- spelaren
  World.prototype.setFigure = function (cfg) {
    if (this.figure) this.fxGroup.remove(this.figure);
    this.figure = buildFigure({ ...cfg, harstil: norm(cfg.harstil), stil: norm(cfg.stil) });
    this.figure.position.copy(this.figState.pos);
    this.figure.rotation.y = Math.atan2(this.figState.forward.x, this.figState.forward.z);
    this.fxGroup.add(this.figure);
  };
  World.prototype.placeAt = function (key) {
    const rec = this.tiles.get(key); if (!rec) return;
    this.figState.m = rec.m; this.figState.idx = rec.idx; this.figState.pos.copy(rec.pos); this.figState.queue = []; this.figState.hop = null;
    if (this.figure) this.figure.position.copy(rec.pos);
    this.focusMonth = rec.m; this.setNpcMonth(rec.m);
  };
  World.prototype.currentKey = function () { const mi = this.months[this.figState.m]; return mi ? mi.tiles[this.figState.idx].key : null; };
  // gå till en dag: kortaste vägen längs ringen, mellan månader via START; långt bort = flyg
  World.prototype.moveTo = function (key) {
    const target = this.tiles.get(key); if (!target) return;
    const s = this.figState;
    const steps = [];
    let m = s.m, idx = s.idx;
    if (s.queue.length) { const last = s.queue[s.queue.length - 1]; m = last.m; idx = last.idx; }
    const guard = 400;
    if (m === target.m) {
      const L = this.months[m].spec.L;
      const fwd = (target.idx - idx + L) % L, back = (idx - target.idx + L) % L;
      const dir = fwd <= back ? 1 : -1, n = Math.min(fwd, back);
      for (let i = 0; i < n; i++) { idx = (idx + dir + L) % L; steps.push({ m, idx }); }
    } else {
      const dir = target.m > m ? 1 : -1;
      let total = 0;
      while (m !== target.m && total < guard) {
        const L = this.months[m].spec.L;
        if (dir === 1) { while (idx !== 0 && total < guard) { idx = (idx + 1) % L; steps.push({ m, idx }); total++; } m++; idx = 0; steps.push({ m, idx }); }
        else { m--; idx = 0; steps.push({ m, idx }); }
        total++;
      }
      const L = this.months[m].spec.L;
      if (dir === 1) { while (idx !== target.idx && total < guard) { idx = (idx + 1) % L; steps.push({ m, idx }); total++; } }
      else { idx = target.idx; steps.push({ m, idx }); }
    }
    if (steps.length > 45) { s.queue = [{ m: target.m, idx: target.idx, fly: true }]; }
    else s.queue.push(...steps);
  };

  World.prototype._update = function (dt) {
    this.time += dt;
    const s = this.figState;
    if (this.figure) {
      const P = this.figure.userData.parts;
      if (!s.hop && s.queue.length) {
        const nxt = s.queue.shift();
        const rec = this.months[nxt.m].tiles[nxt.idx];
        const from = s.pos.clone(), to = rec.pos.clone();
        const dist = from.distanceTo(to);
        s.hop = { from, to, t: 0, dur: nxt.fly ? Math.min(1.6, 0.5 + dist / 90) : dist > TILE * 1.5 ? 0.7 : 0.3, h: nxt.fly ? Math.min(40, dist * 0.35) : dist > TILE * 1.5 ? 4 : 1.6, m: nxt.m, idx: nxt.idx, fly: !!nxt.fly };
        const dir = to.clone().sub(from); dir.y = 0; if (dir.lengthSq() > 0.001) s.forward.copy(dir.normalize());
        this.onHop(rec, s.queue.length);
      }
      if (s.hop) {
        const h = s.hop; h.t += dt / h.dur; const k = Math.min(1, h.t);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        s.pos.lerpVectors(h.from, h.to, e); s.pos.y = h.from.y + Math.sin(k * Math.PI) * h.h;
        const sq = 1 + Math.sin(k * Math.PI) * 0.12; this.figure.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)).multiplyScalar(this.figure.userData.baseScale || 1);
        P.armL.rotation.x = -Math.sin(k * Math.PI) * 1.4; P.armR.rotation.x = -Math.sin(k * Math.PI) * 1.4;
        P.legL.rotation.x = Math.sin(k * Math.PI) * 0.6; P.legR.rotation.x = -Math.sin(k * Math.PI) * 0.6;
        if (k >= 1) { s.m = h.m; s.idx = h.idx; s.pos.copy(h.to); s.hop = null; this.figure.scale.setScalar(this.figure.userData.baseScale || 1); const rec = this.months[s.m].tiles[s.idx]; if (this.focusMonth !== s.m) { this.focusMonth = s.m; this.setNpcMonth(s.m); } this.onArrive(rec, s.queue.length === 0); }
      } else {
        // idle: andas + vinkar lite
        const b = Math.sin(this.time * 2.2) * 0.03;
        this.figure.position.y = s.pos.y + b;
        P.armL.rotation.x = Math.sin(this.time * 1.5) * 0.08; P.armR.rotation.x = -Math.sin(this.time * 1.5) * 0.08;
        P.legL.rotation.x = 0; P.legR.rotation.x = 0;
      }
      this.figure.position.x = s.pos.x; this.figure.position.z = s.pos.z; if (s.hop) this.figure.position.y = s.pos.y;
      const targetRot = Math.atan2(s.forward.x, s.forward.z);
      let d = targetRot - this.figure.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.figure.rotation.y += d * Math.min(1, dt * 10);
    }
    // dagens ring pulserar
    if (this.todayRing) { const p = 1 + Math.sin(this.time * 3) * 0.06; this.todayRing.scale.set(p, p, 1); }
    // snurrande saker (vindmöllor)
    for (const o of this.spinning) o.rotation.z += dt * 1.2;
    if (this.flagMesh) this.flagMesh.rotation.y = Math.sin(this.time * 2.5) * 0.12;
    // konfetti
    for (let i = this.confettiList.length - 1; i >= 0; i--) {
      const c = this.confettiList[i]; c.life -= dt;
      const M = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1);
      for (let j = 0; j < c.n; j++) {
        const p = c.p[j]; p.v.y -= 9.8 * dt * 0.6; p.v.multiplyScalar(1 - dt * 0.9); p.x.addScaledVector(p.v, dt); p.r += dt * p.w;
        if (p.x.y < 0.45) { p.x.y = 0.45; p.v.set(0, 0, 0); }
        q.setFromEuler(new T.Euler(p.r, p.r * 0.7, p.r * 1.3)); M.compose(p.x, q, sc); c.mesh.setMatrixAt(j, M);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
      if (c.life < 1) c.mesh.material.opacity = Math.max(0, c.life);
      if (c.life <= 0) { this.fxGroup.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose(); this.confettiList.splice(i, 1); }
    }
    this._updateCamera(dt);
  };

  World.prototype.confetti = function (pos, n) {
    n = n || 220;
    const g = new T.BoxGeometry(0.28, 0.06, 0.2);
    const m = new T.MeshStandardMaterial({ vertexColors: false, roughness: 0.6, transparent: true, opacity: 1 });
    const mesh = new T.InstancedMesh(g, m, n); mesh.castShadow = true;
    const colors = ['#ff5d8f', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#7209b7', '#ffffff'];
    const col = new T.Color();
    const p = [];
    for (let i = 0; i < n; i++) {
      col.set(colors[i % colors.length]); mesh.setColorAt(i, col);
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
      p.push({ x: pos.clone().add(new T.Vector3(0, 1.5, 0)), v: new T.Vector3(Math.cos(a) * sp * 0.6, 6 + Math.random() * 7, Math.sin(a) * sp * 0.6), r: Math.random() * 6, w: (Math.random() - 0.5) * 12 });
    }
    mesh.instanceColor.needsUpdate = true;
    this.fxGroup.add(mesh);
    this.confettiList.push({ mesh, p, n, life: 4.5 });
  };

  // ---------------------------------------------------------------- kameran
  World.prototype.setView = function (v) { this.view = v; };
  World.prototype._updateCamera = function (dt) {
    const s = this.figState, mi = this.months[this.focusMonth] || this.months[0];
    if (!mi) return;
    const c = mi.center, bw = mi.spec.W * TILE, target = new T.Vector3(), pos = new T.Vector3();
    const yaw = this.yaw, z = this.zoom;
    if (this.view === 'perspektiv') {
      const f = s.forward.clone(), up = new T.Vector3(0, 1, 0);
      const behind = f.clone().applyAxisAngle(up, yaw);
      pos.copy(s.pos).addScaledVector(behind, -11 * z).add(new T.Vector3(0, 6.5 * z, 0));
      target.copy(s.pos).addScaledVector(behind, 4).add(new T.Vector3(0, 1.2, 0));
      this.camPos.lerp(pos, Math.min(1, dt * 4)); this.camTarget.lerp(target, Math.min(1, dt * 6));
    } else if (this.view === 'ovan') {
      target.set(c.x, 0, c.z); pos.set(c.x, bw * 1.25 * z, c.z);
      this.camPos.lerp(pos, Math.min(1, dt * 3)); this.camTarget.lerp(target, Math.min(1, dt * 3));
    } else if (this.view === 'hela') {
      target.set(0, 0, 4); const dist = 150 * z;
      pos.set(Math.sin(yaw) * dist * 0.55, dist * 0.95, Math.cos(yaw) * dist * 0.55);
      this.camPos.lerp(pos, Math.min(1, dt * 2.5)); this.camTarget.lerp(target, Math.min(1, dt * 2.5));
    } else { // lutande
      const el = T.MathUtils.degToRad(Math.max(10, Math.min(80, this.tilt)));
      const dist = bw * 1.35 * z;
      target.set(c.x, 0, c.z);
      pos.set(c.x + Math.sin(yaw) * Math.cos(el) * dist, Math.sin(el) * dist, c.z + Math.cos(yaw) * Math.cos(el) * dist);
      this.camPos.lerp(pos, Math.min(1, dt * 3)); this.camTarget.lerp(target, Math.min(1, dt * 3));
    }
    this.camera.position.copy(this.camPos);
    if (this.view === 'ovan') this.camera.up.set(-Math.sin(yaw), 0, -Math.cos(yaw)); else this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camTarget);
    // solen och skuggrutan följer fokusmånaden
    this.sun.position.set(c.x + 30, 60, c.z + 25); this.sun.target.position.set(c.x, 0, c.z);
    const span = this.view === 'hela' ? 120 : 34;
    if (this.sun.shadow.camera.right !== span) { Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span }); this.sun.shadow.camera.updateProjectionMatrix(); }
  };

  World.prototype._setupInput = function (canvas) {
    const self = this; let down = null, moved = false, pinch = 0;
    const ray = new T.Raycaster(), v2 = new T.Vector2();
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw: self.yaw }; moved = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved) self.yaw = down.yaw - dx * 0.006;
    });
    canvas.addEventListener('pointerup', (e) => {
      const wasDown = down; down = null;
      if (!wasDown || moved) return;
      const r = canvas.getBoundingClientRect();
      v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v2, self.camera);
      const hits = ray.intersectObjects([self.boardGroup, self.npcGroup], true);
      for (const h of hits) {
        let o = h.object, found = null;
        while (o && !found) { if (o.userData.eventKey) found = { tile: o.userData.eventKey, event: true }; else if (o.userData.tile) found = { tile: o.userData.tile, special: o.userData.special, m: o.userData.m }; else if (o.userData.month != null) found = { month: o.userData.month }; o = o.parent; }
        if (found) { self.onTileClick(found); return; }
      }
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); self.zoom = Math.max(0.35, Math.min(2.6, self.zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
    canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    canvas.addEventListener('touchmove', (e) => { if (e.touches.length === 2 && pinch) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); self.zoom = Math.max(0.35, Math.min(2.6, self.zoom * (pinch / d))); pinch = d; } }, { passive: true });
    addEventListener('resize', () => self.resize());
  };

  // ---------------------------------------------------------------- miljö
  World.prototype.setEnvironment = function (landId, o) {
    o = o || {};
    this.dark = !!o.dark; this.rekvisita = o.rekvisita !== false;
    const land = D.LANDER.find((l) => l.id === landId) || D.LANDER[0];
    const biom = D.BIOM[land.biom] || D.BIOM.skog;
    const E = this.envGroup; while (E.children.length) E.remove(E.children[0]);
    this.spinning = []; this.flagMesh = null;
    const dark = this.dark, rymd = !!biom.rymd;
    const sky = rymd ? biom.himmel : dark ? mix(biom.himmel, '#050818', 0.85) : biom.himmel;
    const dis = rymd ? biom.dis : dark ? mix(biom.dis, '#050818', 0.85) : biom.dis;
    this.scene.background = new T.Color(sky);
    this.scene.fog = rymd ? null : new T.Fog(dis, 90, 420);
    this.hemi.color.set(dark ? '#3a4a80' : '#bfe0ff'); this.hemi.groundColor.set(dark ? '#1a1a2a' : biom.mark); this.hemi.intensity = dark ? 0.7 : 1.1;
    this.sun.color.set(dark ? '#9fb4ff' : '#fff4e0'); this.sun.intensity = dark ? 1.1 : 2.6;
    this.renderer.toneMappingExposure = dark ? 0.85 : 1.05;
    const groundCol = dark ? mix(biom.mark, '#101020', 0.55) : biom.mark;
    const ground = new T.Mesh(geo('CircleGeometry', 520, 48), mat(groundCol, { rough: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62; ground.receiveShadow = true; E.add(ground);
    if (biom.vatten) { const w = new T.Mesh(geo('CircleGeometry', 800, 48), mat(dark ? '#0b2a4a' : '#39a0d8', { rough: 0.25, metal: 0.1 })); w.rotation.x = -Math.PI / 2; w.position.y = -0.9; E.add(w); ground.geometry = geo('CircleGeometry', 150, 48); }
    if (rymd || dark) { // stjärnor
      const n = 900, pos = new Float32Array(n * 3), r = rng(7);
      for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, b = r() * Math.PI * 0.5; pos[i * 3] = Math.cos(a) * Math.cos(b) * 700; pos[i * 3 + 1] = Math.sin(b) * 700 + 10; pos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * 700; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      E.add(new T.Points(g, new T.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: true, fog: false })));
      if (dark && !rymd) E.add(sph(9, '#fff6d5', -220, 160, -260, { emissive: '#fff6d5', emissiveIntensity: 1.5 }));
    } else {
      const r = rng(11); for (let i = 0; i < 18; i++) { const c = grp(sph(6, '#ffffff', 0, 0, 0), sph(4.5, '#ffffff', 6, 1, 1), sph(4, '#ffffff', -5, 0.5, -1)); c.position.set((r() - 0.5) * 500, 70 + r() * 40, (r() - 0.5) * 500); c.traverse((q) => { q.castShadow = false; }); E.add(c); }
    }
    // rekvisita runt brädena
    if (this.rekvisita) {
      const r = rng(land.id.length * 131 + 7);
      const inBoard = (x, z) => { for (let m = 0; m < 12; m++) { const c = boardCenter(m); if (Math.abs(x - c.x) < 22 && Math.abs(z - c.z) < 22) return true; } return false; };
      let placed = 0, tries = 0;
      while (placed < 150 && tries < 1500) {
        tries++;
        const x = (r() - 0.5) * 300, z = (r() - 0.5) * 240 - 10;
        if (inBoard(x, z)) continue;
        const kind = biom.rekvisita[Math.floor(r() * biom.rekvisita.length)];
        const p = buildProp(kind, r, dark); if (!p) continue;
        p.position.set(x, -0.6, z); p.rotation.y = r() * Math.PI * 2; const sc = 0.8 + r() * 0.7; p.scale.setScalar(sc);
        E.add(p); placed++;
      }
      // bergskedja i fjärran
      if (!rymd) for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const mt = buildProp('berg', r, dark); mt.position.set(Math.cos(a) * 330, -0.6, Math.sin(a) * 330); mt.scale.setScalar(2.5 + r() * 2); E.add(mt); }
    }
    // landmärket bakom brädena
    const lm = buildLandmark(land.landmarke, this, dark); if (lm) { lm.position.set(0, -0.6, -125); E.add(lm); }
    // flaggan vid januari-start
    const fl = grp(cyl(0.12, 0.12, 9, '#dddddd', 0, 4.5, 0, 8), sph(0.3, '#ffd60a', 0, 9.1, 0));
    const flag = new T.Mesh(geo('PlaneGeometry', 4.5, 3), new T.MeshStandardMaterial({ map: flagTexture(land.flagga), side: T.DoubleSide, roughness: 0.9 }));
    flag.position.set(2.3, 7.5, 0); fl.add(flag); this.flagMesh = flag;
    fl.position.set(boardCenter(0).x - 24, -0.6, boardCenter(0).z + 22); E.add(fl);
  };

  function buildProp(kind, r, dark) {
    const glow = dark ? { emissive: '#ffd27a', emissiveIntensity: 1.5 } : undefined;
    switch (kind) {
      case 'gran': return grp(cyl(0.3, 0.4, 2, '#5a3a1a', 0, 1, 0, 8), cone(2.2, 4, '#2d6a4f', 0, 4, 0, 8), cone(1.7, 3.2, '#40916c', 0, 6, 0, 8), cone(1.1, 2.4, '#52b788', 0, 7.8, 0, 8));
      case 'gran_sno': return grp(cyl(0.3, 0.4, 2, '#5a3a1a', 0, 1, 0, 8), cone(2.2, 4, '#2d6a4f', 0, 4, 0, 8), cone(1.7, 3.2, '#ffffff', 0, 6, 0, 8), cone(1.1, 2.4, '#ffffff', 0, 7.8, 0, 8));
      case 'lov': return grp(cyl(0.35, 0.5, 3, '#6b4423', 0, 1.5, 0, 8), sph(2.6, '#4f9d3a', 0, 4.6, 0), sph(1.8, '#6fbf4e', 1.4, 5.4, 0.6), sph(1.6, '#3f8f2f', -1.2, 5.2, -0.5));
      case 'korsbar': return grp(cyl(0.35, 0.5, 3, '#5a3a2a', 0, 1.5, 0, 8), sph(2.6, '#ffb7d5', 0, 4.6, 0), sph(1.8, '#ffd1e3', 1.4, 5.4, 0.6), sph(1.6, '#ff9ec6', -1.2, 5.2, -0.5));
      case 'sten': return mesh(geo('DodecahedronGeometry', 1.4, 0), mat('#8a8f8a', { flat: true }), 0, 0.8, 0);
      case 'sten_mane': return mesh(geo('DodecahedronGeometry', 1.6, 0), mat('#6b6b80', { flat: true }), 0, 0.9, 0);
      case 'krater': { const t = torus(3, 0.8, '#3a3a55', 0, 0.2, 0); t.rotation.x = Math.PI / 2; t.scale.y = 1; return grp(t); }
      case 'kaktus': return grp(cyl(0.6, 0.7, 4, '#3a7d44', 0, 2, 0, 8), cyl(0.35, 0.35, 1.8, '#3a7d44', 1.1, 2.6, 0, 8).rotateZ(0.2), cyl(0.35, 0.35, 1.4, '#3a7d44', -1.0, 2.2, 0, 8).rotateZ(-0.2));
      case 'dyn': { const s = sph(6, '#efd39a', 0, -3, 0); s.scale.set(1.6, 0.6, 1); return grp(s); }
      case 'palm': { const g = grp(); for (let i = 0; i < 5; i++) g.add(cyl(0.3, 0.38, 1.4, '#8b5a2b', i * 0.25, 0.7 + i * 1.3, 0, 7)); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const l = box(3.2, 0.15, 0.9, '#2f9e44', Math.cos(a) * 1.5 + 1.2, 7, Math.sin(a) * 1.5); l.rotation.y = -a; l.rotation.z = 0.35; g.add(l); } g.add(sph(0.35, '#6b4423', 1.2, 6.8, 0)); return g; }
      case 'blomma': return grp(cyl(0.06, 0.06, 1.2, '#2f9e44', 0, 0.6, 0, 6), sph(0.4, ['#ff5d8f', '#ffd166', '#c77dff', '#ff8fab'][Math.floor(r() * 4)], 0, 1.3, 0));
      case 'akacia': { const c = cyl(3.2, 2.4, 1.2, '#4c8a3f', 0, 5, 0, 10); return grp(cyl(0.3, 0.45, 4.6, '#6b4423', 0, 2.3, 0, 7), c); }
      case 'gras': { const g = grp(); for (let i = 0; i < 6; i++) g.add(box(0.15, 1.2 + r(), 0.15, '#9bbf5a', (r() - 0.5) * 1.5, 0.6, (r() - 0.5) * 1.5)); return g; }
      case 'hus': { const col = ['#f4d6a0', '#e8a5a5', '#a8d5ba', '#d7c7ee'][Math.floor(r() * 4)]; return grp(box(4, 3, 4, col, 0, 1.5, 0), cone(3.3, 2.2, '#8b3a3a', 0, 4.1, 0, 4).rotateY(Math.PI / 4), box(0.9, 1.4, 0.1, '#5a3a1a', 0, 0.7, 2.02), box(0.8, 0.8, 0.1, '#ffe9a8', 1.2, 1.8, 2.02, glow)); }
      case 'hus_vit': return grp(box(4, 3.5, 4, '#ffffff', 0, 1.75, 0), sph(1.6, '#1f6fd1', 0, 3.9, 0), box(0.8, 1.4, 0.1, '#1f6fd1', 0, 0.7, 2.02));
      case 'stuga': return grp(box(5, 3, 4, '#a4343a', 0, 1.5, 0), cone(3.9, 2.4, '#3a3a3a', 0, 4.2, 0, 4).rotateY(Math.PI / 4), box(0.8, 1.4, 0.1, '#ffffff', 0, 0.7, 2.02), box(0.9, 0.9, 0.1, '#ffe9a8', 1.6, 1.8, 2.02, glow), box(0.9, 0.9, 0.1, '#ffe9a8', -1.6, 1.8, 2.02, glow));
      case 'skyskrapa': { const h = 10 + r() * 16; const b = box(4, h, 4, dark ? '#2a3550' : '#9fb3c8', 0, h / 2, 0, { metal: 0.3, rough: 0.4 }); const g = grp(b); for (let i = 1; i < h / 2; i++) for (let j = -1; j <= 1; j++) g.add(box(0.7, 0.9, 0.05, dark && r() > 0.3 ? '#ffe9a8' : '#dbeafe', j * 1.3, i * 2, 2.03, dark && r() > 0.3 ? glow : undefined)); return g; }
      case 'lykta': return grp(cyl(0.12, 0.15, 4, '#333', 0, 2, 0, 6), sph(0.45, '#fff2b0', 0, 4.2, 0, dark ? { emissive: '#ffd27a', emissiveIntensity: 2.5 } : undefined));
      case 'berg': return grp(cone(9, 14, '#7a8a7a', 0, 7, 0, 6, { flat: true }), cone(3.2, 5, '#ffffff', 0, 11.6, 0, 6, { flat: true }));
      case 'bat': return grp(box(4, 1, 1.6, '#8b5a2b', 0, 0.5, 0), cyl(0.08, 0.08, 4, '#ddd', 0, 3, 0, 6), mesh(geo('PlaneGeometry', 2.2, 3), new T.MeshStandardMaterial({ color: '#ffffff', side: T.DoubleSide }), 1.1, 3, 0));
      case 'fyr': return grp(cyl(1.2, 1.6, 8, '#ffffff', 0, 4, 0, 12), cyl(1.25, 1.25, 1.2, '#e63946', 0, 2, 0, 12), cyl(1.25, 1.25, 1.2, '#e63946', 0, 5, 0, 12), cyl(1, 1, 1.4, '#ffe9a8', 0, 8.7, 0, 12, { emissive: '#ffe9a8', emissiveIntensity: 1.6 }), cone(1.3, 1, '#333', 0, 9.9, 0, 12));
      case 'igloo': { const s = sph(2.4, '#f4f8ff', 0, 0, 0); s.scale.y = 0.7; return grp(s, cyl(0.9, 0.9, 1.6, '#e0e8f4', 0, 0.6, 2.2, 10).rotateX(Math.PI / 2)); }
      case 'jurta': return grp(cyl(2.6, 2.6, 2, '#f1e9d2', 0, 1, 0, 12), cone(2.9, 1.6, '#c9a86a', 0, 2.8, 0, 12), box(0.9, 1.4, 0.1, '#8b3a3a', 0, 0.7, 2.62));
      case 'oliv': return grp(cyl(0.4, 0.6, 2.4, '#7a5a3a', 0, 1.2, 0, 7), sph(2, '#8fa96f', 0, 3.4, 0), sph(1.4, '#a3b98a', 1.2, 3.8, 0.4));
      case 'cypress': return grp(cyl(0.2, 0.3, 1, '#5a3a1a', 0, 0.5, 0, 6), cone(1.1, 7, '#2d5a3a', 0, 4.5, 0, 8));
      case 'ko': return grp(box(2.4, 1.3, 1.1, '#ffffff', 0, 1.3, 0), box(0.9, 0.8, 0.8, '#ffffff', 1.5, 1.7, 0), box(0.8, 0.5, 0.6, '#1b1b1b', -0.4, 1.5, 0.3), box(0.25, 0.7, 0.25, '#1b1b1b', -0.8, 0.35, 0.35), box(0.25, 0.7, 0.25, '#1b1b1b', 0.8, 0.35, -0.35), box(0.25, 0.7, 0.25, '#1b1b1b', -0.8, 0.35, -0.35), box(0.25, 0.7, 0.25, '#1b1b1b', 0.8, 0.35, 0.35));
      case 'lava': { const c = mesh(geo('CircleGeometry', 2.2, 12), mat('#ff6b1a', { emissive: '#ff4d00', emissiveIntensity: 1.5 }), 0, 0.03, 0); c.rotation.x = -Math.PI / 2; return grp(c); }
      case 'snogubbe': return grp(sph(1.3, '#ffffff', 0, 1.1, 0), sph(1, '#ffffff', 0, 2.9, 0), sph(0.75, '#ffffff', 0, 4.3, 0), cone(0.12, 0.7, '#ff7f11', 0, 4.3, 0.9, 6).rotateX(Math.PI / 2), cyl(0.5, 0.5, 0.7, '#111', 0, 5.2, 0, 10), cyl(0.8, 0.8, 0.1, '#111', 0, 4.9, 0, 10));
      case 'raket': return grp(cyl(1, 1.2, 7, '#f2f2f2', 0, 3.5, 0, 12, { metal: 0.4, rough: 0.3 }), cone(1.05, 2.5, '#e63946', 0, 8.2, 0, 12), box(0.3, 2.2, 1.6, '#e63946', 0, 1, 1.4), box(0.3, 2.2, 1.6, '#e63946', 0, 1, -1.4), box(1.6, 2.2, 0.3, '#e63946', 1.4, 1, 0), box(1.6, 2.2, 0.3, '#e63946', -1.4, 1, 0), sph(0.5, '#48cae4', 0, 5, 1));
      default: return null;
    }
  }

  // landmärken: byggda 3–4× större än rekvisitan, ett per land
  function buildLandmark(kind, world, dark) {
    const g = new T.Group(); const r = rng(kind.length * 17);
    const mtn = (col, s, x) => { const m = buildProp('berg', r, dark); m.scale.setScalar(s); m.position.x = x || 0; if (col) m.children[0].material = mat(col, { flat: true }); return m; };
    const fig = (preset, scale, col) => { const p = D.FIGURER.find((f) => f.id === preset) || D.FIGURER[0]; const c = resolvePreset(p); if (col) { c.farg = col; c.hud = col; c.har = col; } const f = buildFigure(c); f.scale.setScalar(scale); return f; };
    switch (kind) {
      case 'stuga_rod': { const s = buildProp('stuga', r, dark); s.scale.setScalar(3.5); g.add(s); for (let i = 0; i < 4; i++) { const t = buildProp('gran', r, dark); t.scale.setScalar(2.2); t.position.set(-22 + i * 14, 0, -8 - r() * 6); g.add(t); } break; }
      case 'fjord': { g.add(mtn('#6f7f8a', 4, -30), mtn('#6f7f8a', 5, 30)); const w = mesh(geo('PlaneGeometry', 40, 90), mat('#2e7fbf', { rough: 0.2, metal: 0.1 }), 0, 0.1, 10); w.rotation.x = -Math.PI / 2; g.add(w); break; }
      case 'vindmolla': { for (let k = 0; k < 3; k++) { const t = grp(cyl(1.2, 2.2, 18, '#f2f2f2', 0, 9, 0, 10), box(2.4, 2.4, 2.4, '#8b3a3a', 0, 18.5, 0)); const bl = new T.Group(); bl.position.set(0, 18.5, 1.5); for (let i = 0; i < 4; i++) { const b = box(1.4, 9, 0.3, '#f8f8f8', 0, 4.8, 0); b.rotation.z = i * Math.PI / 2; const bb = new T.Group(); bb.rotation.z = i * Math.PI / 2; bb.add(box(1.2, 9, 0.25, '#f8f8f8', 0, 4.8, 0)); bl.add(bb); } t.add(bl); world.spinning.push(bl); t.position.set(-28 + k * 28, 0, 0); g.add(t); } break; }
      case 'bastu': { const s = grp(box(12, 8, 10, '#6b4423', 0, 4, 0), cone(9.5, 5, '#3a3a3a', 0, 10.5, 0, 4).rotateY(Math.PI / 4), cyl(0.8, 0.8, 4, '#555', 3, 12, 0, 8)); for (let i = 0; i < 5; i++) s.add(sph(1 + i * 0.4, '#dddddd', 3 + i * 0.6, 15 + i * 2.2, 0, { opacity: 0.6 - i * 0.1 })); const w = mesh(geo('PlaneGeometry', 60, 40), mat('#2e7fbf', { rough: 0.2 }), 0, 0.1, 30); w.rotation.x = -Math.PI / 2; g.add(s, w); break; }
      case 'vulkan': { g.add(cone(30, 34, '#4a3a36', 0, 17, 0, 10, { flat: true }), cyl(6, 8, 3, '#ff5a1f', 0, 34, 0, 10, { emissive: '#ff3d00', emissiveIntensity: 2 })); for (let i = 0; i < 5; i++) g.add(sph(2.5 + i, '#777', 0, 38 + i * 4, 0, { opacity: 0.5 - i * 0.08 })); const l = buildProp('lava', r, dark); l.scale.setScalar(3); l.position.set(18, 0, 14); g.add(l); break; }
      case 'bigben': { const tex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#f5f0dc'; c.fillRect(0, 0, w, h); c.strokeStyle = '#222'; c.lineWidth = 5; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.stroke(); c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 24); c.moveTo(64, 64); c.lineTo(92, 64); c.stroke(); }); const clockM = new T.MeshStandardMaterial({ map: tex }); const tower = box(8, 44, 8, '#c8b68a', 0, 22, 0); const clockTop = new T.Mesh(geo('BoxGeometry', 9, 9, 9), [clockM, clockM, mat('#c8b68a'), mat('#c8b68a'), clockM, clockM]); clockTop.position.y = 48; g.add(tower, clockTop, cone(6.5, 10, '#3f5a3a', 0, 57.5, 0, 4).rotateY(Math.PI / 4)); break; }
      case 'slott': { g.add(box(36, 14, 20, '#b9b2a2', 0, 7, 0)); for (const [x, z] of [[-18, -10], [18, -10], [-18, 10], [18, 10]]) g.add(cyl(4, 4, 24, '#c9c2b2', x, 12, z, 12), cone(5, 7, '#7a2e2e', x, 27.5, z, 12)); g.add(box(6, 9, 1, '#5a3a1a', 0, 4.5, 10.3)); for (let i = -3; i <= 3; i++) g.add(box(3, 3, 3, '#b9b2a2', i * 5, 15.5, 9)); break; }
      case 'eiffel': { const col = '#6b5a4a'; g.add(cyl(9, 22, 22, col, 0, 11, 0, 4, { flat: true }), box(22, 1.5, 22, col, 0, 22, 0), cyl(4, 9, 20, col, 0, 32, 0, 4, { flat: true }), box(10, 1.2, 10, col, 0, 42, 0), cyl(1.2, 4, 28, col, 0, 56, 0, 4, { flat: true }), cyl(0.2, 0.2, 8, col, 0, 74, 0, 6)); g.rotation.y = Math.PI / 4; break; }
      case 'atomium': { const pts = [[0, 0, 0], [12, 12, 12], [-12, 12, 12], [12, 12, -12], [-12, 12, -12], [12, -12, 12], [-12, -12, 12], [12, -12, -12], [-12, -12, -12]]; const c = new T.Group(); c.position.y = 24; for (const [x, y, z] of pts) c.add(sph(4.5, '#c0c8d0', x, y, z, { metal: 0.9, rough: 0.2 })); for (let i = 1; i < 9; i++) { const a = new T.Vector3(...pts[i]), l = a.length(); const cy = cyl(0.8, 0.8, l, '#c0c8d0', 0, 0, 0, 8, { metal: 0.9, rough: 0.2 }); cy.position.copy(a.clone().multiplyScalar(0.5)); cy.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), a.clone().normalize()); c.add(cy); } c.rotation.z = Math.PI / 5; c.rotation.x = Math.PI / 5; g.add(c, cyl(1.5, 2.5, 14, '#c0c8d0', 0, 7, 0, 8)); break; }
      case 'sagrada': { g.add(box(30, 16, 18, '#c8b68a', 0, 8, 0)); for (const [x, h] of [[-10, 40], [-3.5, 46], [3.5, 46], [10, 40]]) g.add(cone(3, h, '#b8a67a', x, h / 2 + 4, 0, 8), sph(1.2, '#e63946', x, h + 4.8, 0)); break; }
      case 'fyr': { const f = buildProp('fyr', r, dark); f.scale.setScalar(3.5); g.add(f); for (let i = 0; i < 4; i++) { const s = buildProp('sten', r, dark); s.scale.setScalar(3); s.position.set(-14 + i * 9, 0, 8); g.add(s); } break; }
      case 'colosseum': { const shape = new T.Shape(); shape.absellipse(0, 0, 26, 20, 0, Math.PI * 2, false, 0); const hole = new T.Path(); hole.absellipse(0, 0, 20, 14, 0, Math.PI * 2, true, 0); shape.holes.push(hole); const geoE = new T.ExtrudeGeometry(shape, { depth: 18, bevelEnabled: false }); const ring = new T.Mesh(geoE, mat('#d8c8a0')); ring.rotation.x = -Math.PI / 2; ring.castShadow = true; ring.receiveShadow = true; g.add(ring); for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; for (let k = 0; k < 3; k++) g.add(box(2.6, 4, 1.5, '#5a4a30', Math.cos(a) * 26.2, 3 + k * 6, Math.sin(a) * 20.2).rotateY(-a)); } break; }
      case 'matterhorn': { g.add(cone(16, 46, '#6f7f8a', 0, 23, 0, 5, { flat: true }), cone(6, 16, '#ffffff', 0, 38, 0, 5, { flat: true })); g.children[0].scale.x = 0.7; g.children[1].scale.x = 0.7; g.add(mtn('#7a8a7a', 2.5, -34), mtn('#7a8a7a', 2.2, 32)); break; }
      case 'everest': { g.add(cone(22, 60, '#8a95a0', 0, 30, 0, 6, { flat: true }), cone(9, 24, '#ffffff', 0, 48, 0, 6, { flat: true }), mtn('#8a95a0', 3, -40), mtn('#8a95a0', 3.4, 42)); break; }
      case 'kilimanjaro': { g.add(cone(40, 36, '#7a6a5a', 0, 18, 0, 10, { flat: true }), cyl(6, 12, 8, '#ffffff', 0, 38, 0, 10, { flat: true })); const a = buildProp('akacia', r, dark); a.scale.setScalar(3); a.position.set(-30, 0, 30); g.add(a); break; }
      case 'taffelberg': { g.add(box(70, 26, 24, '#7a7365', 0, 13, 0), box(74, 3, 28, '#5f5a4f', 0, 1.5, 0)); g.children[0].geometry = geo('CylinderGeometry', 30, 36, 26, 4); g.children[0].rotation.y = Math.PI / 4; break; }
      case 'parthenon': { g.add(box(46, 3, 24, '#e6ddc8', 0, 1.5, 0)); for (let i = 0; i < 8; i++) g.add(cyl(1.4, 1.5, 14, '#efe6d2', -21 + i * 6, 10, 10, 10), cyl(1.4, 1.5, 14, '#efe6d2', -21 + i * 6, 10, -10, 10)); g.add(box(48, 2.5, 26, '#e6ddc8', 0, 18.2, 0)); const roof = cyl(14, 14, 48, '#e6ddc8', 0, 25, 0, 3); roof.rotation.z = Math.PI / 2; roof.scale.set(0.5, 1, 1); g.add(roof); break; }
      case 'hus_vit': { for (let i = 0; i < 5; i++) { const h = buildProp('hus_vit', r, dark); h.scale.setScalar(2.6 + r()); h.position.set(-30 + i * 15, i % 2 ? 6 : 0, (i % 2) * -10); g.add(h); } break; }
      case 'moske': { g.add(box(36, 16, 30, '#efe6d2', 0, 8, 0), sph(12, '#2a9d8f', 0, 18, 0)); for (const [x, z] of [[-20, -17], [20, -17], [-20, 17], [20, 17]]) g.add(cyl(1.6, 1.8, 40, '#efe6d2', x, 20, z, 10), cone(2.2, 5, '#2a9d8f', x, 42.5, z, 10)); break; }
      case 'kreml': { g.add(box(50, 12, 6, '#a4343a', 0, 6, 8)); for (let i = -5; i <= 5; i++) g.add(box(2.5, 2, 6, '#a4343a', i * 4.5, 13, 8)); g.add(box(12, 30, 12, '#a4343a', 0, 15, -4), cone(8, 12, '#2d6a4f', 0, 36, -4, 4).rotateY(Math.PI / 4), sph(1.5, '#e63946', 0, 43, -4)); for (const [x, s] of [[-18, 5], [18, 4]]) { g.add(cyl(s * 0.8, s * 0.8, 14, '#efe6d2', x, 7, -6, 12)); const o = sph(s, '#ffd60a', x, 17, -6, { metal: 0.7, rough: 0.3 }); o.scale.y = 1.3; g.add(o, cone(s * 0.5, s, '#ffd60a', x, 17 + s * 1.5, -6, 12, { metal: 0.7, rough: 0.3 })); } break; }
      case 'kyrka_guld': case 'kyrka_sten': { const gold = kind === 'kyrka_guld'; g.add(box(26, 18, 20, gold ? '#ffffff' : '#8f8778', 0, 9, 0)); for (const [x, z, s] of [[0, 0, 7], [-9, -6, 4], [9, -6, 4], [-9, 6, 4], [9, 6, 4]]) { const o = sph(s, gold ? '#ffd60a' : '#4a5a6a', x, 18 + s * 0.6, z, gold ? { metal: 0.7, rough: 0.3 } : undefined); o.scale.y = 1.3; g.add(o, box(0.4, 4, 0.4, gold ? '#ffd60a' : '#333', x, 18 + s * 2.2, z)); } break; }
      case 'pyramid': { g.add(cone(34, 32, '#e0b86a', 0, 16, 0, 4, { flat: true }).rotateY(Math.PI / 4), cone(18, 18, '#d9ad5c', -46, 9, 14, 4, { flat: true }).rotateY(Math.PI / 4), cone(12, 12, '#d9ad5c', 34, 6, 20, 4, { flat: true }).rotateY(Math.PI / 4)); const sfx = grp(box(12, 6, 6, '#d9ad5c', 0, 3, 0), box(5, 7, 5, '#d9ad5c', 5, 7.5, 0)); sfx.position.set(0, 0, 40); g.add(sfx); break; }
      case 'pyramid_trapp': { for (let i = 0; i < 6; i++) g.add(box(40 - i * 6, 4, 40 - i * 6, '#a89a7a', 0, 2 + i * 4, 0)); g.add(box(8, 6, 8, '#8b7a5a', 0, 27, 0)); for (let i = 0; i < 6; i++) g.add(box(6, 4.2, 2, '#c8b68a', 0, 2 + i * 4, 20 - i * 3)); break; }
      case 'hus': { for (let i = 0; i < 6; i++) { const h = buildProp('hus', r, dark); h.scale.setScalar(2.2 + r()); h.position.set(-32 + i * 13, 0, (i % 2) * -12); g.add(h); } break; }
      case 'frihetsgudinnan': { g.add(box(20, 22, 20, '#a6a08a', 0, 11, 0), box(24, 3, 24, '#8b8570', 0, 1.5, 0)); const f = fig('drottning', 7, '#5fa88a'); f.position.y = 22; f.userData.parts.armR.rotation.x = Math.PI; f.add(cyl(0.15, 0.15, 1.2, '#5fa88a', 0.6, 3.9, 0, 6), sph(0.35, '#ffd60a', 0.6, 4.6, 0, { emissive: '#ffb703', emissiveIntensity: 2 })); g.add(f); break; }
      case 'cn_tower': { g.add(cyl(2, 5, 62, '#c9cdd3', 0, 31, 0, 8), cyl(8, 7, 6, '#c9cdd3', 0, 46, 0, 16), cyl(1, 1.6, 30, '#c9cdd3', 0, 77, 0, 8)); break; }
      case 'kristus': { g.add(cone(28, 30, '#5f8a3a', 0, 15, 0, 7, { flat: true }), box(6, 8, 6, '#c8c8c8', 0, 34, 0)); const f = fig('advokat', 6, '#f2f2f2'); f.position.y = 38; f.userData.parts.armL.rotation.z = Math.PI / 2 + 0.1; f.userData.parts.armR.rotation.z = -Math.PI / 2 - 0.1; g.add(f); break; }
      case 'obelisk': { g.add(box(6, 60, 6, '#e6e6e6', 0, 30, 0), cone(4.3, 6, '#e6e6e6', 0, 63, 0, 4).rotateY(Math.PI / 4), box(14, 4, 14, '#cfcfcf', 0, 2, 0)); break; }
      case 'moai': { for (let i = 0; i < 4; i++) { const h = grp(box(6, 16, 6, '#7d7a70', 0, 8, 0), box(6.4, 3, 2, '#7d7a70', 0, 6, 3), box(2, 6, 1.5, '#6a675e', 0, 9, 3.4), box(6, 2, 7, '#8b3a3a', 0, 17, 0)); h.position.set(-24 + i * 16, 0, 0); h.rotation.y = -0.1 + r() * 0.2; g.add(h); } break; }
      case 'machu': { g.add(cone(34, 40, '#5f8a3a', 0, 20, 0, 7, { flat: true })); for (let i = 0; i < 6; i++) g.add(box(30 - i * 4, 1.5, 12, '#7f9f5a', 0, 8 + i * 4, 14 - i * 2)); for (let i = 0; i < 5; i++) g.add(box(4, 3, 4, '#a0987f', -10 + i * 5, 32, 4)); break; }
      case 'tajmahal': { g.add(box(50, 4, 50, '#f4f0e6', 0, 2, 0), box(28, 22, 28, '#f7f3ea', 0, 15, 0)); const d = sph(11, '#f7f3ea', 0, 30, 0); d.scale.y = 1.25; g.add(d, cone(1.5, 5, '#ffd60a', 0, 45, 0, 8, { metal: 0.7, rough: 0.3 })); for (const [x, z] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) g.add(cyl(1.6, 2, 34, '#f7f3ea', x, 21, z, 10), sph(2.4, '#f7f3ea', x, 39, z)); for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) g.add(sph(3.5, '#f7f3ea', x, 27, z)); break; }
      case 'muren': { for (let i = 0; i < 9; i++) { const x = -48 + i * 12, y = Math.sin(i * 0.9) * 6 + 6; g.add(box(12.5, 8, 6, '#8f8778', x, y, Math.cos(i * 0.8) * 8)); if (i % 2 === 0) g.add(box(7, 14, 8, '#7f7768', x, y + 5, Math.cos(i * 0.8) * 8)); } break; }
      case 'torii': { g.add(cyl(1.4, 1.6, 30, '#c1121f', -12, 15, 0, 10), cyl(1.4, 1.6, 30, '#c1121f', 12, 15, 0, 10), box(38, 2.5, 3, '#1b1b1b', 0, 30, 0), box(32, 1.8, 2.4, '#c1121f', 0, 25, 0), box(3, 4, 1.5, '#1b1b1b', 0, 27.5, 0)); g.children[2].rotation.z = 0; const k = buildProp('korsbar', r, dark); k.scale.setScalar(3); k.position.set(-30, 0, 4); const k2 = buildProp('korsbar', r, dark); k2.scale.setScalar(2.6); k2.position.set(30, 0, 6); g.add(k, k2); break; }
      case 'pagod': { for (let i = 0; i < 5; i++) { const w = 22 - i * 3.5; g.add(box(w * 0.7, 6, w * 0.7, '#a4343a', 0, 3 + i * 8, 0)); const rf = cone(w, 3.5, '#3a3a3a', 0, 8 + i * 8, 0, 4); rf.rotation.y = Math.PI / 4; g.add(rf); } g.add(cyl(0.5, 0.5, 8, '#ffd60a', 0, 44, 0, 6, { metal: 0.7, rough: 0.3 })); break; }
      case 'tempel': { g.add(box(36, 6, 30, '#f2e9d8', 0, 3, 0), box(24, 14, 20, '#e3d3b0', 0, 13, 0), cone(9, 30, '#ffd60a', 0, 35, 0, 8, { metal: 0.7, rough: 0.3 })); for (let i = 0; i < 3; i++) g.add(cone(12 + i * 4, 4, '#a4343a', 0, 19 + i * 3, 0, 4).rotateY(Math.PI / 4)); break; }
      case 'palmstrand': { for (let i = 0; i < 7; i++) { const p = buildProp('palm', r, dark); p.scale.setScalar(2.4 + r() * 1.4); p.position.set(-36 + i * 12, 0, (r() - 0.5) * 14); p.rotation.y = r() * 6; g.add(p); } const s = buildProp('dyn', r, dark); s.scale.setScalar(5); s.position.y = -2; g.add(s); break; }
      case 'petronas': { for (const x of [-11, 11]) { for (let i = 0; i < 8; i++) g.add(cyl(6 - i * 0.55, 6.4 - i * 0.55, 9, '#c9d3dd', x, 4.5 + i * 9, 0, 8, { metal: 0.5, rough: 0.3 })); g.add(cone(1.5, 12, '#c9d3dd', x, 78, 0, 8)); } g.add(box(14, 2.5, 4, '#c9d3dd', 0, 42, 0)); break; }
      case 'skyskrapa': { for (let i = 0; i < 7; i++) { const s = buildProp('skyskrapa', r, dark); s.scale.setScalar(2 + r()); s.position.set(-36 + i * 12, 0, (r() - 0.5) * 16); g.add(s); } break; }
      case 'burj': { for (let i = 0; i < 12; i++) g.add(cyl(7 - i * 0.55, 7.4 - i * 0.55, 8, '#d5dde5', 0, 4 + i * 8, 0, 6, { metal: 0.5, rough: 0.3 })); g.add(cyl(0.4, 0.8, 24, '#d5dde5', 0, 110, 0, 6)); break; }
      case 'opera': { g.add(box(60, 5, 34, '#e6e1d6', 0, 2.5, 0)); for (const [x, s, z] of [[-18, 13, 0], [-4, 16, -2], [10, 12, 0], [22, 9, 2]]) { const sh = mesh(geo('SphereGeometry', s, 16, 12, 0, Math.PI, 0, Math.PI / 2), mat('#ffffff', { rough: 0.35 }), x, 5, z); sh.rotation.y = -Math.PI / 2; sh.rotation.x = 0; sh.scale.set(0.6, 1.2, 1); g.add(sh); } const w = mesh(geo('PlaneGeometry', 120, 60), mat('#2e7fbf', { rough: 0.2 }), 0, 0.05, -40); w.rotation.x = -Math.PI / 2; g.add(w); break; }
      case 'jurta': { for (let i = 0; i < 4; i++) { const j = buildProp('jurta', r, dark); j.scale.setScalar(2.8); j.position.set(-30 + i * 20, 0, (i % 2) * 10); g.add(j); } break; }
      case 'igloo': { for (let i = 0; i < 4; i++) { const j = buildProp('igloo', r, dark); j.scale.setScalar(3 + r()); j.position.set(-30 + i * 20, 0, (i % 2) * 10); g.add(j); } break; }
      case 'pingvin': { for (let i = 0; i < 8; i++) { const p = grp(); const bdy = sph(1.6, '#1b1b1b', 0, 2, 0); bdy.scale.y = 1.4; const belly = sph(1.2, '#ffffff', 0, 1.8, 0.7); belly.scale.y = 1.3; p.add(bdy, belly, sph(1, '#1b1b1b', 0, 4.4, 0), cone(0.35, 1, '#ff9f1c', 0, 4.3, 1.1, 6).rotateX(Math.PI / 2), box(1, 0.3, 1.4, '#ff9f1c', -0.6, 0, 0.2), box(1, 0.3, 1.4, '#ff9f1c', 0.6, 0, 0.2)); p.position.set(-28 + i * 8, 0, (i % 2) * 8); p.rotation.y = r() * 6; p.scale.setScalar(1.6); g.add(p); } const ice = box(80, 2, 50, '#eaf4ff', 0, 0.5, 0); g.add(ice); break; }
      case 'baobab': { g.add(cyl(5, 8, 30, '#8b6b4a', 0, 15, 0, 10)); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const br = cyl(0.6, 1.4, 12, '#8b6b4a', Math.cos(a) * 5, 34, Math.sin(a) * 5, 6); br.rotation.z = Math.cos(a) * 0.8; br.rotation.x = -Math.sin(a) * 0.8; g.add(br); g.add(sph(2.8, '#7fa85a', Math.cos(a) * 10, 39, Math.sin(a) * 10)); } break; }
      case 'raket': { const rk = buildProp('raket', r, dark); rk.scale.setScalar(4.5); g.add(rk, box(30, 2, 30, '#555', 0, 1, 0), box(3, 50, 3, '#777', 12, 25, 0)); for (let i = 0; i < 6; i++) g.add(box(9, 0.8, 0.8, '#777', 7.5, 6 + i * 8, 0)); break; }
      default: { const s = buildProp('hus', r, dark); if (s) { s.scale.setScalar(3); g.add(s); } }
    }
    return g;
  }

  World.prototype.tilePos = function (key) { const r = this.tiles.get(key); return r ? r.pos.clone() : null; };
  World.prototype.setFocusMonth = function (m) { this.focusMonth = m; this.setNpcMonth(m); };
  World.prototype.setTilt = function (deg) { this.tilt = deg; };

  root.KB_WORLD = { World, buildFigure, resolvePreset, keyOf, daysIn, ringSpec };
})(window);
