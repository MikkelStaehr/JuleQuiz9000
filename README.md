# Den kæmpe store elite jule quiz

Live julequiz bygget med Next.js 16 (App Router, TypeScript, Tailwind v4). Den deployes på Vercel og bruger Supabase (Postgres, Realtime og Storage) som backend. Der er ingen separat server.

| Route      | Hvem       | Hvad                                                                                       |
| ---------- | ---------- | ------------------------------------------------------------------------------------------ |
| `/admin`   | Quizmaster | Kontrolpanel med password `ADMIN_PASSWORD`: facit, faser, medie, bedømmelse, point og demo-mode |
| `/display` | Storskærm  | Read-only. Klik én gang for at få fuldskærm og lyd                                         |
| `/play`    | Holdene    | Holdene logger ind med kode og holdnavn og svarer derefter på deres egen skærm             |

## Opsætning

1. Opret et Supabase-projekt og kør `supabase/setup.sql` i SQL Editor. Den samler alle migrationer. Har du allerede et projekt, skal du kun køre de migrationer i `supabase/migrations/`, du mangler.
2. Gå til Authentication → Sign In / Providers og slå **Allow anonymous sign-ins** til.
3. Lav `.env.local` ud fra `.env.example`. Du skal bruge URL, publishable key, secret key og `ADMIN_PASSWORD`.
4. Kør `npm install` og derefter `npm run dev`. Åbn `/admin` og vælg **Start demo**.
5. `npm test` kører unit tests for scoring.
6. På Vercel skal du blot importere repoet og sætte de samme fire env-variabler. `vercel.json` fastlåser Next.js-presettet.

## Flow

`idle → question → countdown → locked → reveal (trinvis) → scoreboard → næste`

- Hold-enheder får kun det aktuelle spørgsmål og ser aldrig facit på forhånd. Facit skrives først ind ved reveal.
- Timeren regnes ud fra `timer_ends_at`, som sættes med databasens tid. Klienterne kompenserer for clock skew via `server_now()`.
- Svar kan ændres, indtil timeren låser, og det sidste svar tæller. Storskærmen viser kun **"svaret ✓"** under countdown. Hvad holdene har svaret, kan klienterne først læse efter reveal (via `revealed_answers()`).
- Point beregnes automatisk ved lås og ved reveal. Quizmasteren kan bruge **Beregn point**, se forslaget og trykke **Godkend**. Quizmasterens rettelser ("rettet") overskrives aldrig automatisk. Til sidst ganges alle point med rundens `pointMultiplier`.
- Scoreboardet viser stillingen og pile, der viser, hvor mange pladser hvert hold er rykket op eller ned i forhold til efter forrige runde.

## Svartyper (`lib/answerTypes/<type>/`)

Hver svartype har sin egen mappe med `PlayInput.tsx` (holdet), `Reveal.tsx` (storskærm), `AdminView.tsx` (quizmaster) og `score.ts` (en ren funktion). Fælles kode ligger i `meta.ts` (defaults, offentlige/afslørede felter og antal reveal-trin), `scoring.ts` (multiplikator) og `registry.tsx`.

| Type         | Input                                                    | Scoring                                                                                       | Reveal                                                           |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `draw`       | Canvas med pen, viskelæder, fortryd, ryd og 3 tykkelser. PNG'en uploades ved lås | Sættes på runden med `scoring`: **closest** (quizmaster indtaster den aflæste værdi eller vælger "ugyldig", så rangeres holdene efter afstand), **manual-parts** (✓/✗ pr. del) eller **manual** (0/1/2) | Én tegning ad gangen med zoom, så alle i grid, så facit (og rangliste ved closest) |
| `geo`        | Leaflet/OSM-kort, hvor holdet trykker for at sætte eller flytte en nål. Street View-billedet kan foldes sammen og vises i fuld skærm med zoom | Haversine-afstand i km. Placeringerne giver 3/2/1 (`pointsByRank`) | Først nåle, så facit-nål, så linjer med km, så rangliste          |
| `true-false` | To store knapper (`labels`) og satsning 1–3, hvis `wagerEnabled` er slået til | Uden satsning giver rigtigt svar `pointsCorrect`. Med satsning giver rigtigt +sats og forkert −sats | Alle kort vendes samtidig, så facit og pointændring, og til sidst evt. `revealMediaUrl` |

