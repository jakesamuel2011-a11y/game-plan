# Jake's Game Plan — Project Handoff

A personal planner web app for Jake, shared live with his mum Christabel. Pure static web app (HTML/CSS/vanilla JS) on **free GitHub Pages**, backed by **Firebase** (Auth + Firestore). No build step, no server.

---

## 🔗 Key links

- **Live app:** https://jakesamuel2011-a11y.github.io/game-plan/
- **Code (GitHub):** https://github.com/jakesamuel2011-a11y/game-plan
- **Firebase console:** https://console.firebase.google.com → project **jake-challenge-2026**
- **Google Cloud (API key restrictions):** https://console.cloud.google.com → project jake-challenge-2026

## 👤 Logins (the two app accounts)

Two Firebase Auth (Email/Password) users: Jake and Christabel. Their login emails live in **one place in code**, the `PEOPLE` map in `firebase-config.js` (app.js works out who is the parent from it), plus the live security rules in the Firebase console. Christabel sees parent-only bits (match approvals, the Revision parent check). Passwords are never stored in this repo; a forgotten one can be reset from the login screen's "Forgot password?" button.

> This repo is **public** (free GitHub Pages needs that), so keep personal details (ages, school, city, contact details) out of these notes. App data is not public: it lives in Firebase, readable only by the two logins.

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
- `app.js?v=54`
- `styles.css?v=30`
- planner import `./planner.js?v=28`
- timetable import `./timetable.js?v=3` (Jake's school timetable, shown in Today)
- revision import in app.js `./revision/revision.js?v=16` (and its own imports of `syllabus.js?v=3` / `packview.js?v=8`)
- pack JSON files: bump `PACK_VERSION` in `revision/syllabus.js`

> The `.github/workflows/*.yml` files won't drag-upload (hidden folder). Edit those via GitHub's **Add file → Create new file** if needed.

> **Faster deploy (via Claude):** Christabel's GitHub account (`Christabelsingh`) now has **write** access to the repo, so Claude can push changes straight to `main` with the `gh` CLI — GitHub Pages redeploys automatically, no manual upload needed. (Local files live in OneDrive with Files On-Demand and sometimes won't download; if so, Claude pulls current source from GitHub raw instead.)

---

## 🗂️ File map

- `index.html` — markup, tab nav, login screen, cache-buster versions.
- `styles.css` — all styling (dark green football theme, mobile-first).
- `app.js` — Firebase wiring, auth, live Firestore subscriptions, all rendering/CRUD, dashboard, progress/badges, quotes.
- `timetable.js` — Jake's school timetable (Vaayu 9 IGCSE), by weekday; shown as a full-week grid in the Today tab, with the selected day highlighted. Teachers' names left out (public repo).
- `planner.js` — **pure, testable** daily-plan generator + match-assessment logic. No Firebase. Imported by app.js with a `?v=` cache-buster.
- `firebase-config.js` — Firebase keys (safe to be public) + PEOPLE name map.
- `firestore.rules` — security rules (reference copy; the live rules live in Firebase Console).
- `scripts/send-digest.mjs` + `scripts/send-monthly.mjs` + `scripts/send-session-email.mjs` + `scripts/package.json` — email automations. The session email goes to the parent (PEOPLE entry in firebase-config.js, or a `MAIL_PARENT` secret).
- `.github/workflows/digest.yml` (twice-weekly) + `monthly.yml` (monthly) + `session-email.yml` (every 15 min: emails each finished study session once) — schedules. Pushing workflow files needs a `gh` token with the `workflow` scope (`gh auth refresh -h github.com -s workflow`).
- `revision/revision.js` — the 📖 Revision tab (subjects, topics, Round 1/2, tests, sessions, parent check). Exposes `sessionsFor` / `upcomingTests` / `paceSummary` to app.js for the Today plan + dashboard.
- `revision/syllabus.js` — **edit this to add topics**: subjects → topics (stable ids!) → must-know points → practice pack; exam-format cards; the Feb goal; the Nov seed plan.
- `revision/packview.js` — pure renderer for a practice pack (flashcards, quiz/date quiz, exam questions with mark scheme or model answer, data practice, 6-mark plans, 10-mark drill, timeline).
- `revision/packs/*.json` — one file per practice pack. A new subject's pack = a new JSON file + `pack:` on its topics.
- `dev/revision-preview.html` — local preview of the Revision tab on fake in-memory data (`python3 -m http.server 8765` from the repo root → `/dev/revision-preview.html`, `?as=jake` to view as Jake).
- `jose-agent.md` — a maintenance-assistant agent definition ("José").
- `README.md` — original Firebase + GitHub Pages setup guide.

