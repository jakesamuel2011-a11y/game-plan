# Jake's Game Plan — Project Handoff

A personal planner web app for Jake (15, footballer, IGCSE Y9, Bangalore), shared live with his mum Christabel. Pure static web app (HTML/CSS/vanilla JS) on **free GitHub Pages**, backed by **Firebase** (Auth + Firestore). No build step, no server.

---

## 🔗 Key links

- **Live app:** https://jakesamuel2011-a11y.github.io/game-plan/
- **Code (GitHub):** https://github.com/jakesamuel2011-a11y/game-plan
- **Firebase console:** https://console.firebase.google.com → project **jake-challenge-2026**
- **Google Cloud (API key restrictions):** https://console.cloud.google.com → project jake-challenge-2026

## 👤 Logins (the two app accounts)

- **Jake:** jakesamuel2011@gmail.com
- **Christabel (mum):** christabelsingh@gmail.com

Both are Firebase Auth (Email/Password) users. The app shows only Jake's "From Christabel" tab when she's set tasks; Christabel sees approval controls. The GitHub account is **jakesamuel2011-a11y**. (Passwords are not stored here — keep them in a password manager.)

---

## 🆕 Continuing on a new Mac with the Claude desktop app

1. **Before you switch:** make sure GitHub has your latest files (upload any pending changes — see "current versions" below).
2. **On the new Mac:** get the project files one of two ways:
   - **Download from GitHub:** repo page → green **Code** button → **Download ZIP** → unzip to a folder (e.g. `~/Documents/game-plan`). This always has the deployed version. **OR**
   - **Copy this `game-plan` folder** over (AirDrop / cloud / USB) — it has the very latest local edits.
3. **In the Claude desktop app:** connect/select that `game-plan` folder so Claude can read and edit the files.
4. **Brief the new Claude session** by pasting this:
   > "This is 'Jake's Game Plan', a static web app on GitHub Pages + Firebase. Read HANDOFF.md and jose-agent.md in this folder for full context, then help me with: <your request>."
5. Nothing else carries over because the data is in Firebase and the secrets are in GitHub — both cloud-hosted.

---

## 🚀 How to make changes & deploy (IMPORTANT)

You edit files locally, then upload to GitHub; GitHub Pages serves them.

1. Claude edits the files in your folder.
2. **Bump the cache-buster** so the new code actually loads (this is critical — browsers/GitHub cache aggressively). In `index.html`:
   - `app.js?v=NN` → bump NN
   - `styles.css?v=NN` → bump if styles changed
   - and inside `app.js`, the `import ... from "./planner.js?v=NN"` → bump if planner.js changed
3. Go to the repo → **Add file → Upload files** → drag in the changed files → **Commit changes**.
4. Open the live app and hard-refresh: **Cmd + Shift + R** (or an Incognito window).
5. **Verify an upload landed:** open the file on GitHub and Cmd+F for a string you just changed.

### Current cache-buster versions (keep incrementing from here)
- `app.js?v=32`
- `styles.css?v=18`
- planner import `./planner.js?v=28`

> The `.github/workflows/*.yml` files won't drag-upload (hidden folder). Edit those via GitHub's **Add file → Create new file** if needed.

---

## 🗂️ File map

- `index.html` — markup, tab nav, login screen, cache-buster versions.
- `styles.css` — all styling (dark green football theme, mobile-first).
- `app.js` — Firebase wiring, auth, live Firestore subscriptions, all rendering/CRUD, dashboard, progress/badges, quotes.
- `planner.js` — **pure, testable** daily-plan generator + match-assessment logic. No Firebase. Imported by app.js with a `?v=` cache-buster.
- `firebase-config.js` — Firebase keys (safe to be public) + PEOPLE name map.
- `firestore.rules` — security rules (reference copy; the live rules live in Firebase Console).
- `scripts/send-digest.mjs` + `scripts/send-monthly.mjs` + `scripts/package.json` — email automations.
- `.github/workflows/digest.yml` (twice-weekly) + `monthly.yml` (monthly) — schedules.
- `jose-agent.md` — a maintenance-assistant agent definition ("José").
- `README.md` — original Firebase + GitHub Pages setup guide.

---

## 🔥 Firestore data model (collections)

