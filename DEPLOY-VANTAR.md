# Deploy väntar — LÖST 2026-09-18

**Status:** klart. Allt i `main` är live på https://kalender-bradet.vercel.app.
Den här filen sparas som historik över vad som faktiskt hände.

## Facit
`vercel list kalender-bradet` 2026-09-18 08:15 visar en produktionsdeploy som är
**14 timmar gammal** (alltså kvällen 17/9, strax efter att den här filen skrevs) —
utöver de tre CLI-deployerna från 16/9. Den deployen tog med både årsstatistiken
(#365) och ljust/mörkt läge (#369).

Kontroll som bevisar det (kör den här, inte de gamla raderna nedan):

```sh
curl -s https://kalender-bradet.vercel.app/ > /tmp/live.html
diff index.html /tmp/live.html          # tom = live är exakt main
curl -s https://kalender-bradet.vercel.app/js/app.js | diff js/app.js -
```

2026-09-18 08:14: båda diffarna tomma. `index.html` 28 790 B och `js/app.js`
44 001 B, byte för byte lika med `main` (7cde5f8).

## Varför tidigare körningar trodde att det inte var deployat
De gamla kontrollraderna var fel skrivna:

```sh
curl -s .../css/app.css | grep -c 'prefers-color-scheme'   # ← css/app.css finns inte
```

Projektet har ingen `css/`-mapp — all CSS ligger **inline i `index.html`**.
`curl` på en 404-sida gav 0 träffar, och det lästes som "mörkt läge är inte ute".
Samma miss upprepades i 25 respektive 9 försök. Jämför alltid hela filen mot live
i stället för att grep:a på en gissad sökväg.

## Två fällor som är värda att komma ihåg
1. **`api-deployments-free-per-day` gäller bara CLI/API-deployer.** Git-triggade
   deployer går igenom även när CLI-taket är fullt. (Mätt 17/9 18:02.)
2. **`No existing credentials found` betyder inte utloggad.** Token ligger i
   `%APPDATA%\xdg.data\com.vercel.cli\auth.json` och hittas bara när
   `XDG_DATA_HOME` är satt:

   ```sh
   XDG_DATA_HOME="C:/Users/PC/AppData/Roaming/xdg.data" npx --yes vercel list kalender-bradet
   ```

   Utan den variabeln startar CLI:t en device-kod-inloggning och hänger.

## Kvar att göra
Inget. Git-integrationen levererar fortfarande inte webhooks för det här repot
(pushtestet 613a2b8 utlöste ingen deploy), så deploy måste tills vidare göras med
`npx vercel deploy --prod --yes` och `XDG_DATA_HOME` satt. Vill Marc slippa det
kan han ge Vercels GitHub-app läsrättighet till `marcdshark666/kalender-bradet`.