---

## 🔥 Firestore data model (collections)

- `homework` {subject, task, due (YYYY-MM-DD), mins, status (todo|done), addedBy, doneBy, doneAt}
- `videos` — repurposed as the **content deliverables** collection (Shorts + Songs):
  - shorts: {kind:"short", title, skill, stage (idea|done), uploaded (bool), addedBy, doneAt}
  - songs:  {kind:"song", slot (1|2), title, by (YYYY-MM-DD due), stage (idea|done), uploaded (bool)}
  - (Legacy GNR-video docs — no `kind` field — are deleted by the `deliverables_v1` migration.)
- `fixtures` {match, date, time, comp, watch, watched, reqStatus (none|requested|approved|declined), reqNote, reqBy, reqDecidedBy}
- `tournaments` {name, date, location}
- `routines` {title, kind (fitness|nico)}
- `nicolog/{YYYY-MM-DD}` — map of routineId → {by} (daily check-offs)
- `momtasks` {text, due, done, by, doneBy, doneAt}
- `footballoff/{YYYY-MM-DD}` — training cancelled that date
- `footballmissed/{YYYY-MM-DD}` — {date, reason, note, by} training Jake missed (Football tab + "I missed it" on Today); drives attendance %
- `footballresched/{YYYY-MM-DD}` — {orig, toDate, from, to}
- `holidays` {from, to, name} — single day (from==to) or a range
- `winslog/{...}` — **retired** (was the weekly NEXT-wins checkbox; removed with the GNR video goal)
- `weeklog/{weekMondayYYYY-MM-DD}` — {pillarsMet, rating, onTarget, fitness, nicoDays} (drives streaks/badges)
- `revprogress/{topicId}` {r1:{done,conf,at,by}, r2:{…}, pts:{index:true}} — revision rounds + checklist ticks
- `revsessions` {date, slot, subject, topics[], title, method, mins, done, conf, notes, doneBy, doneAt} — planned revision sessions (feed the Today plan); finishing one marks the next round on its topics
- `revtests` {subject, name, date, topics[]}
- `revpractice/{packId}` {answers, cards, quizzes[], drills, done, sent} — practice-pack progress (shared: both logins can see it). `done` = answers Jake tapped Submit on; `sent` = answers already sent for grading
- `studysessions` {by, date, start, end, mins, subjects[], status: running|done, conf, notes, answers, answersBy{subject:n}, grades{subject:gradeId}, gradeId (first; older sessions), emailed} — Jake's timed study sessions (Start / End bar on every Revision page; table in Progress). Ending one copies the new answers in its subjects into one `revgrade` set per subject (Progress shows one row per subject, each with its own score); `send-session-email.mjs` emails it to the parent and sets `emailed`. Sessions of 20+ min count toward the weekly revision requirement. While a session is running, model answers / mark schemes are hidden for Jake (packview `locked` option)
- `revgrade` {sessionId, subjects[], subject, date, by, items[{q, marks, answer, guide, subject}], prompt, status, feedback, score} — grading sets. The parent copies `prompt` (questions, answers, mark schemes) into Claude and pastes the feedback back for Jake; waiting sets are also in the digest email. Older sets (no sessionId) came from the retired "Grade this" button
- `meta/revision_v1` — seeds the Nov 7–13 EM/Bio plan + tests once
- `meta/history_rename_v1` — one-time move of homework subject Humanities → History (revision keeps the internal key "Humanities", shown as History)
- `meta/seeded`, `meta/fix_fixture_times_v1`, `meta/deliverables_v1` — one-time setup/migration flags

