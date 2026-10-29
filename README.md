# WeekDeck

Weekly team slides for sales managers, done in about 3 minutes.

A manager uploads last week's PowerPoint once. WeekDeck reads the team name, the
manager, the members, the figures and the activities, and remembers them. Each
week after that they only type the new figures (totals add themselves), pick a
look, and download a PowerPoint or PDF.

```
Browser (React)  ──/api──►  Node + Express  ──►  MongoDB
  reads .pptx in the browser       team login (name + PIN)
  makes PPTX / PDF in the browser  saves teams and weeks
```

## What's in Phase 1

- **Log in with the team name + a 4–6 digit PIN.** No email, no Google.
- **Import a PowerPoint (.pptx).** Cover title, manager name and title, team
  heading, region, members (team lead marked), the weekly figures and the daily
  activities are read and shown for checking before saving.
- **This week page.** Mon–Fri amounts per person (type `500k`, `1.2m` or
  `500,000`), new clients as a count (+ / –), live totals, top performer.
  Activities are copied from last week so only changes need typing. Everything
  saves itself.
- **Smart activities.** Each day's box remembers the team's past weeks:
  - tap a day to see what the team **usually** does that day ("Market storm at …", *Usual Mon*);
  - type a few letters and matching past activities appear;
  - type **"at"** and the places the team has worked pop up, best matches for that
    activity first (market storms → markets, outreach → churches);
  - **Fill usual** completes every empty day from the team's normal week;
  - new teams get starter ideas (market storm, site inspection, church outreach…).
  Tap a chip or press Tab. No AI key needed for any of this.
- **AI ideas (optional).** With `ANTHROPIC_API_KEY` set on the server, an
  *AI ideas* button suggests fresh activities per day plus a tip, based on the
  team's last 8 weeks and region. Tap an idea to add it.
- **Real places while typing.** Type “Market storm at Ike…” and real places
  (OpenStreetMap, free, no key) appear, nearest to the team’s region first.
  Picking one pins it exactly on the map.
- **This week on the map.** Every place in the activities, coloured by day,
  with the route, an estimated distance and drive time, a “Find shortest
  order” button, and **Open in Google Maps** for each day (opens the phone’s
  Maps app with live traffic, free).
- **Events near us** (needs the free `TAVILY_API_KEY`, plus `GROQ_API_KEY` to
  sort the results; or a Gemini key). It searches the web for real events in
  the team’s area that week (trade fairs, church programmes, market days,
  expos…). Each event shows its source link; tap a day to add it. If the AI is
  busy, the raw search results are shown, and **Search on Google yourself** is
  always there.
- **Week summary.** A note on the “Week at a glance” slide. **Write with AI**
  drafts it from the figures (Gemini or Claude); the manager can edit it.
- **Present mode.** Full-screen slideshow from the Slides page: numbers count
  up, bars grow, arrow keys / tap / swipe to move, F for full screen.
- **Map slide.** “Where we’re going”: the week’s stops on a real map, in the
  PowerPoint and PDF too.
- **Region head view** at `/region`. The region head creates a region (name +
  PIN) and shares its 6-character code; managers enter it on **Team → Join your
  region**. The dashboard shows each team’s week, change from last week, the
  month, who hasn’t entered figures, a team leaderboard, top marketers, and a
  **Present** button for any team’s slides (read-only).
- **Slides page.** 96 looks: 8 styles × 12 colour palettes, with a live
  mini-preview of each style and a "Surprise me" button. Optional
  "Week at a glance" slide, and a preview of every slide.
  - Styles: Classic, Header Bar, Bold Block, Minimal, Magazine (serif),
    Night Glow, Bubbles, Dashboard.
  - Palettes: Classic Blue, Midnight Gold, Emerald, Coral, Royal Purple,
    Ocean Teal, Sunset Orange, Wine & Gold, Charcoal Lime, Rose & Navy,
    Black & Yellow, Fresh Sky.
  - **PowerPoint:** a real, editable .pptx.
  - **PDF:** opens a print page; choose "Save as PDF".
  - **Share:** on phones, sends the .pptx straight to WhatsApp and so on.
- **Team page.** Edit cover details, members and cover photo, import again,
  change PIN, log out.

The deck: Cover → Week at a glance (optional) → Team → Weekly breakdown
(NAME, MON–FRI, NC, TOTAL) → Monthly breakdown (WK 1…WK 5, NC, TOTAL) →
Activities → Thank you. **NC = number of new clients**: shown and summed as a
count, never added to the money total. The month of a week is the month its
Monday falls in.

## Accounts (/accounts)

