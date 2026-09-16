#!/usr/bin/env node
// Den dagliga rekommendationen för Kalenderbrädet → The Work List.
//
// Marc 2026-09-16: "sedan varje dag en ny rekommendation om vad mer man kan göra
// bättre med denna app". Skriptet väljer EN idé ur listan nedan som ännu inte
// står på sajten och skriver upp den med
//   node the-work-list/worklist.js rek --projekt kalender-bradet --titel … --text … --grad N
// Inga modeller, inga pengar: samma lista, en ny rad per dag, aldrig dubbletter.
//
//   node tools/daglig-rek.js            skriv dagens
//   node tools/daglig-rek.js --torr     visa vilken som skulle skrivas
//   node tools/daglig-rek.js --alla     lista alla idéer och vilka som redan står på sajten

const path = require('path');
const { spawnSync } = require('child_process');

const WORKLIST = path.join(__dirname, '..', '..', 'the-work-list', 'worklist.js');
const PROJEKT = 'kalender-bradet';

// grad: 5 = gör först, 4 = den här veckan, 3 = när det passar, 2 = putsning
const IDEER = [
  ['Påminnelser via Telegram', 'Skicka morgonens händelser till Telegram-boten kl 07:30 (samma kanal som Work List). Kräver bara en schemalagd körning som läser kontots state ur datarepot.', 4],
  ['Google Kalender-synk', 'Läs Google Kalender via OAuth (read-only) i stället för .ics-import så nya möten dyker upp på brädet av sig själva.', 4],
  ['Veckovy som väg', 'En femte vy: bara den aktuella veckan som en rak väg med sju brickor, figuren i mitten. Bra på mobil.', 3],
  ['Fler figurer på samma bricka', 'Visa upp till tre små figurer på en dag med flera händelser i stället för en figur + stapel.', 3],
  ['Egna nyckelord', 'Låt användaren lägga till egna ord → typ (t.ex. "Sahlgrenska" → läkare) i inställningarna.', 3],
  ['Delat bräde', 'Två e-postadresser på samma kalender med två figurer i olika färg, så familjen ser varandras dagar.', 4],
  ['Årsstatistik', 'En sida som räknar: flest läkarbesök, mest träning, längsta streak, bästa månad. Konfetti på nyårsafton.', 3],
  ['Väder på brädet', 'Hämta SMHI-prognos (gratis, ingen nyckel) och lägg moln/regn/sol som rekvisita på de sju kommande dagarna.', 3],
  ['Ljudspår per land', 'En kort loop per biom (skog: fåglar, hav: vågor, stad: trafik) med volymreglage. Syntetiskt, inga filer.', 2],
  ['Figuren går själv', 'Ett läge där figuren automatiskt går till dagens datum vid start och stannar vid varje händelse på vägen.', 3],
  ['Snabbinmatning', 'Tryck N var som helst → en rad överst: "fre 14:30 läkare" tolkas till datum, tid och typ.', 4],
  ['PWA och offline', 'manifest.json + service worker så appen kan läggas på hemskärmen och fungerar utan nät (allt finns redan lokalt).', 4],
  ['Skärmbild att dela', 'Knapp som renderar brädet till PNG med månadens händelser och poäng — för att skicka till familjen.', 2],
  ['Kartläge per land', 'I helhetsvyn: placera landets landmärke bredvid den månad resan är inlagd, så året blir en resekarta.', 3],
  ['Tillgänglighet', 'Skärmläsarläge: en vanlig lista av dagar och händelser under brädet, dolt visuellt men läsbart. Tangentbordsfokus i panelerna.', 3],
  ['Undo', 'Ångra senaste borttagning och avbockning (Ctrl+Z) i 30 sekunder via en toast med Ångra-knapp.', 3],
  ['Prestandaläge på mobil', 'Sänk skuggupplösningen och antalet rekvisita automatiskt när devicePixelRatio > 2 eller bildfrekvensen sjunker under 30.', 3],
  ['Födelsedagar från kontakter', 'Importera födelsedagar från en vCard-fil (.vcf) — de blir årliga händelser med namn.', 3],
  ['Mål per vecka', 'Sätt ett poängmål (t.ex. 500) och visa en ring runt HUD:en som fylls. Konfetti när målet nås.', 2],
  ['Klockslag på brädet', 'När figuren står på dagens bricka: en liten solvisare som visar hur långt dagen har kommit.', 2],
  ['Teman för brädet', 'Trä, marmor, neon, papper — brädets material och färgpalett som val bredvid land.', 2],
  ['Sök i kalendern', 'Sökfält som filtrerar året: "läkare" tänder alla brickor med läkarbesök och listar dem i en panel.', 4],
  ['Flytta händelse med drag', 'Dra en figur från en bricka till en annan för att flytta händelsen (pekare + raycast finns redan).', 3],
  ['Egen figur som foto', 'Ladda upp ett ansiktsfoto som blir figurens ansiktstextur (bara lokalt, ingen uppladdning).', 2],
  ['Serverns datum', 'Låt /api/sync svara med updatedAt och visa "senast synkad från mobilen kl …" i kontopanelen.', 2],
  ['Landets högtider', 'Lägg in nationella helgdagar automatiskt för valt land (statisk lista per land) som helg-brickor.', 3],
  ['Månadssammanfattning', 'Sista dagen i månaden: ett kort som summerar månaden och ger månadsbetyg med figurens kommentar.', 2],
  ['Streak-skydd', 'En "frysdag" per månad som skyddar streaken om man missar en dag — visas som en isbit i HUD:en.', 2],
  ['Byt år smidigare', 'Årsväljare i månadsraden (‹ 2026 ›) så man kan lägga in nästa års födelsedagar utan att gå via december.', 3],
  ['Handtag för Work List', 'Låt Work List-handen läsa kontots state ur datarepot och rapportera veckans händelser till Telegram på söndagar.', 3],
];

function run(args) {
  const r = spawnSync(process.execPath, [WORKLIST, ...args], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}
function main() {
  const a = process.argv.slice(2);
  const lista = run(['rek', '--lista']);
  if (!lista.ok) { console.error('Kunde inte läsa Work List:', lista.out.trim()); process.exit(1); }
  const finns = new Set();
  for (const rad of lista.out.split('\n')) if (rad.includes(PROJEKT)) for (const [titel] of IDEER) if (rad.includes(titel.slice(0, 40))) finns.add(titel);
  if (a.includes('--alla')) { for (const [titel, , grad] of IDEER) console.log(`${finns.has(titel) ? '✓' : ' '} ${grad}/5 ${titel}`); return; }
  const kvar = IDEER.filter(([t]) => !finns.has(t));
  if (!kvar.length) { console.log('Alla idéer står redan på sajten — inget nytt i dag.'); return; }
  // dagnumret väljer, så samma dag ger samma förslag även om skriptet körs två gånger
  const dag = Math.floor(Date.now() / 86400000);
  const [titel, text, grad] = kvar[dag % kvar.length];
  if (a.includes('--torr')) { console.log(`${grad}/5  ${titel}\n${text}`); return; }
  const w = run(['rek', '--projekt', PROJEKT, '--titel', titel, '--text', text, '--grad', String(grad), '--kalla', 'daglig-rek']);
  console.log(w.out.trim());
  process.exit(w.ok ? 0 : 1);
}
main();
