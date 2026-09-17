# Deploy väntar — koden är klar, men inte live

**Senast uppdaterad:** 2026-09-17 18:05 (körning 2026-09-17-1800)

## Läget
Allt i `main` till och med årsstatistik (#365) och ljust/mörkt läge (#369) är
**committat och pushat men inte utdeployat**. Live-sajten
https://kalender-bradet.vercel.app kör fortfarande en ~2 dygn gammal version.

Kontroller som visar det:

```sh
curl -s https://kalender-bradet.vercel.app/ | grep -c 'openYear'                 # ska bli >0
curl -s https://kalender-bradet.vercel.app/js/app.js | grep -ci 'nyårsafton'     # ska bli >0
curl -s https://kalender-bradet.vercel.app/css/app.css | grep -c 'prefers-color-scheme'  # ska bli >0
```

## Varför — och vad som faktiskt är nytt 17/9 18:00
`vercel deploy --prod` nekas med
`Resource is limited - try again in 24 hours (more than 100, code: "api-deployments-free-per-day")`.

Tidigare händer antog att hela kontot var låst och satte klockslag (22:02) att
vänta till. **Det stämmer inte.** Mätt 17/9 18:02:

- `vercel list the-work-list` visar lyckade produktionsdeployer 21, 31, 51 min
  och 1–4 h tillbaka — kontot deployar alltså hela tiden.
- `vercel inspect` på den senaste (dpl_2F9ga7HbS7phJ2LoPtmd1Yt1p65H) ger
  `created 17:40:26`, exakt samma tidpunkt som `the-work-list/state.json`
  `lastPublish`. The Work List publicerar till GitHub Pages-repot, och Vercels
  **git-integration** deployar på pushen.

Slutsatsen: `api-deployments-free-per-day` gäller **CLI-/API-initierade**
deployer. **Git-triggade deployer går igenom även när CLI-taket är fullt.**

## Vad som saknas för det här projektet
`vercel git connect` svarar `marcdshark666/kalender-bradet is already connected`,
men `vercel list kalender-bradet` visar bara **tre deployer, alla 2 dygn gamla
och alla CLI-gjorda**. Ingen push till `main` har någonsin utlöst en deploy —
inte heller pushen 16:02 idag.

Det pekar på att Vercels GitHub-app inte har läsrättighet till just det här
repot (appen kan vara installerad med "Only select repositories";
`marcdshark666.github.io` finns med, `kalender-bradet` inte).

## Så tar du det vidare
1. **Marc (30 sekunder, i webbläsaren):** GitHub → Settings → Applications →
   Vercel → Configure → Repository access → lägg till `kalender-bradet` och
   `inbox-zero-hero`. Därefter deployar varje push av sig själv, oberoende av
   CLI-taket — samma väg som The Work List redan använder.
2. **Eller:** vänta tills CLI-taket rullar vidare och kör ETT försök:
   `XDG_DATA_HOME="C:/Users/PC/AppData/Roaming/xdg.data" npx --yes vercel deploy --prod --yes`

Ta bort den här filen när ändringen är live.
