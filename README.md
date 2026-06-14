# ⚽ Jake's Game Plan

A personal planner web app for Jake — homework + daily plan, GNR video goal, football fitness & tournaments, World Cup 2026 watchlist, and Nico's care. You and Mum both log in and see the **same data live**: when one of you ticks something done, the other's screen updates instantly. No more "did you do it?" conversations.

Works on any device (phone, tablet, laptop) through a free web link.

---

## What it does

- **Today** – an auto-built daily plan that slots your pending homework around school (6:30am–4:15pm), football (Mon/Wed/Fri 5–6:30pm) and sleep. Saturday morning is for catch-up; Saturday afternoon and Sunday stay free. Shows overdue / due-today alerts and your next tournament.
- **Homework** – add this week's homework per subject (Math, English, Humanities, Bio, Physics, Chem, EM) with a due date and an estimated time. Tick it off when done.
- **GNR Videos** – tracks the 29-by-Dec-31 goal (23 by Nov 14), how many per week you need, each video's stage (idea → filming → editing → done), the new skill you're building, and whether it's uploaded to NEXT + YouTube and logged in the wins doc.
- **Football** – add tournaments when SCUFA announces them, plus a daily fitness checklist.
- **World Cup** – a match watchlist, pre-loaded with Argentina's group games (IST times). Star matches to watch, tick when watched.
- **Nico** – daily puppy-care duties that reset every morning.
- **Twice-weekly email** – an automatic summary emailed to you and Mum every Wednesday & Sunday evening (set up in Part C below).

---

## Setup (do this once — about 15 minutes)

You'll create a free **Firebase** project (stores the shared data) and publish the app on **GitHub Pages** (the free web link). It's all free — no card needed.

### Part A — Firebase (the database)

1. Go to **https://console.firebase.google.com** and sign in with a Google account.
2. Click **Add project** → name it `jake-game-plan` → you can disable Google Analytics → **Create project**.
3. In the left menu open **Build ▸ Authentication ▸ Get started**. Click the **Email/Password** provider and **Enable** it → Save.
4. Still in Authentication, go to the **Users** tab → **Add user**. Create two accounts:
   - your email + a password (this is your login)
   - Mum's email + a password
5. In the left menu open **Build ▸ Firestore Database ▸ Create database** → choose **Start in production mode** → pick a location close to India (e.g. `asia-south1`) → Enable.
6. Open the **Rules** tab, delete what's there, paste the contents of **`firestore.rules`** (in this folder), and click **Publish**.
7. Now get your keys: click the **⚙️ gear ▸ Project settings**. Scroll to **Your apps**, click the **`</>` (Web)** icon, give it a nickname, **Register app**. Firebase shows a `firebaseConfig = { ... }` block.
8. Open **`firebase-config.js`** in this folder and paste each value into the matching quotes. Also update the two emails in the `PEOPLE` list to your real login emails so names show correctly. Save.

### Part B — GitHub Pages (the free web link)

1. Make a free account at **https://github.com** if you don't have one.
2. Click **New repository** → name it `game-plan` → set it to **Public** → **Create repository**.
3. On the repo page click **Add file ▸ Upload files**. Drag in **all the files from this folder** (`index.html`, `styles.css`, `app.js`, `planner.js`, `firebase-config.js` — the one you edited). Click **Commit changes**.
4. Go to **Settings ▸ Pages**. Under **Branch** pick `main` and `/ (root)` → **Save**.
5. Wait ~1 minute, refresh, and GitHub shows your live link, like:
   `https://YOUR-USERNAME.github.io/game-plan/`
6. Open that link on your phone and laptop, log in with the account you made in step A4. Done! 📲

> **Tip:** On your phone, open the link in your browser, then "Add to Home Screen" — it behaves like a real app icon.

### Part C — Twice-weekly email summary (optional but you asked for it ✉️)

This sends a summary email to you **and** Mum automatically every **Wednesday and Sunday at ~7pm IST** — homework status, video progress, football + Nico, and your World Cup watchlist. It runs on **GitHub Actions** (free), so it works even when nobody has the app open.

You'll need three quick things: a Firebase "service account" key, a Gmail "app password" to send from, and a few GitHub secrets.

1. **Firebase service account key:** Firebase Console ▸ ⚙️ **Project settings ▸ Service accounts ▸ Generate new private key**. A `.json` file downloads. Open it and copy **all** of its text.
2. **Gmail app password** (so the script can send from your Gmail): go to **https://myaccount.google.com/apppasswords** (you must have 2-Step Verification turned on first). Create one named `game-plan`, and copy the 16-character password it gives you.
3. **Add the secrets to GitHub:** in your repo go to **Settings ▸ Secrets and variables ▸ Actions ▸ New repository secret**, and add these four:
   - `FIREBASE_SERVICE_ACCOUNT` → paste the entire JSON from step 1
   - `GMAIL_USER` → your Gmail address (the one you made the app password on)
   - `GMAIL_APP_PASSWORD` → the 16-character password from step 2
   - `MAIL_TO` → both recipient emails separated by a comma, e.g. `you@gmail.com, mum@gmail.com`
4. **Make sure the `.github` folder got uploaded.** Dot-folders sometimes get skipped when dragging files. If you don't see an **Actions** tab with the workflow, create it manually: repo ▸ **Add file ▸ Create new file**, type the path `.github/workflows/digest.yml`, and paste in the contents of that file from this folder. Do the same for `scripts/package.json` and `scripts/send-digest.mjs` if they're missing.
5. **Test it now:** go to the **Actions** tab ▸ **Twice-weekly email digest** ▸ **Run workflow**. After a minute, check both inboxes. 🎉

> Note: GitHub pauses scheduled jobs after 60 days with no repo activity — just push any small change (or hit "Run workflow") occasionally to keep it alive. To change the days/time, edit the `cron` line in `.github/workflows/digest.yml`.

---

## Updating the app later

Edit any file on GitHub (or re-upload) and the live site updates in a minute. To add homework each week, just open the app and use the Homework tab — no code needed.

## Keeping it private

The data is only readable by people who log in with the two accounts you created. Don't share those passwords. (The keys in `firebase-config.js` are safe to be public — that's normal for Firebase web apps; the security rules are what protect your data.)

## A note on staying healthy

The plan is built to protect 7+ hours of sleep on school nights and keep weekends mostly free. If a week gets heavy, move tasks to Saturday morning rather than cutting sleep — you'll train and play better rested.