A separate section for accountants, at `/accounts`, with its own login (email +
password). Every accountant signs up with their own region and keeps that
region's workbook; nobody else can see or change it.

- **Workbook.** The month's payments in the exact columns of their Google
  Sheets (S/N … COMMENT, A–Z, plus the week 2–4 columns of the New client
  sheet). The three sheets (Workflow, New clients, Infrastructure & other fees)
  are switched at the top; the tabs (OGBAFAGBA, OGBAFAGBA VIDCO, ABULE EGBA …)
  sit at the bottom like Google Sheets. Type, paste blocks from Excel or Sheets,
  arrows/Tab/Enter, Ctrl/⌘+C, Ctrl/⌘+D fills down, Delete clears. Picking a
  marketer fills in their supervisor, designation, account and spouse. Rows
  that look like the same payment twice, or have a date far from the month,
  are marked ⚠. Everything saves by itself.
- **Import.** Their own .xlsx files (or Google Sheets downloaded as .xlsx /
  .csv). Columns are found by header name; formula-only rows are skipped;
  "NILL", "NEW & FORM" and notes typed into POSTING STATUS are tidied; a check
  screen shows rows, totals and fixes per tab before anything is saved.
  Importing the same file again adds only new rows (a payment = date + alert
  name + amount + client + CABAL ID). New marketers go onto the roster.
- **Marketers.** The roster (details typed once), branch, team and team head.
  Teams are linked from WeekDeck (set up by the team heads); close spellings
  ("ARTHUR NYONG STIM" / "ETIM") are matched and remembered; "Same person?"
  merges two spellings and moves their payments.
- **Export.** The month's deck laid out like their September slides, per
  branch: Cover → Senior staff (team heads) → one slide per team → Others →
  Branch summary → January–December. Columns: MARKETERS NAME, DESIGNATION,
  INFLOW (Workflow + New client), INFRAS, TOTAL, NC (new clients). Extra
  slides: top marketers, pending confirmations, new clients list, commission,
  inflow by bank, branches vs last month. Tick, reorder and rename slides (all
  remembered), pick one of the 96 looks, then PowerPoint, PDF or Present.
  Confirmed payments only by default. Sheets download as .xlsx in their layout
  (one file per sheet type, chosen tabs) or as CSV rows for Google Sheets'
  "Append rows to current sheet". "Earlier months" holds totals typed from old
  slides for the January–December table.
- **Import slides.** Upload slides the accountant already has: PowerPoint
  (.pptx/.ppsx/.potx), PDF (also Google Slides downloads), LibreOffice (.odp),
  Word (.docx, each table a slide), Excel/CSV (each sheet a slide), or photos and
  screenshots (picture slides; scanned PDFs too). Several files at once. Old
  .ppt/.doc/.xls and Keynote get a message on how to save them as .pptx/PDF. Before
  anything is saved WeekDeck checks every slide: each row adds up (INFLOW +
  INFRAS = TOTAL), each TOTAL row equals the rows above it, numbers written
  wrongly ("11,810,00.00"), names against the roster and across slides
  ("ARTHUR NYONG STIM" → "ETIM"), title typos ("CORPERATE"), the month, and,
  when that month is in the workbook, each person's figures. Every fix is
  listed and can be unticked. The deck can also fill "Earlier months" from its
  January–December table and set teams and senior staff on the roster from
  its team slides. Uploaded slides are saved with the month, sit next to
  WeekDeck's own slides, can be edited (title, cells, rows, Recalculate) and
  take any of the 96 looks.

Server: `src/routes/accounts.js`, `src/utils/accounts.js` (rules, unit-tested),
models `Accountant`, `Payment`, `Marketer`, `ImportedDeck`. Browser: `src/pages/accounts/`,
`src/components/accounts/Grid.tsx`, `src/lib/accounts/` (columns, Excel
read/write on JSZip, importer, deck builder, name matching, slide import and
checks; tests in `accounts.test.ts` and `slides.test.ts`). No new packages.

## Run it on your computer

Needs Node.js 20+ and a MongoDB database.

**1. Database.** Easiest is free MongoDB Atlas:
<https://www.mongodb.com/cloud/atlas> → create a free cluster → *Database
Access*: add a user and password → *Network Access*: add your IP (or
`0.0.0.0/0` for a hosted server) → *Connect → Drivers*: copy the connection
string. Put a database name after `.net/`, e.g. `.../weekdeck?retryWrites=true`.
(A local MongoDB works too: `mongodb://127.0.0.1:27017/weekdeck`.)

**2. Install and configure.**

```bash
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
```

In `server/.env` set:

