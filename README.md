# Kalenderbrädet

Din kalender som ett 3D-spelbräde. Varje månad är ett Monopol-liknande bräde med
en bricka per dag; en figur hoppar dag för dag och på dagar med händelser står
någon och väntar — skriver du "läkare" står en läkare där, "gym" en löpare,
"flyg" en pilot. Födelsedagar ger konfetti och 100 poäng.

**Live:** https://kalender-bradet.vercel.app · **Kod:** https://github.com/marcdshark666/kalender-bradet

## Vad den gör

- **Tolv bräden, ett per månad**, i ett 4 × 3-rutnät. START-hörnet ger månadsbonus,
  BONUS-brickan finns de månader ringen behöver en extra bricka (jämnt antal).
- **Fyra vyer:** ovanifrån som en karta, perspektiv bakom figuren i gångriktningen,
  hela året, och en lutande vy (25° som standard, reglage 12–70°).
- **67 figurer** att vara — läkare, astronaut, pirat, viking, robot, drottning, DJ …
  — och allt går att ändra: kropp (kvinna/man/icke-binär/barn), 13 hudfärger,
  13 hårfärger, 12 frisyrer, 9 stilar, klädfärg, ansikte, 50 hattar/tillbehör.
- **65 länder och omgivningar** (Sverige, Japan, Egypten, USA, Brasilien, Rymden …)
  med egen mark, himmel, träd/hus och ett landmärke: Eiffeltornet, Big Ben,
  pyramiderna, Torii-porten, Kristusstatyn, Taj Mahal, Operahuset …
- **Poäng och streak:** +5 per dag du öppnar, +10 per ny dag figuren besöker,
  +25 per avbockad händelse, +50 vid START, +30 på BONUS, +100 på födelsedagar, +75 på nyårsafton.
  Nivån stiger med kvadratroten av poängen.
- **Konto med e-post (+ frivillig PIN) och serversynk** så mobilen och datorn visar
  samma bräde. Allt sparas alltid lokalt först. Export/import som JSON, import av
  `.ics` från Google/Outlook, "Mejla planen" för dagens kort.
- **Årsstatistik (📊 Året, tangent Å):** en sida som räknar ihop hela året — flest
  läkarbesök, mest träning, längsta streak (dagar i rad med något inbokat), bästa
  månad, månad-för-månad-staplar och vilken sorts händelse året mest bestod av.
  Bläddra mellan år med ‹ och ›. Nyårsafton ger dubbel konfetti och 75 poäng.
- **Flytta händelser med drag:** ta tag i figuren som står på en dag och dra den
  till en annan bricka — händelsen följer med dit. Måldagen ringas in i gult medan
  du drar, och en **Ångra**-knapp ligger kvar i sju sekunder efteråt. Står flera
  händelser på dagen flyttas den översta (den figuren visar); en återkommande
  händelse flyttas i alla år. Kort tryck på figuren öppnar dagens kort som förut.
- **Dagens rekommendation:** 69 råd i rotation, ett nytt varje dag, i tipsraden
  och under 💡 Tips. Dessutom skriver en daglig rutin en ny förbättringsidé för
  appen till The Work List (Project Management-fliken).
- Ljust/mörkt läge (auto efter klockan), ljud, mobilsvep, tangentbord.

## Filer

| Fil | Roll |
|-----|------|
| `index.html` | gränssnitt, paneler, stil |
| `js/data.js` | figurer, länder/biom, händelsetyper (nyckelord → figur), tips |
| `js/world.js` | Three.js-världen: bräden, figurbyggaren, rekvisita, landmärken, kameror, konfetti |
| `js/app.js` | tillstånd, poäng, dagens kort, figur/miljö-paneler, konto & synk, .ics |
| `js/three.min.js` | Three.js r158, självhostad (CSP tillåter ingen CDN) |
| `api/sync.js` | Vercel-funktion: kontolagring i privat GitHub-repo (`GH_DATA_TOKEN`, `GH_DATA_REPO`) |
| `tools/daglig-rek.js` | den dagliga rekommendationen till The Work List |

## Kör lokalt

```bash
npx serve -l 5300 .
```

→ http://localhost:5300. Utan Vercel-funktionen sparas allt lokalt (servern
rapporterar "ej kopplad"). `vercel dev` ger även `/api/sync` om `.env.local`
innehåller `GH_DATA_TOKEN` och `GH_DATA_REPO`.

I konsolen finns `KB_APP` (`KB_APP.world`, `KB_APP.state`, `KB_APP.goTo('2026-12-24')`).

## Lagring på servern

Samma mönster som Packing Road: `POST /api/sync` med `{action:'get'|'put', email, pin?, state}`.
Filen ligger som `kalender-bradet/users/<sha256(email)>.json` i det privata repot.
E-post och PIN går alltid i POST-body, aldrig i URL:en. PIN hashas; utan PIN
räcker adressen.

## Tangenter

`←`/`→` en dag, `↑`/`↓` en vecka, `1`–`4` vy, `T` i dag, `Enter` dagens kort,
`Å` årsstatistik, `Esc` stäng. Dra för att snurra kameran, scrolla/nyp för zoom. Klicka på en
bricka för att hoppa dit, på en figur för att öppna dess händelse, på en
månadsplatta i helhetsvyn för att zooma in på månaden. **Dra i figuren** i stället
för att klicka på den, så flyttar du händelsen till den bricka du släpper på.

## Test

`node tools/test-drag.js` kör drag-och-släpp mot en stubbad DOM och Three.js — 18
kontroller av att rätt händelse flyttas, att Ångra lägger tillbaka den, att ett
kort tryck fortfarande öppnar dagen och att START/BONUS inte tar emot händelser.
