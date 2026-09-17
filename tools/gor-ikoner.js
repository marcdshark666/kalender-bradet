#!/usr/bin/env node
'use strict';
/**
 * Ritar appikonerna till ikoner/ som riktiga PNG-filer.
 *
 * Varför egen ritare: CSP:n tillåter ingen CDN och projektet har inga
 * beroenden — så ikonerna ritas här med zlib (inbyggt i Node) i stället för
 * sharp/canvas. Motivet är samma som faviconen i index.html: ett gult bräde
 * med fyra spelrutor.
 *
 * Kör: node tools/gor-ikoner.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const UT = path.join(__dirname, '..', 'ikoner');

// Samma palett som index.html (--accent, --text-mörk, --accent-2, --ok, --primary)
const GUL = [0xff, 0xd1, 0x66];
const RUTOR = [
  [0x1d, 0x1d, 0x2e],
  [0xff, 0x5d, 0x8f],
  [0x06, 0xd6, 0xa0],
  [0x43, 0x61, 0xee],
];

// ---------- PNG ----------

const CRC_TABELL = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABELL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(typ, data) {
  const langd = Buffer.alloc(4);
  langd.writeUInt32BE(data.length, 0);
  const kropp = Buffer.concat([Buffer.from(typ, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(kropp), 0);
  return Buffer.concat([langd, kropp, crc]);
}

/** rgba: Buffer med bredd*hojd*4 byte, icke-premultiplicerad. */
function pngBuffer(rgba, bredd, hojd) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bredd, 0);
  ihdr.writeUInt32BE(hojd, 4);
  ihdr[8] = 8; // bitdjup
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptiv filtrering
  ihdr[12] = 0; // ingen interlace

  const rader = Buffer.alloc(hojd * (bredd * 4 + 1));
  for (let y = 0; y < hojd; y++) {
    const av = y * (bredd * 4 + 1);
    rader[av] = 0; // filter: None
    rgba.copy(rader, av + 1, y * bredd * 4, (y + 1) * bredd * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rader, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- ritning ----------

/**
 * Ritar ikonen i ett 64x64-koordinatsystem (samma som faviconens viewBox) och
 * skalar ned från 4x supersampling, vilket ger kantutjämning utan canvas.
 *
 * @param {number} storlek  utbredd/höjd i pixlar
 * @param {object} val
 * @param {boolean} val.fyll  true = gul fyller hela ytan (iOS/maskable rundar själv)
 * @param {number} val.innehall  skala på rutmönstret, 1 = som faviconen
 */
function ritaIkon(storlek, val) {
  const fyll = !!val.fyll;
  const innehall = val.innehall || 1;
  const SS = 4;
  const n = storlek * SS;
  const enhet = n / 64; // en viewBox-enhet i superpixlar

  const iRundadRuta = (px, py, x, y, b, h, r) => {
    if (px < x || py < y || px > x + b || py > y + h) return false;
    const cx = Math.min(Math.max(px, x + r), x + b - r);
    const cy = Math.min(Math.max(py, y + r), y + h - r);
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  };

  // Rutmönstret, skalat kring mitten (32,32) så maskable-ikonen håller sig
  // innanför Androids säkra zon.
  const rutor = [
    [14, 14],
    [34, 14],
    [14, 34],
    [34, 34],
  ].map(([x, y], i) => ({
    x: 32 + (x - 32) * innehall,
    y: 32 + (y - 32) * innehall,
    s: 16 * innehall,
    farg: RUTOR[i],
  }));

  const hog = Buffer.alloc(n * n * 4);
  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      const x = (sx + 0.5) / enhet;
      const y = (sy + 0.5) / enhet;
      let farg = null;

      if (fyll) {
        farg = GUL;
      } else if (iRundadRuta(x, y, 4, 4, 56, 56, 10)) {
        farg = GUL;
      }

      if (farg) {
        for (const r of rutor) {
          if (x >= r.x && x <= r.x + r.s && y >= r.y && y <= r.y + r.s) {
            farg = r.farg;
            break;
          }
        }
      }

      const av = (sy * n + sx) * 4;
      if (farg) {
        hog[av] = farg[0];
        hog[av + 1] = farg[1];
        hog[av + 2] = farg[2];
        hog[av + 3] = 255;
      }
    }
  }

  // Nedsampling med premultiplicerad alfa, annars blöder svart in i kanterna.
  const ut = Buffer.alloc(storlek * storlek * 4);
  const antal = SS * SS;
  for (let y = 0; y < storlek; y++) {
    for (let x = 0; x < storlek; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const av = ((y * SS + dy) * n + (x * SS + dx)) * 4;
          const al = hog[av + 3] / 255;
          r += hog[av] * al;
          g += hog[av + 1] * al;
          b += hog[av + 2] * al;
          a += al;
        }
      }
      const av = (y * storlek + x) * 4;
      if (a > 0) {
        ut[av] = Math.round(r / a);
        ut[av + 1] = Math.round(g / a);
        ut[av + 2] = Math.round(b / a);
        ut[av + 3] = Math.round((a / antal) * 255);
      }
    }
  }

  return pngBuffer(ut, storlek, storlek);
}

function main() {
  fs.mkdirSync(UT, { recursive: true });

  const filer = [
    // iOS visar ingen transparens — fylld gul yta, systemet rundar hörnen själv.
    ['apple-touch-icon.png', 180, { fyll: true, innehall: 1 }],
    ['ikon-192.png', 192, { fyll: false, innehall: 1 }],
    ['ikon-512.png', 512, { fyll: false, innehall: 1 }],
    // maskable: innehållet krympt till Androids säkra zon (innersta 80 %).
    ['ikon-maskerbar-512.png', 512, { fyll: true, innehall: 0.8 }],
  ];

  for (const [namn, storlek, val] of filer) {
    const buf = ritaIkon(storlek, val);
    fs.writeFileSync(path.join(UT, namn), buf);
    console.log(`${namn.padEnd(24)} ${storlek}x${storlek}  ${buf.length} byte`);
  }
}

main();
