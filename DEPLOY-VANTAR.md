# Deploy väntar — koden är klar, men inte live

**Senast uppdaterad:** 2026-09-17 09:31 (uppdrag #369, ljust/mörkt läge)

## Läget
Allt i `main` till och med ljust/mörkt läge (#369) är **committat och
pushat men inte utdeployat**. Live-sajten https://kalender-bradet.vercel.app kör
fortfarande en ~1 dygn gammal version.

Kontroller som visar det:

```sh
curl -s https://kalender-bradet.vercel.app/ | grep -c 'openYear'          # ska bli >0
curl -s https://kalender-bradet.vercel.app/js/app.js | grep -c -i 'nyårsafton'  # ska bli >0
curl -s -o /dev/null -w '%{http_code}
' https://kalender-bradet.vercel.app/robots.txt  # ska bli 200
```

## Varför
`vercel deploy --prod` nekas med
`Resource is limited - try again in 24 hours (more than 100, code: "api-deployments-free-per-day")`.

Det är Vercels **kontotak på 100 deploys per dygn för hela gratiskontot** — inte
ett fel i det här projektet. Att bygga om, rensa `.vercel/` eller köra `--force`
hjälper inte. `vercel list kalender-bradet` visar noll egna deploys senaste
dygnet; projektet har alltså inte bränt kvoten själv.

Mätt 2026-09-17 07:25 med `vercel list the-work-list`: 12 deployer 2 h tillbaka,
6 timmen därpå, 2 senaste timmen. The Work List publicerar vid varje `start`,
`note --shot` och `done`/`fail` och tar därför nästan varje lucka det rullande
fönstret släpper.

## Gör INTE
- **Banka inte.** Varje nekat försök verkar hålla fönstret öppet — ett timvis
  retry gör blockeringen permanent (bevisat i radcore och quiz-runner). ETT
  försök per körning, sedan paus.
- **Räkna inte med en push.** Projektet har **ingen Vercel-git-koppling** — alla
  deployer i listan är CLI-deployer, så en push till GitHub utlöser ingenting.
  Det finns ingen väg förbi utan CLI.
- **Alias-vägen är stängd.** `vercel list kalender-bradet` visar bara deployer
  som är 1 dygn gamla, alltså finns inget färskare READY-bygge att peka domänen
  på med `vercel alias set`.
- **Ingen uppgradering av Vercel-planen** — det kostar pengar och kräver Marcs ja.

## Gör så här
Ett försök, i projektmappen:

```sh
XDG_DATA_HOME=C:/Users/PC/AppData/Roaming/xdg.data npx --yes vercel@latest deploy --prod --yes
```

Går den igenom: verifiera med curl-raderna ovan och **radera den här filen**.
Nekas den: lämna filen, försök igen tidigast om sex timmar.

## Vad som kommer ut när den går igenom
En enda lyckad deploy publicerar allt som står och väntar:

- **#365 Årsstatistik** — knappen 📊 Året / tangent `Å`: flest läkarbesök med
  toppmånad, mest träning, längsta streak, längsta besöksrad, bästa månad,
  månadsstaplar, typfördelning, årsbläddring med ‹ ›, samt konfetti + 75 poäng
  på nyårsafton (en gång per år).
- **#366** Flytta händelse med drag (dokumentation och test).
- **#368 robots.txt + sitemap.xml** — `Allow: /` för framsidan, `Disallow: /api/`
  för synk-endpointen, plus `sitemap.xml` med sajtens enda adress. Filerna finns
  i repot men svarar 404 live tills deployen går igenom.

- **#367 hemskärmsikon** — `apple-touch-icon.png`, `manifest.webmanifest` och
  `ikoner/` (192, 512, maskerbar 512), ritade av `tools/gor-ikoner.js`. Utan
  deployen blir en genväg på mobilens hemskärm fortfarande en suddig skärmbild.

- **#369 ljust/mörkt läge** — appen följer nu telefonens `prefers-color-scheme`
  i stället för att alltid vara mörk. Live-versionen är mörk dygnet runt tills
  deployen går igenom.

Försök 2026-09-17 09:26 (hand 1, uppdrag #368): nekad, samma
`api-deployments-free-per-day`.
Försök 2026-09-17 09:27 (hand 3, uppdrag #367): nekad, samma kod. De två
försöken gick omedvetet om varandra — **två händer i samma projekt måste läsa
den här filen precis före sitt försök**, inte när uppdraget börjar.
Nästa försök tidigast 15:27, av EN hand.

Hand 2 (uppdrag #369) läste filen 09:31 och **avstod från att försöka** — tredje
försöket inom fem minuter är precis det bankande som håller fönstret stängt.

Se även minnesfilen `vercel-100-deploys-per-dygn`.