| Variable | Value |
|---|---|
| `MONGODB_URI` | The connection string from step 1 |
| `JWT_SECRET` | 32+ random characters (see below) |
| `CORS_ORIGINS` | `http://localhost:5173` locally; your site's address when live |
| `ADMIN_SECRET` | Optional, 16+ characters; lets you reset a forgotten PIN |
| `DNS_SERVERS` | Optional. `8.8.8.8,1.1.1.1` if Atlas fails with `querySrv ECONNREFUSED` |
| `PIXABAY_API_KEY` | Optional, free. Turns on real cover photos (Team → Cover photo → Find a photo). Sign up at pixabay.com, key at pixabay.com/api/docs. (`PEXELS_API_KEY` also works if you have one.) |
| `GROQ_API_KEY` | Optional, free, no card. AI ideas, Write with AI, sorting event results. console.groq.com/keys |
| `TAVILY_API_KEY` | Optional, free (1,000 searches/month), no card. Web search for Events near us. app.tavily.com |
| `GEMINI_API_KEY` | Optional, free. Events near us, Write with AI, AI ideas. Get it at aistudio.google.com/apikey. `GEMINI_MODEL` picks the model |
| `ANTHROPIC_API_KEY` | Optional. Turns on *AI ideas* (from platform.claude.com). `AI_MODEL` picks the model |

Make a random secret with:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**3. Start both parts** (two terminals):

```bash
npm run dev:server     # http://localhost:4100/api/health
npm run dev:client     # http://localhost:5173
```

Open <http://localhost:5173>, choose **New team**, then upload a PowerPoint.

Checks: `npm run check` (types + backend), `npm test` (unit tests).

## Put it online

- **Backend** (Render, Railway, Fly.io or a VPS): root folder `server/`, build
  `npm ci`, start `npm start`, health check `/api/health`. Add the `server/.env`
  values in the host's settings with `NODE_ENV=production`, and set
  `CORS_ORIGINS` to the website's address.
- **Website** (Netlify, Vercel, Firebase Hosting, Cloudflare Pages): root folder
  `client/`, build `npm run build`, output `dist`. (`client/public/_redirects`
  already sends every path to the app on Netlify.) Set
  `VITE_API_BASE_URL=https://<your-backend>` **before** building. Add a
  "rewrite everything to `/index.html`" rule so `/slides` and `/team` work on
  refresh.

## Forgotten PIN

With `ADMIN_SECRET` set on the server:

```bash
curl -X POST https://<backend>/api/admin/reset-pin \
  -H "Content-Type: application/json" -H "X-Admin-Secret: <ADMIN_SECRET>" \
  -d '{"teamName":"Lifter Marine","newPin":"1234"}'
```

This also logs that team out on every phone. `GET /api/admin/teams` (same header)
lists all teams.

## Security notes

- PINs are stored hashed (bcrypt). 5 wrong PINs lock the team for 15 minutes,
  and login is rate-limited. A 4-digit PIN is a light lock, so encourage 6 digits.
- Changing the PIN logs out all other devices.
- PowerPoint files are read in the browser; only the extracted text, numbers
  and one shrunken cover photo are sent to the server.

## Limits right now

- Only **.pptx** can be imported (not PDF or old .ppt; save those as .pptx first).
- The reader is tuned to decks shaped like the Fagba example (cover, team list,
  weekly table, activities). Unusual decks may need fields filled by hand; the
  review screen shows what was found and what wasn't.
- PDF uses the browser's print dialog.

## Next phases

- **Phase 2:** read PDF decks with AI, an AI "what to focus on next week" note
  on the summary slide, one-tap WhatsApp share of a PDF.
- **Phase 3:** AI cover images, a map of the week's marketing locations,
  suggestions, and a region head's view across teams.

## Project layout

```
client/   Vite + React + TypeScript + Tailwind
  src/lib/importPptx.ts     reads .pptx files (JSZip)
  src/lib/importAnalyze.ts  works out names, figures, activities
  src/lib/deck.ts           the slides and their layout (shared by preview, PDF and PPTX)
  src/lib/exportPptx.ts     PowerPoint export (pptxgenjs)
  src/lib/templates.ts      styles and palettes (the 96 looks)
  src/lib/looks.ts          how each style lays out every slide
  src/lib/suggest.ts        activity memory and suggestions
  src/pages/                Welcome, Setup (import), Week, Slides, Print, Team
server/   Node + Express + Mongoose (plain JavaScript)
  src/routes/               auth, team, weeks (+ history), admin, ai (optional), region, accounts
  src/models/               Team, Week, Region, Accountant, Payment, Marketer, ImportedDeck
```