Uafgjort ved rangbaseret scoring: holdene deler placeringen og pointene, og den næste placering springes over (1, 1, 3). Hold uden svar rangeres sidst og får 0.

## quiz.json

```jsonc
{
  "rounds": [
    { "number": 1, "title": "Hvad koster den?", "answerType": "draw", "scoring": "closest", "unit": "kr.", "pointsByRank": [3, 2, 1],
      "questions": [{ "key": "r1q1", "text": "…", "mediaType": "image", "mediaUrl": "/media/…", "answer": 499 }] },
    { "number": 2, "title": "Hvor fanden er vi?", "answerType": "geo",
      "questions": [{ "key": "r2q1", "text": "…", "mediaType": "image", "mediaUrl": "/media/streetview.jpg",
                      "answer": { "lat": 55.33, "lng": 8.76, "label": "Ribe, Danmark" }, "mapStart": { "lat": 56, "lng": 10.4, "zoom": 6 } }] },
    { "number": 3, "title": "Er det lovligt?", "answerType": "true-false", "labels": { "true": "LOVLIGT", "false": "ULOVLIGT" }, "wagerEnabled": false,
      "questions": [{ "key": "r3q1", "text": "…", "mediaType": "none", "mediaUrl": null, "answer": false, "revealMediaUrl": null }] },
    { "number": 5, "title": "Musikalsk forvirring", "answerType": "draw", "scoring": "manual-parts", "parts": ["Sang", "Kunstner"],
      "questions": [{ "key": "r5q1", "text": "…", "mediaType": "audio", "mediaUrl": "/media/…", "answer": "Titel · Kunstner" }] },
    { "number": 6, "title": "Hvad har de anmeldt?", "answerType": "draw", "scoring": "manual", "manualPoints": [0, 1, 2],
      "questions": [{ "key": "r6q1", "text": "Anmeldelsen…", "showTextOnPlay": true, "answer": "Et juletræ", "mediaType": "none", "mediaUrl": null }] },
    { "number": 7, "title": "Hvad siger statistikken?", "answerType": "true-false", "labels": { "true": "SANDT", "false": "FALSK" },
      "wagerEnabled": true, "pointMultiplier": 2, "questions": [ … ] }
  ]
}
```

Felter pr. runde:

- `pointMultiplier` er 1 som standard. Er den over 1, viser storskærmen "DOBBELT POINT" ved rundestart.
- `defaultTimerSeconds` er standardtiden for rundens spørgsmål.
- `pointsByRank`, `pointsCorrect` og `manualPoints` styrer pointgivningen.

Felter pr. spørgsmål (alle valgfrie):

- `timerSeconds` overskriver rundens timer.
- `showTextOnPlay` viser spørgsmålsteksten på holdenes skærme.
- `revealMediaUrl` er et billede, der vises efter facit, eller lyd/video, som quizmasteren afspiller på storskærmen.

Lyd og video afspilles kun på storskærmen. Quizmasteren styrer dem med knapperne afspil, pause, genstart, stop og "afspil fra sek.".

Medierne ligger i `public/media/`. Eksemplerne er pladsholdere, som du skal erstatte med dine egne Street View-screenshots og produktbilleder.

## Demo-mode

**Start demo** opretter fire simulerede hold med forskelligt niveau:

- **Tegning:** holdene afleverer håndskrevne PNG'er ved lås.
- **Kort:** de sætter nåle tæt på eller langt fra facit.
- **Sandt/falsk:** de svarer og satser.
- Ét hold skifter mening undervejs.

Du kan også vælge op til fire rigtige pladser. Med `/play?p=2` kan du køre flere hold i samme browser.

## Sikkerhed (RLS)

- Klienter kan kun læse. Holdenes svar (`value`, `wager`) og quizmasterens bedømmelser (`judgment`) kan ikke læses før reveal, og join-koder kan aldrig læses.
- Hold skriver kun via `submit_answer()` og til egen sti i Storage. Det kræver, at holdet er bundet til `auth.uid()`, at spørgsmålet er åbent, og at timeren højst er udløbet for 15 sekunder siden (grace-periode).
- Alt quizmaster-arbejde kører gennem server actions med service-role-nøglen og et HMAC-cookie, der afledes af `ADMIN_PASSWORD`.
- Kendte begrænsninger: Storage-bucket'en er public, når tegningerne er uploadet. Koderne er kun på fire cifre og har ingen rate limiting.
