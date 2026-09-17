# Deploy väntar

**Status 2026-09-17 07:25** — Årsstatistik-panelen (uppdrag #365) är byggd,
verifierad och pushad till `main` (commit `9d1ea8a`), men **den är inte live**.

`XDG_DATA_HOME=C:/Users/PC/AppData/Roaming/xdg.data npx --yes vercel deploy --prod --yes`
nekas med:

```
Resource is limited - try again in 24 hours
(more than 100, code: "api-deployments-free-per-day")
```

Det är Vercels **kontotak** (100 deploys/dygn för hela kontot), inte ett fel i
projektet. `vercel list kalender-bradet` visar noll egna deploys senaste dygnet
— kalender-bradet har alltså inte bränt kvoten själv. `vercel list the-work-list`
visade samma minut **7 produktionsdeploys senaste timmen**; The Work List
publicerar vid varje `start`, `note --shot` och `done`/`fail` och hinner ta nästan
varje lucka i det rullande fönstret.

## Regler för nästa hand

- **Banka inte.** Varje nekat försök verkar hålla fönstret öppet. Ett försök per
  körning, sedan paus.
- Projektet har **ingen Vercel-git-koppling** (alla deploys i listan är
  CLI-deploys), så en push till GitHub utlöser ingen deploy. Det finns alltså
  ingen väg förbi utan CLI.
- Ingen uppgradering av Vercel-planen — det kostar pengar och kräver Marcs ja.

## När det gått igenom

Verifiera att funktionen faktiskt kom ut och radera den här filen:

```
curl -s https://kalender-bradet.vercel.app/ | grep -c 'openYear'   # ska bli 1
```
