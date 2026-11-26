# UBS Christmas Quiz 2026

Live julequiz, hvor holdene **tegner** deres svar. Next.js 16 (App Router, TypeScript, Tailwind v4) på Vercel, med Supabase (Postgres, Realtime og Storage) som backend. Der er ingen separat server.

| Route      | Hvem                 | Hvad                                                                 |
| ---------- | -------------------- | -------------------------------------------------------------------- |
| `/admin`   | Quizmaster           | Kontrolpanel (password: `ADMIN_PASSWORD`). Viser facit, styrer faser, lyd og point, og har demo-mode |
| `/display` | Storskærm            | Read-only. Klik én gang for fuldskærm og lyd                         |
| `/play`    | Holdene (mobil/tablet) | Kode + holdnavn, derefter tegne-canvas                             |

## Opsætning

1. **Supabase-projekt.** Opret et projekt og kør migrationerne i `supabase/migrations/` i rækkefølge (SQL Editor eller `supabase db push`).
2. **Anonyme logins.** Slå dem til under Authentication → Sign In / Providers → **Anonymous sign-ins**. Holdene logger ind anonymt, så RLS kan sikre, at et hold kun skriver sine egne svar.
3. **Env.** Kopiér `.env.example` til `.env.local` og udfyld URL, publishable/anon key, secret/service-role key og `ADMIN_PASSWORD`.
4. `npm install` og `npm run dev`. Åbn `/admin` og vælg **Start demo**.
5. **Vercel.** Importér repoet og sæt de samme fire env-variabler. Der kræves ingen anden konfiguration.

## Flow

`idle → question → countdown → locked → reveal → (scoreboard) → næste`

- **Vis spørgsmål** skriver spørgsmålets tekst og medie ind i `game_state`. Hold-enheder får derfor aldrig hele quizzen eller facit i forvejen.
- **Start timer** sætter `timer_ends_at = now() + timerSeconds` i databasen. Alle klienter regner nedtællingen ud lokalt og korrigerer for clock skew via RPC'en `server_now()`.
- Ved 0, ved **Lås nu** eller når holdet trykker **Send**, låses canvas. Tegningen bliver til en PNG, som uploades til `answers/{gameId}/{questionKey}/{teamId}.png`, og der indsættes en række i `answers`. Der er 20 sekunders upload-grace efter låsning.
- **Vis svar** viser alle tegninger og facit på storskærmen. Quizmasteren giver point (0 / +1 / +2 / +3 × rundens multiplikator), og scoreboardet opdateres live.

## quiz.json

```jsonc
{
  "rounds": [
    { "round": 7, "title": "Hvad siger statistikken?", "scoring": "closest", "pointMultiplier": 2, "closestPoints": [3, 2, 1] }
  ],
  "questions": [
    { "round": 1, "roundTitle": "…", "index": 1, "text": "…", "mediaType": "none|image|audio|video",
      "mediaUrl": null, "answer": "…", "timerSeconds": 30, "answerType": "draw" },
    // Skala-spørgsmål: canvasBackground bliver automatisk "scale", når scaleMin/scaleMax er sat
    { "round": 7, "index": 1, "text": "…", "answer": "Ca. 71 %", "answerValue": 71,
      "scaleMin": 0, "scaleMax": 100, "unit": "%", "mediaType": "none", "mediaUrl": null, "timerSeconds": 40 }
  ]
}
```

- `rounds` er valgfri. Standardværdierne er `scoring: "manual"` og `pointMultiplier: 1`. Et spørgsmål kan overskrive begge.
- **Skala-spørgsmål.** Canvas får en akse i baggrunden, og holdet sætter ét kryds. Positionen aflæses på hold-enheden (tyngdepunktet af blækket omkring aksen) og gemmes i `answers.scale_value`. Ved reveal vises alle krydsene i holdfarver på samme akse, og facit-markøren animeres ind til sidst.
- **`scoring: "closest"`.** Ved **Vis svar** får de tætteste hold automatisk `closestPoints × pointMultiplier`, og ved uafgjort deler holdene placeringen. Quizmasteren kan rette pointene eller trykke **Beregn igen**.
- **`pointMultiplier > 1`.** Storskærmen viser "DOBBELT POINT" ved rundestart.
- Medier ligger i `public/media/`. Lydklippene er public domain-melodier, genereret med `node scripts/gen-audio.mjs`.

## Demo-mode

**Start demo** i `/admin` opretter et spil med fire simulerede hold. De afleverer dummy-tegninger (eller kryds på skalaen) på tilfældige tidspunkter under nedtællingen. Man kan også vælge op til fire rigtige pladser, så `/play` kan testes i en anden fane. Med `/play?p=2` kan man køre flere hold i samme browser.

## Sikkerhed (RLS)

- Klienter kan kun **læse** følgende: `games`, `game_state`, `answers`, `scores` og `teams`. For `teams` gælder det dog ikke `join_code` og `auth_uid`, som er spærret med kolonne-rettigheder.
- Hold må kun indsætte deres egen række i `answers` og uploade til deres egen sti. Det kræver, at holdet er bundet til `auth.uid()` via `join_team()`, at spørgsmålet er det aktuelle, og at fasen er countdown/locked inden for grace-perioden.
- Alt andet går gennem server actions med service-role-nøglen og et HMAC-cookie afledt af `ADMIN_PASSWORD`.
- Bevidste forenklinger: Storage-bucket'en er public, så stien til en tegning kan gættes, når den er uploadet. Et hold, der trykker Send tidligt, kan i teorien blive "kigget over skulderen". Koderne er kun på fire cifre og har ingen rate limiting.