- `homework` {subject, task, due (YYYY-MM-DD), mins, status (todo|done), addedBy, doneBy, doneAt}
- `videos` {title, skill, stage (idea|done), next (bool), youtube (bool), doneAt}
- `fixtures` {match, date, time, comp, watch, watched, reqStatus (none|requested|approved|declined), reqNote, reqBy, reqDecidedBy}
- `tournaments` {name, date, location}
- `routines` {title, kind (fitness|nico)}
- `nicolog/{YYYY-MM-DD}` — map of routineId → {by} (daily check-offs)
- `momtasks` {text, due, done, by, doneBy, doneAt}
- `footballoff/{YYYY-MM-DD}` — training cancelled that date
- `footballresched/{YYYY-MM-DD}` — {orig, toDate, from, to}
- `holidays` {from, to, name} — single day (from==to) or a range
- `winslog/{weekMondayYYYY-MM-DD}` — {done} weekly NEXT-wins checkbox
- `weeklog/{weekMondayYYYY-MM-DD}` — {pillarsMet, rating, onTarget, fitness, nicoDays} (drives streaks/badges)
- `meta/seeded`, `meta/fix_fixture_times_v1` — one-time setup/migration flags

---

## ✅ Features (what's built)

- **Home dashboard:** one-glance cards (homework, videos, football, World Cup, Nico, From Christabel, today, progress) + a status-aware encouraging banner.
- **Today:** date-stamped daily plan auto-built around school (6:30a–4:15p), football (Mon/Wed/Fri 5–6:30p) and 7h45 sleep; opens with a daily quote (4 football quotes + 3 Bible verses/week). Football **Cancelled / Rescheduled** toggles. **Holiday** marking (single day or range) → weekday/Saturday holidays use the morning to catch up on homework; Sunday fully free.
- **Homework:** add/edit (subject, description, due, mins), no delete; **effective deadline** = the school day before due (or previous Saturday) so it shows "pending — do today" the day before and "overdue" after. "Completed this week" + "Earlier completed" sections.
- **GNR Videos:** 29-by-Dec-31 goal; per-video checkboxes (Video created / Uploaded to NEXT / Uploaded to YouTube); weekly "wins doc submitted" checkbox; "Videos created" section.
- **Football:** tournaments + daily fitness routine.
- **World Cup:** watchlist with weekday dates; **approval flow** (school-night/late matches need Christabel's OK; auto-decline during school hours; weekend/daytime auto-OK), with a recommendation engine (approve/conditional/hold) based on Jake meeting his weekly requirements; "Already played" section; no delete.
- **Nico:** daily puppy-care duties.
- **Progress:** weekly Form rating /10 (4 requirements: HW on time · 1 video · 3 fitness · Nico 5/7 days), week streak, 4 **football streak badges** (Kickoff/In Form/Clean Sheet/Captain's Armband) + 5-tier **Career Ladder** (Academy→Legend, blended season %). Tap a badge for its explanation.
- **Emails:** twice-weekly digest (Wed & Sun ~7pm IST) + monthly report (1st of month) to both, via GitHub Actions.

## ⏰ Jake's schedule rules (the planner protects these)
School 6:30am–4:15pm. Football Mon/Wed/Fri 5–6:30pm. Lights out 10pm school nights (~7h45 sleep). Weekdays + Saturday morning for work; Saturday afternoon + Sunday free. Edit in `planner.js` (`dayTemplate`).

---

## 🤖 Automations & secrets

Two GitHub Actions run on a schedule using **firebase-admin + nodemailer**. They need 4 **GitHub repo secrets** (Settings → Secrets and variables → Actions) — these live in GitHub, not in files:
- `FIREBASE_SERVICE_ACCOUNT` (a Firebase service-account JSON)
- `GMAIL_USER`, `GMAIL_APP_PASSWORD` (a Gmail app password to send from)
- `MAIL_TO` (both recipient emails)

If emails ever stop: GitHub pauses scheduled jobs after ~60 days of repo inactivity — just hit **Run workflow** in the Actions tab to wake them.

## 🔒 Security
Firestore rules are locked to the two emails only (in Firebase Console → Firestore → Rules). The Firebase web API key is public by design (safe). The Google Cloud API key is restricted to the GitHub Pages domain + localhost. If you add a new login, add its email to the rules.

---

## ⚠️ Gotchas learned
- **Always bump the cache-buster** or changes won't show (this caused several "looks old" moments).
- If `planner.js` changes, bump its `?v=` in the app.js import too.
- Keep top-level helper `const`s (like `ymd`) defined **before** any load-time code that uses them, or the whole script throws.
- `.github/` is hidden in Finder (Cmd+Shift+. to show) and won't drag-upload — create those files via GitHub's web editor.