---

## ✅ Features (what's built)

- **Home dashboard:** one-glance cards (homework, revision, content, football, To Watch, today, progress) + a status-aware encouraging banner.
- **Today:** date-stamped daily plan auto-built around school (6:30a–4:15p), football (Mon/Wed/Fri 5–6:30p) and 7h45 sleep; opens with a daily quote (4 football quotes + 3 Bible verses/week). Football **Cancelled / Rescheduled** toggles. **Holiday** marking (single day or range) → weekday/Saturday holidays use the morning to catch up on homework; Sunday fully free.
- **Homework:** add/edit (subject, description, due, mins), no delete; **effective deadline** = the school day before due (or previous Saturday) so it shows "pending — do today" the day before and "overdue" after. "Completed this week" + "Earlier completed" sections.
- **Content (🎬 tab):** two committed tracks. **YT Shorts** (football) — 15 by Nov 13, milestone 5 by Aug 31 then 1/week; per-short checkboxes (Filmed & edited / Uploaded to YouTube), a pace bar (on pace / behind), and an "on pace" ramp helper. **Songs** — 2 on a private YT channel (Song 1 by Sep 20, Song 2 by Nov 1), fixed rows with editable title, due-date pill, and Written & recorded / Uploaded checkboxes. Opens with Jake's mission statement. Shorts logic lives in `SHORTS_GOAL`/`SHORTS_M1`/`SHORTS_DEADLINE`/`SONG_PLAN`/`shortsExpected()` near the top of `app.js`.
- **Football:** tournaments, missed-training log with monthly attendance %, daily fitness routine.
- **World Cup:** watchlist with weekday dates; **approval flow** (school-night/late matches need Christabel's OK; auto-decline during school hours; weekend/daytime auto-OK), with a recommendation engine (approve/conditional/hold) based on Jake meeting his weekly requirements; "Already played" section; no delete.
- **Revision (📖 tab):** subjects → topics with Round 1 / Round 2 + confidence, must-know checklists, practice packs, tests, planned sessions in the Today plan; goal = 2 full revisions by 28 Feb 2027. Nico and From Christabel tabs were removed (Nov 2026); their Firestore data (`routines` kind nico, `momtasks`) is left untouched.
- **Progress:** weekly Form rating /10 (4 requirements: HW on time · 1 short · 3 fitness · 2 revision rounds/sessions), week streak, 4 **football streak badges** (Kickoff/In Form/Clean Sheet/Captain's Armband) + 5-tier **Career Ladder** (Academy→Legend, blended season %; content target = 15 shorts + 2 songs; revision target = 30). Tap a badge for its explanation.
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
Firestore rules are locked to the two login emails only. The live rules are in Firebase Console → Firestore → Rules; `firestore.rules` here is a template with placeholders, so fill in the emails if you ever paste it in. The Firebase web API key is public by design (safe). The Google Cloud API key is restricted to the GitHub Pages domain + localhost. If you add a new login, add its email to the rules.

---

## ⚠️ Gotchas learned
- **Always bump the cache-buster** or changes won't show (this caused several "looks old" moments).
- If `planner.js` changes, bump its `?v=` in the app.js import too.
- Keep top-level helper `const`s (like `ymd`) defined **before** any load-time code that uses them, or the whole script throws.
- `.github/` is hidden in Finder (Cmd+Shift+. to show) and won't drag-upload — create those files via GitHub's web editor.
