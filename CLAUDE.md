# Kalenderbrädet — regler för AI-agenter (Claude, Codex, Antigravity)

Läs `../.agents/PROTOKOLL.md` först. Tillståndsnivå: standard (fri) — deploy och
push är OK, men **inget som kostar pengar** utan Marcs ja.

## Vad projektet är
3D-kalender som ett Monopol-bräde (Three.js r158, självhostad i `js/three.min.js`).
En bricka per dag, en figur som hoppar, figurer på dagar med händelser, 67 figurer,
65 länder, poäng/konfetti, konto via e-post + serversynk. Se `README.md`.

## Arkitektur — rör rätt fil
- `js/data.js` — bara data. Ny figur = ny rad i `FIGURER` (hatt-id måste finnas i
  `addHat` i world.js). Nytt land = rad i `LANDER` (landmärke måste finnas i
  `buildLandmark`, biom i `BIOM`). Nya nyckelord = `HANDELSETYPER[].ord`.
- `js/world.js` — allt 3D. Inga DOM-anrop utom canvas-texturer.
- `js/app.js` — tillstånd (`S`), poäng, paneler, synk. `KB_APP` på window för felsökning.
- `api/sync.js` — samma mönster som `packing-road/api/sync.js`. Uppgifter i
  POST-body, aldrig URL. Env `GH_DATA_TOKEN`/`GH_DATA_REPO` (samma privata repo
  som The Work List och Packing Road). Sökväg i repot: `kalender-bradet/users/`.

## Kör & verifiera
- Lokalt: `npx serve -l 5300 .` (launch.json-namn `kalender-bradet`). Utan Vercel
  svarar `/api/sync` 404 → appen säger "ej kopplad" och sparar lokalt. Det är rätt.
- I browserpanelen renderas inte rAF när panelen är dold: kör
  `for(let i=0;i<300;i++) KB_APP.world._update(0.05)` före skärmbild.
- Deploy: `npx --yes vercel@latest deploy --prod --yes` med `XDG_DATA_HOME` satt
  (se minnet "Vercel: no credentials = XDG_DATA_HOME").

## Regler
- CSP tillåter ingen CDN: inga externa script/fonter. Emoji ritas via canvas.
- Poängreglerna står i README och hjälppanelen — ändra båda om de ändras.
- Rutinen `KalenderBradet-Rek` (07:50) kör `tools/daglig-rek.js` som skriver EN ny
  idé per dag till Work List. Lägg nya idéer i `IDEER`, ta aldrig bort gamla
  (dubblettkollen matchar på titel).
- Ingen patientdata, inga hemligheter i repot. `.env.local` är git-ignorerad.
