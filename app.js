// =============================================================
//  app.js — Firebase wiring + UI for Jake's Game Plan
// =============================================================
import { firebaseConfig, PEOPLE } from "./firebase-config.js";
import { buildDayPlan, matchAssessment, FOOTBALL_DAYS } from "./planner.js?v=28";
import { initRevision, sessionsFor, upcomingTests, overdueSessions, paceSummary, revisionCount, progressHtml as revisionProgressHtml, subjectName, openSubject as openRevisionSubject, render as renderRevision } from "./revision/revision.js?v=10";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

const $ = (id) => document.getElementById(id);
const nameFor = (email) => PEOPLE[email] || (email ? email.split("@")[0] : "someone");
const todayStr = () => new Date().toISOString().slice(0, 10);
const ymd = (d) => d.toISOString().slice(0, 10);
const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

let ME = null;
let MY_NAME = "";
let progressCache = null; // {week, streak, overallPct, badges…}
let progressTimer = null;
// Login emails come from PEOPLE in firebase-config.js (the one place they're listed).
const emailFor = (name) => Object.keys(PEOPLE).find(e => PEOPLE[e] === name) || "";
const MUM_EMAIL = emailFor("Christabel");
const JAKE_EMAIL = emailFor("Jake");
const isMum = () => !!ME && ME.email === MUM_EMAIL;   // Christabel
const isJake = () => !!ME && ME.email === JAKE_EMAIL;
const cache = { homework: [], videos: [], fixtures: [], tournaments: [], routines: [], nicolog: {}, missed: [], footballOff: new Set(), resched: new Map(), holidays: [] };

// ---------- CONTENT GOALS: YT Shorts + Songs ----------
// Jake's commitment: 15 football YT Shorts (5 by Aug 31, then 1/week to Nov 13)
// + 2 songs on a private YT channel (Song 1 by Sep 20, Song 2 by Nov 1).
const SHORTS_GOAL = 15;
const SHORTS_M1 = { n: 5, by: "2026-08-31" };  // first milestone: 5 shorts by Aug 31
const SHORTS_DEADLINE = "2026-11-13";          // remaining 10 at 1/week → 15 by Nov 13
const SONG_PLAN = [
  { slot: 1, by: "2026-09-20" },
  { slot: 2, by: "2026-10-20" },
];
const MISSION = "I will create each of these in the best way I can, learning new skills and getting better at my art as well as my time management along the way.";
const shortsAll = () => cache.videos.filter(v => v.kind === "short");
const songsAll = () => cache.videos.filter(v => v.kind === "song").sort((a, b) => (a.slot || 0) - (b.slot || 0));
const isCreated = (v) => v.stage === "done";
// Expected shorts done by today: 0 before the Aug-31 milestone, then a straight
// ramp from 5 up to 15 between Aug 31 and Nov 13.
function shortsExpected() {
  const now = new Date();
  const m1 = new Date(SHORTS_M1.by + "T00:00:00");
  const dl = new Date(SHORTS_DEADLINE + "T00:00:00");
  if (now <= m1) return 0;
  if (now >= dl) return SHORTS_GOAL;
  return Math.round(SHORTS_M1.n + (SHORTS_GOAL - SHORTS_M1.n) * (now - m1) / (dl - m1));
}
function fmtT(hhmm) { if (!hhmm) return ""; const [h, m] = hhmm.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; let hh = h % 12; if (hh === 0) hh = 12; return m ? `${hh}:${String(m).padStart(2, "0")}${ap}` : `${hh}${ap}`; }
function fmtDate(s) { if (!s) return ""; const d = new Date(s + "T00:00:00"); return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
function fmtDayMonth(s) { if (!s) return ""; const d = new Date(s + "T00:00:00"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
const isHoliday = (dateStr) => cache.holidays.some(h => h.from && h.to && dateStr >= h.from && dateStr <= h.to);

// Daily inspiration — wide pool so it won't repeat for ~3 months (rotates daily).
// Famous footballer/manager quotes + clearly-labelled "Football wisdom" mantras.
const QUOTES = [
  ["Success is no accident. It's hard work, perseverance, sacrifice and love of what you're doing.", "Pelé"],
  ["The more difficult the victory, the greater the happiness in winning.", "Pelé"],
  ["Everything is practice.", "Pelé"],
  ["Enthusiasm is everything. It must be taut and vibrating like a guitar string.", "Pelé"],
  ["You have to fight to reach your dream. Sacrifice and work hard for it.", "Lionel Messi"],
  ["The day you think there's no improvement to be made is a sad one for any player.", "Lionel Messi"],
  ["It took me 17 years to become an overnight success.", "Lionel Messi"],
  ["I start early and I stay late, day after day, year after year.", "Lionel Messi"],
  ["You can overcome anything if you love something enough.", "Lionel Messi"],
  ["Talent without working hard is nothing.", "Cristiano Ronaldo"],
  ["We don't want to tell our dreams. We want to show them.", "Cristiano Ronaldo"],
  ["Your love makes me strong; your hate makes me unstoppable.", "Cristiano Ronaldo"],
  ["Magic is sometimes very close to nothing at all.", "Zinedine Zidane"],
  ["I take things as they come, and I give everything I have.", "Zinedine Zidane"],
  ["Playing football is simple, but playing simple football is the hardest thing there is.", "Johan Cruyff"],
  ["Quality without results is pointless. Results without quality is boring.", "Johan Cruyff"],
  ["Every disadvantage has its advantage.", "Johan Cruyff"],
  ["Football is a game you play with your brain.", "Johan Cruyff"],
  ["You play football with your head; your legs are there to help you.", "Johan Cruyff"],
  ["I've never seen a bag of money score a goal.", "Johan Cruyff"],
  ["There is only one ball, so you need to have it.", "Johan Cruyff"],
  ["When people succeed, it's because of hard work. Luck has nothing to do with it.", "Diego Maradona"],
  ["I learned all about life with a ball at my feet.", "Ronaldinho"],
  ["Hard work beats talent when talent doesn't work hard.", "Sir Alex Ferguson"],
  ["If you give up the first time, you'll always give up.", "Sir Alex Ferguson"],
  ["Practice makes permanent.", "Bobby Robson"],
  ["There's nothing wrong with losing — there's something wrong with not trying.", "Bobby Robson"],
  ["Football is not a matter of life and death. It's much more important than that.", "Bill Shankly"],
  ["To be a great team you need great mentality and great solidarity.", "Arsène Wenger"],
  ["Success is partly chosen and partly the result of hard work.", "Arsène Wenger"],
  ["The target should be to do it so well that it becomes an art.", "Arsène Wenger"],
  ["The best moment to score a goal is directly after you've scored one.", "Jürgen Klopp"],
  ["The team, not the individual, is the ultimate champion.", "Mia Hamm"],
  ["Celebrate what you've accomplished, but raise the bar higher each time you succeed.", "Mia Hamm"],
  ["Somewhere behind the athlete you've become are the dreamers who believed.", "Mia Hamm"],
  ["Lead from wherever you are.", "Abby Wambach"],
  ["The ball doesn't know how much money you make.", "Abby Wambach"],
  ["Think quickly, look for spaces. That's the game: look for spaces.", "Xavi"],
  ["When the season starts, the aim is to win everything — with the team.", "Lionel Messi"],
  ["I'm always trying to improve and evolve as a player.", "Cristiano Ronaldo"],
  ["Train like you've never won. Play like you've never lost.", "Football wisdom"],
  ["Champions keep playing until they get it right.", "Football wisdom"],
  ["Hard work in silence — let the results make the noise.", "Football wisdom"],
  ["Small steps every day win the season.", "Football wisdom"],
  ["You miss 100% of the shots you don't take.", "Football wisdom"],
  ["Discipline today, trophies tomorrow.", "Football wisdom"],
  ["Control what you can: effort, attitude, preparation.", "Football wisdom"],
  ["Great players make the players around them better.", "Football wisdom"],
  ["The extra rep is where champions are made.", "Football wisdom"],
  ["Win the day, and the season takes care of itself.", "Football wisdom"],
  ["Tough times don't last; tough teams do.", "Football wisdom"],
  ["Consistency beats intensity.", "Football wisdom"],
  ["Sweat more in training, bleed less in matches.", "Football wisdom"],
  ["Your only competition is who you were yesterday.", "Football wisdom"],
  ["Show up — especially on the days you don't feel like it.", "Football wisdom"],
  ["Talent sets the floor; work sets the ceiling.", "Football wisdom"],
  ["Play simple, play smart, play together.", "Football wisdom"],
  ["Recover well — rest is part of training.", "Football wisdom"],
  ["A good first touch buys you a second of time.", "Football wisdom"],
  ["Heads up, chest out, next play.", "Football wisdom"],
  ["Mistakes are coaching, not failure.", "Football wisdom"],
  ["Be the hardest worker on the pitch.", "Football wisdom"],
  ["Dreams need a deadline and a plan.", "Football wisdom"],
  ["Earn it in practice so it's automatic in the match.", "Football wisdom"],
  ["Pressure is a privilege.", "Football wisdom"],
  ["Finish what you start.", "Football wisdom"],
  ["Fitness is a habit, not an event.", "Football wisdom"],
  ["Stay humble, stay hungry.", "Football wisdom"],
  ["One percent better, every single day.", "Football wisdom"],
  ["Big moments love prepared players.", "Football wisdom"],
  ["Keep the ball, keep the faith.", "Football wisdom"],
  ["The scoreboard rewards the work no one sees.", "Football wisdom"],
  ["First to every loose ball.", "Football wisdom"],
  ["Defend like it's 0-0, attack like you're chasing the game.", "Football wisdom"],
  ["Communication is a skill — use your voice.", "Football wisdom"],
  ["Read the game one pass ahead.", "Football wisdom"],
  ["Make the easy pass look easy.", "Football wisdom"],
  ["Effort is non-negotiable.", "Football wisdom"],
  ["Set the tempo, don't follow it.", "Football wisdom"],
  ["Every touch has a purpose.", "Football wisdom"],
  ["Compete for 90 minutes, not 89.", "Football wisdom"],
  ["Bounce back faster than you fall.", "Football wisdom"],
  ["Preparation removes pressure.", "Football wisdom"],
  ["Be coachable; feedback is fuel.", "Football wisdom"],
  ["Protect your sleep like you protect a lead.", "Football wisdom"],
  ["Confidence is built, not given.", "Football wisdom"],
  ["Play for the badge and your teammates.", "Football wisdom"],
  ["Slow is smooth, smooth is fast.", "Football wisdom"],
  ["The next action is the most important one.", "Football wisdom"],
  ["Warm up properly, finish stronger.", "Football wisdom"],
  ["Stay ready so you never have to get ready.", "Football wisdom"],
];
// Inspirational Bible verses (shown on 3 days/week; football quotes on the other 4)
const VERSES = [
  ["I can do all things through Christ who strengthens me.", "Philippians 4:13"],
  ["Be strong and courageous. Do not be afraid, for the Lord your God is with you wherever you go.", "Joshua 1:9"],
  ["Whatever you do, work at it with all your heart.", "Colossians 3:23"],
  ["Let us run with perseverance the race marked out for us.", "Hebrews 12:1"],
  ["Those who hope in the Lord will renew their strength; they will run and not grow weary.", "Isaiah 40:31"],
  ["Commit to the Lord whatever you do, and your plans will succeed.", "Proverbs 16:3"],
  ["The Lord is my strength and my shield; my heart trusts in him.", "Psalm 28:7"],
  ["For I know the plans I have for you — plans to give you hope and a future.", "Jeremiah 29:11"],
  ["Trust in the Lord with all your heart, and lean not on your own understanding.", "Proverbs 3:5"],
  ["Everyone who competes in the games trains with discipline.", "1 Corinthians 9:25"],
  ["Run in such a way as to get the prize.", "1 Corinthians 9:24"],
  ["I press on toward the goal to win the prize.", "Philippians 3:14"],
  ["Whoever is faithful in little will be faithful in much.", "Luke 16:10"],
  ["Let us not become weary in doing good, for in due time we will reap a harvest.", "Galatians 6:9"],
  ["He gives strength to the weary and increases the power of the weak.", "Isaiah 40:29"],
  ["The plans of the diligent lead surely to abundance.", "Proverbs 21:5"],
  ["Whatever your hand finds to do, do it with all your might.", "Ecclesiastes 9:10"],
  ["Be strong, and let your heart take courage.", "Psalm 31:24"],
  ["In their hearts humans plan their course, but the Lord establishes their steps.", "Proverbs 16:9"],
  ["Iron sharpens iron, so one person sharpens another.", "Proverbs 27:17"],
  ["Be on your guard; stand firm in the faith; be courageous; be strong.", "1 Corinthians 16:13"],
  ["Cast all your anxiety on him, because he cares for you.", "1 Peter 5:7"],
  ["Be strong in the Lord and in his mighty power.", "Ephesians 6:10"],
  ["A cheerful heart is good medicine.", "Proverbs 17:22"],
  ["Wait for the Lord; be strong and take heart.", "Psalm 27:14"],
  ["Encourage one another and build each other up.", "1 Thessalonians 5:11"],
  ["Humble yourselves before the Lord, and he will lift you up.", "James 4:10"],
  ["Whatever is true, whatever is noble, whatever is right — think about such things.", "Philippians 4:8"],
  ["The Lord will fight for you; you need only to be still.", "Exodus 14:14"],
  ["Patience is better than pride.", "Ecclesiastes 7:8"],
  ["A good name is more desirable than great riches.", "Proverbs 22:1"],
  ["Train yourself to be godly.", "1 Timothy 4:7"],
  ["Do everything in love.", "1 Corinthians 16:14"],
  ["Where there is no vision, the people perish.", "Proverbs 29:18"],
  ["Do not be overcome by evil, but overcome evil with good.", "Romans 12:21"],
  ["Plans fail for lack of counsel, but with many advisers they succeed.", "Proverbs 15:22"],
  ["The Lord gives wisdom; from his mouth come knowledge and understanding.", "Proverbs 2:6"],
  ["Let your light shine before others.", "Matthew 5:16"],
  ["Be joyful in hope, patient in affliction, faithful in prayer.", "Romans 12:12"],
];
// Tue/Thu/Sat = verse days (3/week); the other 4 days = football quotes.
function quoteOfDay() {
  const now = new Date();
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  const verseDay = [2, 4, 6].includes(now.getDay());
  return verseDay ? VERSES[day % VERSES.length] : QUOTES[day % QUOTES.length];
}

// date string of the n-th upcoming school day (Mon–Fri), today included
function workingHorizon(n = 2) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let c = 0;
  for (let i = 0; i < 21; i++) {
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) { c++; if (c >= n) return ymd(d); }
    d.setDate(d.getDate() + 1);
  }
  return ymd(d);
}
// Homework must be finished in advance: by the school day before it's due,
// or at the latest the previous Saturday (if the day-before falls on Sunday).
function effectiveDue(dueStr) {
  if (!dueStr) return "";
  const d = new Date(dueStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 1); // Sunday → Saturday
  return ymd(d);
}
const BADGE_DESC = {
  kickoff: "Complete one full week meeting all four requirements.",
  inform: "Stay on target 3 weeks in a row.",
  cleansheet: "A flawless 10/10 week — nothing missed.",
  captain: "On target 6 weeks in a row — real consistency.",
  academy: "Reach 20% of your season goals.",
  reserves: "Reach 40% of your season goals.",
  firstteam: "Reach 60% of your season goals.",
  star: "Reach 80% of your season goals.",
  legend: "100% — all season goals achieved. Legend.",
};

// ---------- AUTH ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    ME = user;
    MY_NAME = nameFor(user.email);
    $("loginScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("whoami").textContent = MY_NAME;
    await ensureSeed();
    await ensureFixes();
    await ensureDeliverables();
    await ensureFixups();
    await ensureHistoryRename();
    subscribeAll();
    initRevision({
      db, me: () => ME, nameFor, isParent: isMum,
      fs: { collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, query, serverTimestamp },
      onChange: () => { renderToday(); renderDashboard(); clearTimeout(progressTimer); progressTimer = setTimeout(loadProgress, 1500); },
    });
  } else {
    ME = null;
    $("app").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
  }
});

$("loginBtn").onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (e) { $("loginMsg").textContent = friendlyErr(e); }
};
$("forgotBtn").onclick = async () => {
  const email = $("email").value.trim();
  $("loginMsg").textContent = ""; $("loginInfo").textContent = "";
  if (!email) { $("loginMsg").textContent = "Type your email above first, then tap Forgot password."; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    $("loginInfo").textContent = `If ${email} has an account, a reset link is on its way. Check spam, and use only the newest email: each new request cancels the older links.`;
  } catch (e) { $("loginMsg").textContent = friendlyErr(e); }
};
$("logoutBtn").onclick = () => signOut(auth);
function friendlyErr(e) {
  const m = (e.code || "").replace("auth/", "").replace(/-/g, " ");
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "Something went wrong";
}

// ---------- TABS ----------
function activateTab(name) {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(x => x.classList.remove("active"));
  const panel = $("tab-" + name); if (panel) panel.classList.add("active");
  if (name === "progress") loadProgress();
  if (name === "home") renderDashboard();
  if (name === "revision") renderRevision();
  window.scrollTo(0, 0);
}
document.querySelectorAll(".tab").forEach(t => { t.onclick = () => activateTab(t.dataset.tab); });

// ---------- SEED defaults on first run ----------
async function ensureSeed() {
  const metaRef = doc(db, "meta", "seeded");
  const snap = await getDoc(metaRef);
  if (snap.exists()) return;

  const fitness = [
    "Stretch + mobility (10 min)", "Core workout (planks, leg raises)",
    "Ball control / juggling practice", "Sprints or conditioning run",
    "Hydrate well + protein with meals",
  ];
  for (const f of fitness) await addDoc(collection(db, "routines"), { title: f, kind: "fitness" });

  const nico = ["Morning feed", "Morning walk / potty", "Evening feed", "Evening walk", "Training session (10 min)", "Fresh water"];
  for (const n of nico) await addDoc(collection(db, "routines"), { title: n, kind: "nico" });

  // Argentina group-stage fixtures, IST kickoff (converted from ET, verified vs FIFA).
  const fixtures = [
    { match: "Argentina vs Algeria", date: "2026-06-17", time: "6:30am IST", watch: true, watched: false, comp: "Group J", reqStatus: "none" },
    { match: "Argentina vs Austria", date: "2026-06-22", time: "10:30pm IST", watch: true, watched: false, comp: "Group J", reqStatus: "none" },
    { match: "Argentina vs Jordan", date: "2026-06-28", time: "7:30am IST", watch: true, watched: false, comp: "Group J", reqStatus: "none" },
  ];
  for (const fx of fixtures) await addDoc(collection(db, "fixtures"), fx);

  await setDoc(metaRef, { at: serverTimestamp() });
}

// ---------- One-time data fixes for already-seeded databases ----------
async function ensureFixes() {
  const ref = doc(db, "meta", "fix_fixture_times_v1");
  if ((await getDoc(ref)).exists()) return;
  const corrections = {
    "Argentina vs Algeria": { date: "2026-06-17", time: "6:30am IST" },
    "Argentina vs Austria": { date: "2026-06-22", time: "10:30pm IST" },
    "Argentina vs Jordan": { date: "2026-06-28", time: "7:30am IST" },
  };
  try {
    const snap = await getDocs(collection(db, "fixtures"));
    for (const d of snap.docs) {
      const c = corrections[d.data().match];
      if (c) await updateDoc(doc(db, "fixtures", d.id), c);
    }
    await setDoc(ref, { at: serverTimestamp() });
  } catch (e) { console.warn("fixtime fix skipped", e); }
}

// ---------- One-time migration: retire GNR videos, seed the new deliverables ----------
// Replaces the old "29 videos by Dec 31" goal with Jake's two committed tracks:
// removes legacy GNR video docs and seeds the 2 song slots (idempotent by slot).
// Shorts are added by Jake as he makes them.
async function ensureDeliverables() {
  const ref = doc(db, "meta", "deliverables_v1");
  if ((await getDoc(ref)).exists()) return;
  try {
    const snap = await getDocs(collection(db, "videos"));
    // Remove legacy GNR videos (docs with no `kind`) — fully replaced by Shorts + Songs.
    for (const d of snap.docs) {
      if (!d.data().kind) await deleteDoc(doc(db, "videos", d.id));
    }
    // Seed the two songs, skipping any slot that already exists.
    const existingSongSlots = new Set(snap.docs.map(d => d.data()).filter(x => x.kind === "song").map(x => x.slot));
    for (const s of SONG_PLAN) {
      if (!existingSongSlots.has(s.slot)) {
        await addDoc(collection(db, "videos"), {
          kind: "song", slot: s.slot, title: "", skill: "", by: s.by,
          stage: "idea", uploaded: false, createdAt: serverTimestamp(),
        });
      }
    }
    await setDoc(ref, { at: serverTimestamp() });
  } catch (e) { console.warn("deliverables migration skipped", e); }
}

// ---------- One-time fixups ----------
// Clears the old World Cup match watchlist (the tab is now a generic
// "Tournaments Watchlist" — Jake adds matches to watch), and moves Song 2's
// due date to Oct 20.
async function ensureFixups() {
  const ref = doc(db, "meta", "fixups_v1");
  if ((await getDoc(ref)).exists()) return;
  try {
    const fx = await getDocs(collection(db, "fixtures"));
    for (const d of fx.docs) await deleteDoc(doc(db, "fixtures", d.id));
    const vids = await getDocs(collection(db, "videos"));
    for (const d of vids.docs) {
      const v = d.data();
      if (v.kind === "song" && v.slot === 2) await updateDoc(doc(db, "videos", d.id), { by: "2026-10-20" });
    }
    await setDoc(ref, { at: serverTimestamp() });
  } catch (e) { console.warn("fixups migration skipped", e); }
}

// Homework subject "Humanities" was renamed "History" (Nov 2026): move existing entries over once.
async function ensureHistoryRename() {
  const ref = doc(db, "meta", "history_rename_v1");
  try {
    if ((await getDoc(ref)).exists()) return;
    const hw = await getDocs(collection(db, "homework"));
    for (const d of hw.docs) if (d.data().subject === "Humanities") await updateDoc(doc(db, "homework", d.id), { subject: "History" });
    await setDoc(ref, { at: serverTimestamp() });
  } catch (e) { console.warn("history rename skipped", e); }
}

// ---------- LIVE SUBSCRIPTIONS ----------
function subscribeAll() {
  onSnapshot(query(collection(db, "homework")), s => { cache.homework = rows(s); renderHomework(); renderToday(); renderDashboard(); });
  onSnapshot(query(collection(db, "videos")), s => { cache.videos = rows(s); renderVideos(); renderDashboard(); });
  onSnapshot(query(collection(db, "fixtures")), s => { cache.fixtures = rows(s); renderFixtures(); renderDashboard(); });
  onSnapshot(query(collection(db, "tournaments")), s => { cache.tournaments = rows(s); renderTournaments(); renderToday(); renderDashboard(); });
  onSnapshot(query(collection(db, "routines")), s => { cache.routines = rows(s); renderFitness(); renderDashboard(); });
  onSnapshot(doc(db, "nicolog", todayStr()), s => { cache.nicolog = s.exists() ? s.data() : {}; renderFitness(); renderDashboard(); });
  onSnapshot(query(collection(db, "footballmissed")), s => { cache.missed = rows(s); renderMissed(); renderToday(); renderDashboard(); });
  onSnapshot(query(collection(db, "footballoff")), s => { cache.footballOff = new Set(s.docs.map(d => d.id)); renderToday(); renderDashboard(); });
  onSnapshot(query(collection(db, "footballresched")), s => { cache.resched = new Map(s.docs.map(d => [d.id, d.data()])); renderToday(); });
  onSnapshot(query(collection(db, "holidays")), s => { cache.holidays = rows(s); renderToday(); });
  loadProgress(); // compute streaks/badges/ladder for the dashboard
}
const rows = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

// ---------- TODAY / PLAN ----------
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
(function fillDaySelect() {
  const sel = $("planDay");
  const today = new Date().getDay();
  for (let i = 0; i < 7; i++) {
    const d = (today + i) % 7;
    const ds = ymd(new Date(Date.now() + i * 864e5));
    const o = document.createElement("option");
    o.value = d;
    o.textContent = i === 0 ? `Today · ${fmtDate(ds)}` : fmtDate(ds);
    sel.appendChild(o);
  }
  sel.onchange = renderToday;
})();

function pendingHw() {
  return cache.homework
    .filter(h => h.status !== "done")
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
}

// date (YYYY-MM-DD) for the selected weekday in the next 7 days
function dateForDay(day) {
  const today = new Date();
  const offset = (day - today.getDay() + 7) % 7;
  const d = new Date(today); d.setDate(today.getDate() + offset);
  return ymd(d);
}
async function setFootballOff(dateStr, off) {
  const ref = doc(db, "footballoff", dateStr);
  if (off) await setDoc(ref, { by: ME.email, at: serverTimestamp() });
  else await deleteDoc(ref);
}
async function setResched(dateStr, data) {
  await setDoc(doc(db, "footballresched", dateStr), { orig: dateStr, ...data, by: ME.email, at: serverTimestamp() }, { merge: true });
}
async function clearResched(dateStr) { try { await deleteDoc(doc(db, "footballresched", dateStr)); } catch (e) { } }

function renderToday() {
  const day = parseInt($("planDay").value);
  const selDate = dateForDay(day);
  $("todayTitle").textContent = `${DAY_NAMES[day]} · ${fmtDayMonth(selDate)}`;
  const isFootballDay = FOOTBALL_DAYS.includes(day);
  const holiday = isHoliday(selDate);
  const missedRec = cache.missed.find(m => m.date === selDate);
  const noFootball = cache.footballOff.has(selDate) || cache.resched.has(selDate) || !!missedRec;
  renderHolidayBox(selDate);

  // Due alerts
  const alerts = $("dueAlerts"); alerts.innerHTML = "";
  const t = todayStr();
  const over = pendingHw().filter(h => h.due && effectiveDue(h.due) < t);
  const due = pendingHw().filter(h => h.due && effectiveDue(h.due) === t);
  if (over.length) addAlert(alerts, "red", `⚠️ ${over.length} overdue: ${over.map(h => h.subject).join(", ")}`);
  if (due.length) addAlert(alerts, "amber", `📌 Pending today (due next school day): ${due.map(h => h.subject).join(", ")}`);
  const tour = cache.tournaments.filter(x => x.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (tour) addAlert(alerts, "green", `🏆 Next tournament: ${tour.name} on ${tour.date}${tour.location ? " · " + tour.location : ""}`);
  if (!over.length && !due.length) addAlert(alerts, "green", "✅ Nothing overdue — nice work!");
  upcomingTests().filter(x => x.date >= selDate && x.date <= ymd(new Date(new Date(selDate + "T00:00:00Z").getTime() + 7 * 864e5))).forEach(x => {
    const n = Math.round((new Date(x.date + "T00:00:00Z") - new Date(selDate + "T00:00:00Z")) / 864e5);
    addAlert(alerts, n <= 1 ? "red" : "amber", `📝 ${x.name} test ${n === 0 ? "today" : n === 1 ? "tomorrow" : "on " + fmtDate(x.date)}`);
  });
  const revToday = sessionsFor(selDate);
  if (revToday.length) addAlert(alerts, "blue", `📖 ${revToday.length} revision session${revToday.length > 1 ? "s" : ""} in the plan below. Tick them off in the Revision tab.`);
  const revMissed = overdueSessions();
  if (selDate === t && revMissed.length) addAlert(alerts, "amber", `📖 ${revMissed.length} missed revision session${revMissed.length > 1 ? "s" : ""}: catch up in the Revision tab.`);

  // Any day a session was MOVED TO
  for (const [orig, r] of cache.resched) {
    if (r.toDate === selDate) addAlert(alerts, "blue", `⚽ Rescheduled training today: ${fmtT(r.from)}–${fmtT(r.to)} (moved from ${orig})`);
  }

  if (holiday) addAlert(alerts, "green", "🎉 Holiday — no school today!");

  // Football status controls (training days: Mon/Wed/Fri): Cancelled / Rescheduled
  if (isFootballDay && !holiday) {
    const cancelled = cache.footballOff.has(selDate);
    const resched = cache.resched.get(selDate);
    const box = document.createElement("div");
    box.className = "alert " + (cancelled || resched || missedRec ? "amber" : "green");
    const head = missedRec ? `❌ Missed training (${esc(missedRec.reason)})${missedRec.note ? ` · ${esc(missedRec.note)}` : ""}`
      : cancelled ? "🌧️ Training cancelled — extra study time"
      : resched ? `🔁 Training moved to ${resched.toDate} · ${fmtT(resched.from)}–${fmtT(resched.to)}`
        : "⚽ Training on (5–6:30pm)";
    box.innerHTML = `<div style="margin-bottom:8px">${head}</div>`;

    const row = document.createElement("div"); row.className = "stage-btns";
    const cBtn = document.createElement("button"); cBtn.textContent = "Cancelled"; cBtn.className = cancelled ? "on" : "";
    const rBtn = document.createElement("button"); rBtn.textContent = "Rescheduled"; rBtn.className = resched ? "on" : "";
    const mBtn = document.createElement("button"); mBtn.textContent = missedRec ? "↩︎ Not missed" : "I missed it"; mBtn.className = missedRec ? "on" : "";
    row.appendChild(cBtn); row.appendChild(rBtn); row.appendChild(mBtn);
    const why = document.createElement("div"); why.className = "stage-btns"; why.style.display = "none";
    why.innerHTML = `<span class="muted small" style="align-self:center">Why?</span>` + MISS_REASONS.map(r => `<button data-r="${r}">${r}</button>`).join("");
    why.querySelectorAll("button").forEach(b => b.onclick = () => logMissed(selDate, b.dataset.r, ""));
    mBtn.onclick = () => { if (missedRec) deleteDoc(doc(db, "footballmissed", selDate)); else why.style.display = why.style.display === "none" ? "flex" : "none"; };
    if (cancelled || resched) {
      const onBtn = document.createElement("button"); onBtn.textContent = "↩︎ Training on";
      onBtn.onclick = async () => { await setFootballOff(selDate, false); await clearResched(selDate); };
      row.appendChild(onBtn);
    }
    box.appendChild(row);
    box.appendChild(why);

    cBtn.onclick = async () => { await clearResched(selDate); await setFootballOff(selDate, true); };

    const form = document.createElement("div");
    form.style.marginTop = "8px";
    form.style.display = resched ? "block" : "none";
    form.innerHTML = `
      <div class="muted small">New date & time:</div>
      <input type="date" class="mininput" value="${resched ? resched.toDate : selDate}" />
      <div class="grid2" style="margin-top:6px">
        <input type="time" class="mininput" value="${resched ? resched.from : "17:00"}" />
        <input type="time" class="mininput" value="${resched ? resched.to : "18:30"}" />
      </div>
      <button class="btn tiny primary" style="margin-top:8px">Save new time</button>`;
    rBtn.onclick = () => { form.style.display = form.style.display === "none" ? "block" : "none"; };
    form.querySelector("button").onclick = async () => {
      const ins = form.querySelectorAll("input");
      const toDate = ins[0].value, from = ins[1].value, to = ins[2].value;
      if (!toDate || !from || !to) return;
      await setFootballOff(selDate, false);
      await setResched(selDate, { toDate, from, to });
    };
    box.appendChild(form);
    alerts.appendChild(box);
  }

  // Quote header — shown above the plan
  const [qt, qa] = quoteOfDay();
  const dq = $("dayQuote");
  if (dq) dq.innerHTML = `“${esc(qt)}”<span class="q-by">— ${esc(qa)}</span>`;

  // Timeline
  const tl = $("timeline"); tl.innerHTML = "";
  const items = pendingHw().map(h => ({ subject: h.subject, task: h.task, mins: h.mins, due: h.due }))
    .concat(sessionsFor(selDate).map(s => ({ subject: "📖 " + subjectName(s.subject) + " revision", task: s.title, mins: s.mins || 45 })));
  const plan = buildDayPlan(day, items, { noFootball, holiday });
  if (plan.rest) {
    tl.innerHTML = `<div class="block rest"><div class="t">All day</div><div class="b">${plan.note}</div></div>`;
    return;
  }
  if (plan.note) {
    const n = document.createElement("div");
    n.className = "block rest";
    n.innerHTML = `<div class="t">Note</div><div class="b">${plan.note}</div>`;
    tl.appendChild(n);
  }
  plan.blocks.forEach(b => {
    const el = document.createElement("div");
    el.className = "block " + (b.kind === "rest" ? "rest" : b.kind === "fixed" ? "fixed" : "");
    el.innerHTML = `<div class="t">${b.time}</div><div class="b">${b.title}${b.sub ? `<div class="b-sub">${b.sub}</div>` : ""}</div>`;
    tl.appendChild(el);
  });
  if (plan.overflow.length) {
    const el = document.createElement("div");
    el.className = "block";
    el.innerHTML = `<div class="t">⚠️ Spillover</div><div class="b">Couldn't fit: ${plan.overflow.map(h => h.subject + " (" + h.mins + "m left)").join(", ")}<div class="b-sub">Move some to Saturday morning or start earlier.</div></div>`;
    tl.appendChild(el);
  }
}
function addAlert(parent, cls, txt) {
  const d = document.createElement("div"); d.className = "alert " + cls; d.textContent = txt; parent.appendChild(d);
}
function renderHolidayBox(selDate) {
  const box = $("holidayBox"); if (!box) return;
  const onHol = isHoliday(selDate);
  let html = `<div class="card add-card"><b>🎉 Holidays</b>
    <div class="muted small" style="margin:4px 0 8px">${onHol ? "This day is a holiday — no school 🎉" : "Mark school holidays (a single day or a longer break) so the plan gives a day off."}</div>
    <div class="grid2"><label class="mins">From<input type="date" id="holFrom" value="${selDate}" /></label><label class="mins">To<input type="date" id="holTo" value="${selDate}" /></label></div>
    <input type="text" id="holName" placeholder="Name (optional) e.g. Mid-term break" />
    <button class="btn primary" id="holAdd">Add holiday</button>`;
  if (cache.holidays.length) {
    html += `<div class="list" style="margin-top:10px">` +
      [...cache.holidays].sort((a, b) => (a.from || "").localeCompare(b.from || "")).map(h =>
        `<div class="item"><div class="item-main"><div class="item-title">${h.from === h.to ? fmtDate(h.from) : `${fmtDate(h.from)} → ${fmtDate(h.to)}`}</div>${h.name ? `<div class="item-sub">${esc(h.name)}</div>` : ""}</div><button class="del" data-id="${h.id}">✕</button></div>`).join("") +
      `</div>`;
  }
  html += `</div>`;
  box.innerHTML = html;
  $("holAdd").onclick = async () => {
    const from = $("holFrom").value; let to = $("holTo").value || from;
    if (!from) return;
    if (to < from) to = from;
    await addDoc(collection(db, "holidays"), { from, to, name: $("holName").value.trim(), by: ME.email, at: serverTimestamp() });
  };
  box.querySelectorAll(".del[data-id]").forEach(b => b.onclick = () => deleteDoc(doc(db, "holidays", b.dataset.id)));
}

// ---------- HOMEWORK ----------
$("hwAdd").onclick = async () => {
  const task = $("hwTask").value.trim();
  if (!task) return;
  await addDoc(collection(db, "homework"), {
    subject: $("hwSubject").value, task, due: $("hwDue").value || "",
    mins: parseInt($("hwMins").value) || 45, status: "todo",
    addedBy: ME.email, createdAt: serverTimestamp(),
  });
  $("hwTask").value = "";
};
function buildHwEl(h) {
  const done = h.status === "done";
  const t = todayStr();
  let pill = "";
  if (!done && h.due) {
    const eff = effectiveDue(h.due);
    if (eff < t) pill = `<span class="pill over">overdue</span>`;
    else if (eff === t) pill = `<span class="pill today">pending — do today</span>`;
    else pill = `<span class="pill soon">do by ${fmtDate(eff)}</span>`;
  }
  const sub = done
    ? `done${h.doneBy ? " by " + nameFor(h.doneBy) : ""}${h.doneAt && h.doneAt.toDate ? " · " + fmtDate(ymd(h.doneAt.toDate())) : ""}`
    : `${pill} ${h.due ? `· due ${fmtDate(h.due)}` : ""} · ${h.mins || 45} min`;
  const el = document.createElement("div");
  el.className = "item" + (done ? " done" : "");
  el.innerHTML = `
    <button class="check ${done ? "on" : ""}">${done ? "✓" : ""}</button>
    <div class="item-main">
      <div class="item-title"><span class="tag subj">${esc(h.subject)}</span>${esc(h.task)}</div>
      <div class="item-sub">${sub}</div>
    </div>
    ${done ? "" : `<button class="edit" title="edit">✎</button>`}`;
  el.querySelector(".check").onclick = () => updateDoc(doc(db, "homework", h.id), {
    status: done ? "todo" : "done", doneBy: done ? "" : ME.email, doneAt: done ? null : serverTimestamp(),
  });
  const editBtn = el.querySelector(".edit");
  if (editBtn) editBtn.onclick = () => editHwForm(el, h);
  return el;
}
function editHwForm(el, h) {
  const subjects = ["Math", "English", "History", "Bio", "Physics", "Chem", "EM"];
  el.innerHTML = `<div class="item-main">
    <div class="grid2">
      <select class="select" data-f="subject">${subjects.map(s => `<option>${s}</option>`).join("")}</select>
      <input type="date" class="select" data-f="due" />
    </div>
    <input type="text" class="select" data-f="task" placeholder="Homework description" />
    <input type="number" class="select" data-f="mins" min="10" step="5" placeholder="Est. minutes" />
    <div class="stage-btns">
      <button class="btn tiny primary" data-act="save">Save</button>
      <button class="btn tiny ghost" data-act="cancel">Cancel</button>
    </div>
  </div>`;
  const f = (n) => el.querySelector(`[data-f="${n}"]`);
  f("subject").value = h.subject || "Math";
  f("due").value = h.due || "";
  f("task").value = h.task || "";
  f("mins").value = h.mins || 45;
  el.querySelector('[data-act="save"]').onclick = () => {
    const task = f("task").value.trim(); if (!task) return;
    updateDoc(doc(db, "homework", h.id), { subject: f("subject").value, task, due: f("due").value || "", mins: parseInt(f("mins").value) || 45 });
  };
  el.querySelector('[data-act="cancel"]').onclick = () => renderHomework();
}
function renderHomework() {
  const list = $("hwList"); list.innerHTML = "";
  const weekStart = mondayOf(new Date());
  const pending = cache.homework.filter(h => h.status !== "done").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const done = cache.homework.filter(h => h.status === "done");
  const doneThisWeek = done.filter(h => h.doneAt && h.doneAt.toDate && h.doneAt.toDate() >= weekStart).sort((a, b) => b.doneAt.toDate() - a.doneAt.toDate());
  const doneEarlier = done.filter(h => !(h.doneAt && h.doneAt.toDate && h.doneAt.toDate() >= weekStart));

  if (!pending.length) {
    const p = document.createElement("p"); p.className = "muted small";
    p.textContent = cache.homework.length ? "No homework to do right now 🎉" : "No homework yet. Add this week's tasks above 👆";
    list.appendChild(p);
  }
  pending.forEach(h => list.appendChild(buildHwEl(h)));

  const head = document.createElement("h3"); head.className = "section-h";
  head.textContent = `✅ Completed this week (${doneThisWeek.length})`;
  list.appendChild(head);
  if (!doneThisWeek.length) {
    const p = document.createElement("p"); p.className = "muted small";
    p.textContent = "Nothing ticked off yet this week — let's change that! 💪";
    list.appendChild(p);
  }
  doneThisWeek.forEach(h => list.appendChild(buildHwEl(h)));

  if (doneEarlier.length) {
    const head2 = document.createElement("h3"); head2.className = "section-h"; head2.textContent = "Earlier completed";
    list.appendChild(head2);
    doneEarlier.forEach(h => list.appendChild(buildHwEl(h)));
  }
}

// ---------- CONTENT: YT Shorts + Songs ----------
$("vidAdd").onclick = async () => {
  const title = $("vidTitle").value.trim();
  if (!title) return;
  await addDoc(collection(db, "videos"), {
    kind: "short", title, skill: $("vidSkill").value.trim(), stage: "idea",
    uploaded: false, addedBy: ME.email, createdAt: serverTimestamp(),
  });
  $("vidTitle").value = ""; $("vidSkill").value = "";
};

function buildShortEl(v) {
  const chk = (on, label) => `<button class="${on ? "on" : ""}">${on ? "☑" : "☐"} ${label}</button>`;
  const created = isCreated(v);
  const el = document.createElement("div");
  el.className = "item" + (created ? " done" : "");
  el.innerHTML = `
    <div class="item-main">
      <div class="item-title">${esc(v.title)}</div>
      ${v.skill ? `<div class="item-sub">🛠️ Skill: ${esc(v.skill)}</div>` : ""}
      <div class="stage-btns" style="margin-top:6px">
        <span data-act="created">${chk(created, "Filmed & edited")}</span>
        <span data-act="uploaded">${chk(v.uploaded, "Uploaded to YouTube")}</span>
      </div>
    </div>
    ${created ? "" : `<button class="del">✕</button>`}`;
  el.querySelector('[data-act="created"] button').onclick = () =>
    updateDoc(doc(db, "videos", v.id), { stage: created ? "idea" : "done", doneAt: created ? null : serverTimestamp() });
  el.querySelector('[data-act="uploaded"] button').onclick = () => updateDoc(doc(db, "videos", v.id), { uploaded: !v.uploaded });
  const del = el.querySelector(".del"); if (del) del.onclick = () => deleteDoc(doc(db, "videos", v.id));
  return el;
}

function buildSongEl(v) {
  const chk = (on, label) => `<button class="${on ? "on" : ""}">${on ? "☑" : "☐"} ${label}</button>`;
  const created = isCreated(v);
  const t = todayStr();
  let pill = created
    ? `<span class="pill" style="background:#13302a;color:var(--accent)">✓ done</span>`
    : (v.by ? (v.by < t ? `<span class="pill over">overdue</span>` : `<span class="pill soon">due ${fmtDate(v.by)}</span>`) : "");
  const el = document.createElement("div");
  el.className = "item" + (created ? " done" : "");
  el.innerHTML = `
    <div class="item-main">
      <div class="item-title">🎵 ${esc(v.title || ("Song " + (v.slot || "")))} ${pill}</div>
      <div class="item-sub muted">Target: ${v.by ? fmtDate(v.by) : "—"}</div>
      <div class="stage-btns" style="margin-top:6px">
        <span data-act="created">${chk(created, "Written & recorded")}</span>
        <span data-act="uploaded">${chk(v.uploaded, "Uploaded to private channel")}</span>
      </div>
      <input class="mininput" data-f="title" placeholder="Song title (optional)" value="${esc(v.title || "")}" style="margin-top:6px" />
    </div>`;
  el.querySelector('[data-act="created"] button').onclick = () =>
    updateDoc(doc(db, "videos", v.id), { stage: created ? "idea" : "done", doneAt: created ? null : serverTimestamp() });
  el.querySelector('[data-act="uploaded"] button').onclick = () => updateDoc(doc(db, "videos", v.id), { uploaded: !v.uploaded });
  const ti = el.querySelector('[data-f="title"]');
  ti.onchange = () => updateDoc(doc(db, "videos", v.id), { title: ti.value.trim() });
  return el;
}

function renderVideos() {
  const mb = $("missionBox");
  if (mb) mb.innerHTML = `“${esc(MISSION)}”<span class="q-by">— Jake</span>`;

  // ----- Shorts -----
  const shorts = shortsAll();
  const shortsDone = shorts.filter(isCreated).length;
  const m1Done = Math.min(shortsDone, SHORTS_M1.n);
  const today = new Date();
  const m1 = new Date(SHORTS_M1.by + "T00:00:00");
  const dl = new Date(SHORTS_DEADLINE + "T00:00:00");
  const m1DaysLeft = Math.ceil((m1 - today) / 864e5);
  const dlDaysLeft = Math.ceil((dl - today) / 864e5);
  const phase2 = SHORTS_GOAL - SHORTS_M1.n;                          // 10 shorts in phase 2
  const m2Done = Math.max(0, Math.min(phase2, shortsDone - SHORTS_M1.n));
  const weeksLeft = Math.max(0, Math.ceil((dl - today) / (7 * 864e5)));
  const remaining = Math.max(0, SHORTS_GOAL - shortsDone);
  const perWk = weeksLeft > 0 ? (remaining / weeksLeft).toFixed(1) : String(remaining);
  const onPace = shortsDone >= shortsExpected();

  const ss = $("shortStats");
  if (ss) ss.innerHTML = `
    <div class="stat"><div class="n">${shortsDone}/${SHORTS_GOAL}</div><div class="l">shorts uploaded</div></div>
    <div class="stat"><div class="n">${m1Done}/${SHORTS_M1.n}</div><div class="l">${m1DaysLeft >= 0 ? `by Aug 31 (${m1DaysLeft}d)` : "by Aug 31"}</div></div>
    <div class="stat"><div class="n">${m2Done}/${phase2}</div><div class="l">${dlDaysLeft >= 0 ? `by Nov 13 (${dlDaysLeft}d)` : "by Nov 13"}</div></div>
    <div class="stat"><div class="n">${remaining}</div><div class="l">to go</div></div>
    <div class="stat"><div class="n">${perWk}</div><div class="l">/week to Nov 13</div></div>`;

  const list = $("shortList");
  const pct = Math.round((shortsDone / SHORTS_GOAL) * 100);
  list.innerHTML = `<div class="card"><div class="progress"><div style="width:${pct}%"></div></div>
    <div class="small muted">${pct}% to 15 shorts by Nov 13 · ${onPace ? "on pace ✅" : "behind pace — let's catch up ⏳"}</div></div>`;

  const inProgress = shorts.filter(v => !isCreated(v));
  const completed = shorts.filter(isCreated)
    .sort((a, b) => ((b.doneAt && b.doneAt.toDate ? b.doneAt.toDate() : 0) - (a.doneAt && a.doneAt.toDate ? a.doneAt.toDate() : 0)));
  if (!shorts.length) list.insertAdjacentHTML("beforeend", `<p class="muted small">No shorts yet. Add your first idea above 👆</p>`);
  [...inProgress].reverse().forEach(v => list.appendChild(buildShortEl(v)));
  if (completed.length) {
    const head = document.createElement("h3"); head.className = "section-h";
    head.textContent = `✅ Shorts uploaded (${completed.length}/${SHORTS_GOAL})`;
    list.appendChild(head);
    completed.forEach(v => list.appendChild(buildShortEl(v)));
  }

  // ----- Songs -----
  const songs = songsAll();
  const songsDone = songs.filter(isCreated).length;
  const ssg = $("songStats");
  if (ssg) ssg.innerHTML = `
    <div class="stat"><div class="n">${songsDone}/2</div><div class="l">songs uploaded</div></div>` +
    songs.map(s => {
      const st = isCreated(s) ? "✓" : (s.by && s.by < todayStr() ? "⚠️" : "…");
      return `<div class="stat"><div class="n">${st}</div><div class="l">Song ${s.slot} · ${fmtDayMonth(s.by)}</div></div>`;
    }).join("");
  const sl = $("songList");
  if (sl) {
    sl.innerHTML = "";
    if (!songs.length) sl.innerHTML = `<p class="muted small">Your two songs will appear here.</p>`;
    songs.forEach(s => sl.appendChild(buildSongEl(s)));
  }
}

// ---------- FOOTBALL: tournaments + fitness ----------
$("tourAdd").onclick = async () => {
  const name = $("tourName").value.trim();
  if (!name) return;
  await addDoc(collection(db, "tournaments"), { name, date: $("tourDate").value || "", location: $("tourLoc").value.trim() });
  $("tourName").value = ""; $("tourLoc").value = "";
};
function renderTournaments() {
  const list = $("tourList"); list.innerHTML = "";
  if (!cache.tournaments.length) { list.innerHTML = `<p class="muted small">No tournaments announced yet. Add them here when SCUFA confirms dates.</p>`; return; }
  [...cache.tournaments].sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach(x => {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `<div class="item-main"><div class="item-title">🏆 ${x.name}</div><div class="item-sub">${x.date || "date TBD"}${x.location ? " · " + x.location : ""}</div></div><button class="del">✕</button>`;
    el.querySelector(".del").onclick = () => deleteDoc(doc(db, "tournaments", x.id));
    list.appendChild(el);
  });
}
// ---------- MISSED TRAINING (footballmissed/{YYYY-MM-DD}) ----------
const MISS_REASONS = ["Sick", "Injury", "Exam / school", "Family", "Other"];
async function logMissed(date, reason, note) {
  await setDoc(doc(db, "footballmissed", date), { date, reason, note: note || "", by: ME.email, at: serverTimestamp() });
}
// Training sessions that actually ran in a date range: Mon/Wed/Fri, not cancelled,
// not a holiday, up to yesterday (today counts once it's been logged as missed).
function trainingDays(from, to) {
  const out = [], d = new Date(from + "T12:00:00"), t = todayStr(); // noon, so ymd() (UTC) gives the same calendar day in IST
  while (ymd(d) <= to) {
    const s = ymd(d);
    if (FOOTBALL_DAYS.includes(d.getDay()) && !cache.footballOff.has(s) && !isHoliday(s) && (s < t || cache.missed.some(m => m.date === s))) out.push(s);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function missedStats() {
  const t = todayStr(), monthStart = t.slice(0, 8) + "01";
  const held = trainingDays(monthStart, t);
  const missedMonth = cache.missed.filter(m => m.date >= monthStart && m.date <= t).length;
  const attended = Math.max(0, held.length - missedMonth);
  return { missedMonth, total: cache.missed.length, held: held.length, attended, pct: held.length ? Math.round(100 * attended / held.length) : null };
}
$("missDate").value = todayStr();
$("missAdd").onclick = async () => {
  const date = $("missDate").value; if (!date) return;
  await logMissed(date, $("missReason").value, $("missNote").value.trim());
  $("missNote").value = "";
};
function renderMissed() {
  const st = missedStats();
  const monthName = new Date().toLocaleDateString("en-GB", { month: "long" });
  $("missStats").innerHTML = `
    <div class="stat"><div class="n" style="${st.missedMonth ? "color:var(--amber)" : ""}">${st.missedMonth}</div><div class="l">missed in ${monthName}</div></div>
    <div class="stat"><div class="n">${st.pct === null ? "–" : st.pct + "%"}</div><div class="l">attendance in ${monthName} (${st.attended}/${st.held})</div></div>
    <div class="stat"><div class="n">${st.total}</div><div class="l">missed in total</div></div>`;
  const list = $("missList"); list.innerHTML = "";
  if (!cache.missed.length) { list.innerHTML = `<p class="muted small">No missed sessions logged. 💪</p>`; return; }
  [...cache.missed].sort((a, b) => b.date.localeCompare(a.date)).forEach(m => {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `<div class="item-main"><div class="item-title">${fmtDate(m.date)}</div><div class="item-sub"><span class="tag">${esc(m.reason)}</span>${m.note ? esc(m.note) + " · " : ""}logged by ${nameFor(m.by)}</div></div><button class="del" title="Remove">✕</button>`;
    el.querySelector(".del").onclick = () => { if (confirm(`Remove the missed session on ${fmtDate(m.date)}?`)) deleteDoc(doc(db, "footballmissed", m.id)); };
    list.appendChild(el);
  });
}
function renderFitness() { renderRoutine("fitness", $("fitList")); }
function renderRoutine(kind, list) {
  if (!list) return;
  list.innerHTML = "";
  const items = cache.routines.filter(r => r.kind === kind);
  if (!items.length) { list.innerHTML = `<p class="muted small">None yet.</p>`; return; }
  const logKey = todayStr();
  items.forEach(r => {
    const log = cache.nicolog[r.id];
    const done = !!log;
    const el = document.createElement("div");
    el.className = "item" + (done ? " done" : "");
    el.innerHTML = `
      <button class="check ${done ? "on" : ""}">${done ? "✓" : ""}</button>
      <div class="item-main"><div class="item-title">${r.title}</div>
      ${done && log.by ? `<div class="item-sub">done by ${nameFor(log.by)}</div>` : ""}</div>
      <button class="del">✕</button>`;
    el.querySelector(".check").onclick = async () => {
      const ref = doc(db, "nicolog", logKey);
      const cur = { ...cache.nicolog };
      if (done) delete cur[r.id]; else cur[r.id] = { by: ME.email };
      await setDoc(ref, cur, { merge: false });
    };
    el.querySelector(".del").onclick = () => deleteDoc(doc(db, "routines", r.id));
    list.appendChild(el);
  });
}

// ---------- FIFA / World Cup (with approval cycle) ----------
$("fxAdd").onclick = async () => {
  const match = $("fxMatch").value.trim(); if (!match) return;
  await addDoc(collection(db, "fixtures"), {
    match, date: $("fxDate").value || "", time: $("fxTime").value.trim(),
    watch: true, watched: false, comp: "", reqStatus: "none", reqNote: "",
  });
  $("fxMatch").value = ""; $("fxTime").value = "";
};

const LEVEL_CLASS = { high: "over", ok: "today", school: "soon", none: "soon", unknown: "today" };

// pending homework due on/before a given date -> {clear, subjects[]}
function hwClearByDate(dateStr) {
  const pend = cache.homework.filter(h => h.status !== "done" && (!h.due || (dateStr && h.due <= dateStr)));
  return { clear: pend.length === 0, subjects: [...new Set(pend.map(h => h.subject))] };
}
const setReq = (f, patch) => updateDoc(doc(db, "fixtures", f.id), patch);
function mkBtn(label, kind) {
  const b = document.createElement("button");
  b.className = "btn tiny " + (kind || "ghost");
  b.textContent = label; b.style.marginRight = "6px"; b.style.marginTop = "6px";
  return b;
}

function renderPending() {
  const box = $("fxPending"); if (!box) return; box.innerHTML = "";
  if (!isMum()) return;
  const pend = cache.fixtures.filter(f => matchAssessment(f.date, f.time).needsApproval && f.reqStatus === "requested");
  if (!pend.length) return;
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div style="font-weight:700;margin-bottom:4px">⏳ ${pend.length} match${pend.length > 1 ? "es" : ""} waiting for your approval</div>
    <div class="muted small">${pend.map(f => esc(f.match)).join(", ")} — approve or decline below.</div>`;
  box.appendChild(card);
}

function buildFixtureEl(f, isPast) {
  const a = matchAssessment(f.date, f.time);
  const status = f.reqStatus || "none";
  const el = document.createElement("div");
  el.className = "item" + (f.watched ? " done" : "");

  let statusHtml;
  if (isPast) statusHtml = f.watched
    ? `<span class="pill" style="background:#13302a;color:var(--accent)">✓ watched</span>`
    : (status === "approved" ? `<span class="pill">was approved · not watched</span>` : `<span class="pill">not watched</span>`);
  else if (a.autoDecline) statusHtml = `<span class="pill over">🚫 auto-declined (school hours)</span>`;
  else if (!a.needsApproval) statusHtml = `<span class="pill soon">auto-OK ✓</span>`;
  else if (status === "approved") statusHtml = `<span class="pill" style="background:#13302a;color:var(--accent)">✓ approved${f.reqNote ? " — " + esc(f.reqNote) : ""}</span>`;
  else if (status === "declined") statusHtml = `<span class="pill over">declined${f.reqNote ? " — " + esc(f.reqNote) : ""}</span>`;
  else if (status === "requested") statusHtml = `<span class="pill today">⏳ not yet approved — awaiting Christabel</span>`;
  else statusHtml = `<span class="pill ${LEVEL_CLASS[a.level] || "today"}">⏳ not yet approved</span>`;

  let recTag = "";
  if (!isPast && a.needsApproval && (status === "none" || status === "requested") && progressCache && progressCache.week) {
    const r = progressCache.week.rec;
    const c = r.level === "approve" ? "var(--accent)" : r.level === "conditional" ? "var(--amber)" : "var(--red)";
    const ic = r.level === "approve" ? "✅" : r.level === "conditional" ? "🟡" : "⛔";
    recTag = ` <span style="color:${c}">· rec: ${ic} ${r.level}</span>`;
  }

  el.innerHTML = `
    <button class="check ${f.watched ? "on" : ""}" title="watched">${f.watched ? "✓" : ""}</button>
    <div class="item-main">
      <div class="item-title">${esc(f.match)}</div>
      <div class="item-sub">${f.comp ? `<span class="tag">${esc(f.comp)}</span>` : ""}${esc(fmtDate(f.date))}${f.time ? " · " + esc(f.time) : ""}</div>
      <div class="item-sub">${statusHtml}${!isPast ? ` <span class="muted">${a.text}</span>` : ""}${recTag}</div>
      <div class="rowbtns"></div>
    </div>
    <button class="star" title="want to watch">${f.watch ? "⭐" : "☆"}</button>`;

  const rb = el.querySelector(".rowbtns");
  if (!isPast && a.needsApproval && status !== "approved") {
    if (isJake() && (status === "none" || status === "declined")) {
      const b = mkBtn(status === "declined" ? "Ask again" : "Request to watch", "primary");
      b.onclick = () => setReq(f, { reqStatus: "requested", reqBy: ME.email, reqNote: "" });
      rb.appendChild(b);
    }
    if (isJake() && status === "requested") {
      const b = mkBtn("↩︎ Take back request", "ghost");
      b.onclick = () => setReq(f, { reqStatus: "none", reqNote: "" });
      rb.appendChild(b);
    }
    if (!isJake()) { // Christabel (or unknown role) can approve/decline
      const rec = progressCache && progressCache.week ? progressCache.week.rec : null;
      const recline = document.createElement("div");
      recline.className = "item-sub";
      if (rec) {
        const col = rec.level === "approve" ? "var(--accent)" : rec.level === "conditional" ? "var(--amber)" : "var(--red)";
        const ic = rec.level === "approve" ? "✅" : rec.level === "conditional" ? "🟡" : "⛔";
        recline.innerHTML = `<span style="color:${col}">${ic} ${esc(rec.text)}</span>`;
      } else {
        recline.innerHTML = `<span class="muted">Weekly check loading…</span>`;
      }
      const note = document.createElement("input");
      note.placeholder = "note / condition (optional)";
      note.className = "mininput";
      note.value = f.reqNote || (rec && rec.level === "conditional" ? rec.note : "");
      const ap = mkBtn("Approve", "primary");
      ap.onclick = () => setReq(f, { reqStatus: "approved", reqNote: note.value.trim(), reqDecidedBy: ME.email });
      const dc = mkBtn("Decline", "ghost");
      dc.onclick = () => setReq(f, { reqStatus: "declined", reqNote: note.value.trim(), reqDecidedBy: ME.email });
      rb.appendChild(recline); rb.appendChild(note); rb.appendChild(ap); rb.appendChild(dc);
    }
  }
  if (!isPast && status === "approved" && !isJake()) {
    const un = mkBtn("Undo approval", "ghost");
    un.onclick = () => setReq(f, { reqStatus: "requested" });
    rb.appendChild(un);
  }

  el.querySelector(".check").onclick = () => updateDoc(doc(db, "fixtures", f.id), { watched: !f.watched });
  el.querySelector(".star").onclick = () => updateDoc(doc(db, "fixtures", f.id), { watch: !f.watch });
  return el;
}

function renderFixtures() {
  renderPending();
  const list = $("fxList"); list.innerHTML = "";
  if (!cache.fixtures.length) { list.innerHTML = `<p class="muted small">No matches yet.</p>`; return; }
  const t = todayStr();
  const upcoming = cache.fixtures.filter(f => !f.date || f.date >= t).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const past = cache.fixtures.filter(f => f.date && f.date < t).sort((a, b) => b.date.localeCompare(a.date));
  upcoming.forEach(f => list.appendChild(buildFixtureEl(f, false)));
  if (past.length) {
    const h = document.createElement("h3");
    h.className = "section-h"; h.textContent = "⏮️ Already played";
    list.appendChild(h);
    past.forEach(f => list.appendChild(buildFixtureEl(f, true)));
  }
}

// ---------- PROGRESS: weekly requirements, recommendation, badges & ladder ----------
const REQ = { fitness: 3, revision: 2 };              // Standard weekly bar (revision = topic-rounds or sessions)
const SEASON = { content: 17, hw: 100, fitness: 120, revision: 30 }; // 15 shorts + 2 songs; revision ≈ 2/wk to end Feb

function hwOnTimeCount() {
  return cache.homework.filter(h => {
    if (h.status !== "done") return false;
    if (!h.due) return true;
    if (!(h.doneAt && h.doneAt.toDate)) return true;
    return ymd(h.doneAt.toDate()) <= h.due;
  }).length;
}
function mondayOf(d) { const x = new Date(d); const k = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - k); return x; }

// ----- badge crest art -----
const BADGE_ART = {
  kickoff: { ring: "#1f9d57", face: "#0c3b24", em: `<circle cx="32" cy="29" r="11" fill="#fff"/><polygon points="32,22 38,27 36,34 28,34 26,27" fill="#0c3b24"/><circle cx="24" cy="25" r="1.6" fill="#0c3b24"/><circle cx="40" cy="25" r="1.6" fill="#0c3b24"/><circle cx="32" cy="38" r="1.6" fill="#0c3b24"/>` },
  inform: { ring: "#ff7a18", face: "#5a1e00", em: `<path d="M32 41 C22 33 27 19 32 15 C37 19 42 33 32 41 Z" fill="#ffd23f"/><path d="M32 38 C26 32 28 23 32 19 C36 24 38 32 32 38 Z" fill="#ff7a18"/>` },
  captain: { ring: "#2f6df0", face: "#0e2350", em: `<rect x="14" y="22" width="36" height="15" rx="4" fill="#ffd23f"/><text x="32" y="33.5" text-anchor="middle" fill="#0e2350" font-size="12" font-weight="500" font-family="var(--font-sans,sans-serif)">C</text>` },
  cleansheet: { ring: "#14b8a6", face: "#06403a", em: `<path d="M21 19 H43 V33 C43 40 32 44 32 44 C32 44 21 40 21 33 Z" fill="#eafff9"/><text x="32" y="35" text-anchor="middle" fill="#06403a" font-size="13" font-weight="500" font-family="var(--font-sans,sans-serif)">0</text>` },
  academy: { ring: "#b87333", face: "#3e2410", em: `<polygon points="22,20 30,20 30,32 44,32 44,40 22,40" fill="#f2d2a0"/>` },
  reserves: { ring: "#8a97a3", face: "#2b333b", em: `<path d="M24 19 L20 23 L23 26 L26 23 L26 41 L38 41 L38 23 L41 26 L44 23 L40 19 L36 22 C33 25 31 25 28 22 Z" fill="#d7dee5"/>` },
  firstteam: { ring: "#c0c7d0", face: "#343b45", em: `<path d="M21 18 H43 V33 C43 40 32 45 32 45 C32 45 21 40 21 33 Z" fill="#eef2f6"/><text x="32" y="35" text-anchor="middle" fill="#343b45" font-size="12" font-weight="500" font-family="var(--font-sans,sans-serif)">11</text>` },
  star: { ring: "#e9b949", face: "#4a3608", em: `<polygon points="32,16 36,27 48,27 38,34 42,46 32,38 22,46 26,34 16,27 28,27" fill="#fff3c4"/>` },
  legend: { ring: "#a06bff", face: "#2a1052", em: `<polygon points="18,40 18,24 26,30 32,16 38,30 46,24 46,40" fill="#ffd23f"/><circle cx="18" cy="22" r="2.2" fill="#ffd23f"/><circle cx="32" cy="13" r="2.2" fill="#ffd23f"/><circle cx="46" cy="22" r="2.2" fill="#ffd23f"/>` },
};
function badgeSVG(key, on) {
  const a = BADGE_ART[key];
  if (!on) return `<svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><circle cx="32" cy="30" r="26" fill="${a.ring}" opacity="0.45"/><circle cx="32" cy="30" r="21" fill="${a.face}" opacity="0.7"/><g opacity="0.55">${a.em}</g><rect x="45" y="49" width="11" height="8.5" rx="1.6" fill="#e7edf2"/><path d="M46.8 49 V46.4 a2.7 2.7 0 0 1 5.4 0 V49" fill="none" stroke="#e7edf2" stroke-width="1.7"/></svg>`;
  return `<svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><circle cx="32" cy="30" r="26" fill="${a.ring}"/><circle cx="32" cy="30" r="21" fill="${a.face}"/>${a.em}</svg>`;
}

function computeWeek(logs, fitIds, weekStart) {
  const overdue = cache.homework.filter(h => h.status !== "done" && h.due && h.due < todayStr()).length;
  const shortsThisWeek = cache.videos.filter(v => v.kind === "short" && v.stage === "done" && v.doneAt && v.doneAt.toDate && v.doneAt.toDate() >= weekStart).length;
  let fitness = 0;
  const revision = revisionCount(ymd(weekStart), todayStr());
  for (const d in logs) {
    if (new Date(d + "T00:00:00") >= weekStart) {
      const log = logs[d] || {};
      fitness += fitIds.filter(id => log[id]).length;
    }
  }
  const pillars = { hw: overdue === 0, short: shortsThisWeek >= 1, fitness: fitness >= REQ.fitness, revision: revision >= REQ.revision };
  const pillarsMet = Object.values(pillars).filter(Boolean).length;
  const rating = Math.round((pillars.hw ? 2.5 : 0) + (pillars.short ? 2.5 : 0) + Math.min(1, fitness / REQ.fitness) * 2.5 + Math.min(1, revision / REQ.revision) * 2.5);
  const missing = [];
  if (!pillars.hw) missing.push(`clear ${overdue} overdue homework`);
  if (!pillars.short) missing.push("upload this week's short");
  if (!pillars.fitness) missing.push(`${REQ.fitness - fitness} more fitness session(s)`);
  if (!pillars.revision) missing.push(`${REQ.revision - revision} more revision round(s)`);
  let rec;
  if (pillarsMet === 4) rec = { level: "approve", text: "Recommend approve — earned it (4/4 weekly requirements met).", note: "" };
  else if (pillarsMet === 3) rec = { level: "conditional", text: `Recommend conditional — 3/4 met. Suggested condition: ${missing[0]}.`, note: `OK once: ${missing[0]}` };
  else rec = { level: "hold", text: `Recommend hold — only ${pillarsMet}/4 met. Missing: ${missing.join("; ")}.`, note: "" };
  return { pillars, pillarsMet, fitness, revision, shortsThisWeek, rating, onTarget: pillarsMet === 4, rec };
}

async function loadProgress() {
  const days = [];
  for (let i = 0; i < 21; i++) days.push(ymd(new Date(Date.now() - i * 864e5)));
  let logs = {};
  try {
    const snaps = await Promise.all(days.map(d => getDoc(doc(db, "nicolog", d))));
    snaps.forEach((s, i) => { if (s.exists()) logs[days[i]] = s.data(); });
  } catch (e) { console.warn("progress load failed", e); }

  const fitIds = cache.routines.filter(r => r.kind === "fitness").map(r => r.id);
  const weekStart = mondayOf(new Date());
  const week = computeWeek(logs, fitIds, weekStart);

  const weekKey = ymd(weekStart);
  try {
    await setDoc(doc(db, "weeklog", weekKey), { weekStart: weekKey, pillarsMet: week.pillarsMet, rating: week.rating, onTarget: week.onTarget, fitness: week.fitness, revision: week.revision, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) { console.warn("weeklog write failed", e); }

  // streak over recent weeks
  const weekKeys = [];
  for (let i = 0; i < 8; i++) weekKeys.push(ymd(new Date(weekStart.getTime() - i * 7 * 864e5)));
  let recentWeeks = [];
  try {
    const ws = await Promise.all(weekKeys.map(k => getDoc(doc(db, "weeklog", k))));
    recentWeeks = ws.map((s, i) => s.exists() ? s.data() : { weekStart: weekKeys[i], onTarget: false, rating: 0 });
  } catch (e) { recentWeeks = [{ ...week, weekStart: weekKey }]; }
  let streak = 0;
  for (let i = 0; i < recentWeeks.length; i++) {
    if (recentWeeks[i].onTarget) streak++;
    else if (i === 0) continue;
    else break;
  }
  const everOnTarget = recentWeeks.some(w => w.onTarget);
  const everCleanSheet = recentWeeks.some(w => (w.rating || 0) >= 10);

  // season totals (sum across all stored weeks) for the blended ladder %
  let seasonFitness = 0, seasonRevision = 0;
  try {
    const all = await getDocs(collection(db, "weeklog"));
    all.forEach(d => { const w = d.data(); seasonFitness += w.fitness || 0; seasonRevision += w.revision || 0; });
  } catch (e) { seasonFitness = week.fitness; seasonRevision = week.revision; }
  const shortsDone = cache.videos.filter(v => v.kind === "short" && v.stage === "done").length;
  const songsDone = cache.videos.filter(v => v.kind === "song" && v.stage === "done").length;
  const contentDone = shortsDone + songsDone;
  const hwOnTime = hwOnTimeCount();
  const fr = (a, b) => Math.min(1, a / b);
  const overallPct = Math.round(((fr(contentDone, SEASON.content) + fr(hwOnTime, SEASON.hw) + fr(seasonFitness, SEASON.fitness) + fr(seasonRevision, SEASON.revision)) / 4) * 100);

  const streakBadges = [
    { key: "kickoff", name: "Kickoff", on: everOnTarget || week.onTarget, meta: "first on-target week" },
    { key: "inform", name: "In Form", on: streak >= 3, meta: `${Math.min(streak, 3)}/3 weeks` },
    { key: "cleansheet", name: "Clean Sheet", on: everCleanSheet || week.rating >= 10, meta: "a 10/10 week" },
    { key: "captain", name: "Captain's Armband", on: streak >= 6, meta: `${Math.min(streak, 6)}/6 weeks` },
  ];
  const tiers = [
    { p: 20, key: "academy", name: "Academy" }, { p: 40, key: "reserves", name: "Reserves" },
    { p: 60, key: "firstteam", name: "First Team" }, { p: 80, key: "star", name: "Star Player" },
    { p: 100, key: "legend", name: "Legend" },
  ];
  const ladder = tiers.map(tr => ({ ...tr, on: overallPct >= tr.p }));
  const ladderTier = ladder.filter(l => l.on).slice(-1)[0];

  progressCache = {
    week, streak, overallPct,
    season: { shortsDone, songsDone, contentDone, hwOnTime, seasonFitness, seasonRevision },
    streakBadges, ladder, ladderTier,
    streakUnlocked: streakBadges.filter(b => b.on).length,
  };
  renderProgress(); renderDashboard(); renderFixtures();
}

function renderProgress() {
  const statsEl = $("progStats"), detailEl = $("progDetail");
  if (!statsEl || !progressCache) return;
  const { week, streak, overallPct, streakBadges, ladder, ladderTier } = progressCache;
  const p = week.pillars;
  statsEl.innerHTML = `
    <div class="stat"><div class="n">${week.rating}/10</div><div class="l">form rating</div></div>
    <div class="stat"><div class="n">${streak}🔥</div><div class="l">week streak</div></div>
    <div class="stat"><div class="n">${week.pillarsMet}/4</div><div class="l">requirements met</div></div>
    <div class="stat"><div class="n">${overallPct}%</div><div class="l">season goals</div></div>`;

  const chip = (ok, label) => `<span class="chip ${ok ? "on" : ""}">${ok ? "✓" : "✗"} ${label}</span>`;
  const cell = (b, sub) => `<div class="bcell ${b.on ? "" : "lock"}" data-desc="${esc(b.name)}: ${esc(BADGE_DESC[b.key])} ${b.on ? "— unlocked ✓" : "— locked 🔒"}" title="${esc(BADGE_DESC[b.key])}">${badgeSVG(b.key, b.on)}<div class="bname">${b.name}</div><div class="bmeta muted small">${sub}</div></div>`;
  const nextTier = ladder.find(l => !l.on);
  let ladderHeadline;
  if (overallPct >= 100) ladderHeadline = "🏆 Legend status: unlocked! 👑";
  else if (overallPct === 0) ladderHeadline = "🪜 Your climb to Legend starts here!";
  else if (nextTier && nextTier.name === "Legend") ladderHeadline = `🪜 Just ${nextTier.p - overallPct}% to go to unlock Legend status! 🚀`;
  else ladderHeadline = `🪜 Just ${nextTier.p - overallPct}% to unlock ${nextTier.name}!`;
  const di = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
  const full4 = week.pillarsMet === 4;
  const reqHeader = (di % 2 === 0)
    ? `🎯 Hit your 4 this week — ${full4 ? "bullseye! 🎯" : week.pillarsMet + "/4 so far"}`
    : `⭐ Win the week — ${full4 ? "flawless! ✨" : week.pillarsMet + "/4 done"}`;

  detailEl.innerHTML = `
    <div class="card"><b>🎮 Your game plan</b>
      <div class="muted small" style="margin-top:4px">Smash all <b>4 weekly targets</b> to push your <b>Form rating</b> toward a perfect 10. Nail every one and the week's <b>on target</b> — stack those weeks to fire up your <b>streak</b> and earn <b>streak badges</b>. Every win also climbs the ladder, from Academy all the way to Legend. Greyed badges? That's what you're playing for next. Let's go! 🚀</div>
    </div>
    <div class="card"><b>${reqHeader}</b>
      <div class="chips" style="margin-top:8px">${chip(p.hw, "homework on time")} ${chip(p.short, "1 short uploaded")} ${chip(p.fitness, `fitness ${week.fitness}/${REQ.fitness}`)} ${chip(p.revision, `revision ${week.revision}/${REQ.revision}`)}</div>
      <div class="muted small" style="margin-top:8px">✓ = done · ✗ = still to do. All four green = this week counts as "on target".</div>
    </div>
    <h3 class="section-h">📖 Revision: 2 full revisions by end of February</h3>
    <div id="progRevision">${revisionProgressHtml()}</div>
    <div id="badgeInfo" class="badge-info">👆 Tap any badge to see how to unlock it.</div>
    <h3 class="section-h">🔥 Win the week, grow your streak, grab a badge! (${progressCache.streakUnlocked}/4)</h3>
    <div class="badgegrid">${streakBadges.map(b => cell(b, b.on ? "unlocked ✓" : b.meta)).join("")}</div>
    <h3 class="section-h">${ladderHeadline}</h3>
    <div class="progress"><div style="width:${overallPct}%"></div></div>
    <div class="badgegrid five">${ladder.map(b => cell(b, b.on ? "reached ✓" : `${b.p}%`)).join("")}</div>`;

  detailEl.querySelectorAll("[data-rvsub]").forEach(b => b.onclick = () => { activateTab("revision"); openRevisionSubject(b.dataset.rvsub); });
  const info = $("badgeInfo");
  detailEl.querySelectorAll(".bcell").forEach(c => c.onclick = () => {
    if (!info) return;
    info.textContent = c.dataset.desc;
    info.classList.remove("flash"); void info.offsetWidth; info.classList.add("flash"); // restart animation
    detailEl.querySelectorAll(".bcell.sel").forEach(x => x.classList.remove("sel"));
    c.classList.add("sel");
  });
}

// ---------- DASHBOARD (one-glance home) ----------
function renderDashboard() {
  const el = $("dashboard"); if (!el) return;
  const t = todayStr();
  const hi = $("dashHi"); if (hi) hi.textContent = MY_NAME ? `Hi ${MY_NAME} 👋` : "Dashboard";

  const pend = cache.homework.filter(h => h.status !== "done");
  const over = pend.filter(h => h.due && effectiveDue(h.due) < t).length;
  const horizon = workingHorizon(2);
  const soon = pend.filter(h => h.due && effectiveDue(h.due) >= t && effectiveDue(h.due) <= horizon);
  const soonSubj = [...new Set(soon.map(h => h.subject))];

  const shortsDone = cache.videos.filter(v => v.kind === "short" && v.stage === "done").length;
  const songsDone = cache.videos.filter(v => v.kind === "song" && v.stage === "done").length;
  const weeksLeft = Math.max(1, Math.ceil((new Date(SHORTS_DEADLINE + "T00:00:00") - new Date()) / (7 * 864e5)));
  const perWk = (Math.max(0, SHORTS_GOAL - shortsDone) / weeksLeft).toFixed(1);

  const nextTour = cache.tournaments.filter(x => x.date && x.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  const fitIds = cache.routines.filter(r => r.kind === "fitness").map(r => r.id);
  const fitDone = fitIds.filter(id => cache.nicolog[id]).length;
  const isFb = FOOTBALL_DAYS.includes(new Date().getDay());
  const fbOff = cache.footballOff.has(t);

  const pendApprovals = cache.fixtures.filter(f => matchAssessment(f.date, f.time).needsApproval && f.reqStatus === "requested").length;
  const upcoming = cache.fixtures.filter(f => f.watch && !f.watched && f.date && f.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const upNext = upcoming.filter(f => f.reqStatus !== "declined" && !matchAssessment(f.date, f.time).autoDecline); // skip declined & school-hours matches

  const pg = progressCache;

  const card = (go, h, big, sm, sub, subCls) =>
    `<div class="dcard" data-go="${go}"><div class="dc-h">${h}</div>
      <div class="dc-big ${sm ? "sm" : ""}">${big}</div>
      <div class="dc-sub ${subCls || ""}">${sub}</div></div>`;

  // ---- brief summary banner ----
  const dayName = DAY_NAMES[new Date().getDay()];
  const parts = [];
  parts.push(pend.length
    ? `${pend.length} homework${over ? ` (${over} overdue)` : soon.length ? ` (${soon.length} due in next 2 school days)` : " (nothing due in next 2 school days)"}`
    : "homework all clear");
  parts.push(`${shortsDone}/15 shorts · ${songsDone}/2 songs`);
  if (isMum() && pendApprovals) parts.push(`${pendApprovals} match${pendApprovals > 1 ? "es" : ""} to approve`);
  else if (upNext[0]) parts.push(`next match: ${esc(upNext[0].match)}`);
  const tone = over ? "bad" : ((soon.length || (pendApprovals && isMum())) ? "warn" : "good");
  const summary = `<div class="dash-summary ${tone}">📋 <b>Jake's ${dayName} snapshot:</b> ${parts.join(" · ")}.${pg ? ` Form ${pg.week.rating}/10 · season ${pg.overallPct}%.` : ""}</div>`;

  let html = summary;
  // Homework — flag anything due within the next 2 school days (do it in advance)
  const hwSub = over ? `${over} overdue${soon.length ? ` · ${soon.length} due soon` : ""}`
    : soon.length ? `${soon.length} due in 2 school days: ${esc(soonSubj.join(", "))}`
      : pend.length ? `${pend.length} pending · nothing due in 2 school days`
        : "all clear ✅";
  html += card("homework", "📚 Homework", pend.length, false, hwSub,
    over ? "bad" : (soon.length ? "warn" : (pend.length ? "" : "good")));
  html += card("videos", "🎬 Content", `${shortsDone}/15`, true, `${perWk}/wk shorts to Nov 13 · ${songsDone}/2 songs`);
  html += card("football", "🏆 Football", `${fitDone}/${fitIds.length}`, true,
    [nextTour ? `Next: ${esc(nextTour.name)} · ${nextTour.date}` : (isFb ? (fbOff ? "training cancelled 🌧️" : "training today ⚽") : "fitness today"),
     missedStats().missedMonth ? `missed ${missedStats().missedMonth} this month` : ""].filter(Boolean).join(" · "));
  {
    const nm = upNext[0];
    let sub = "No matches lined up — star some to watch", fifaCls = "";
    if (nm) {
      const na = matchAssessment(nm.date, nm.time);
      const ready = !na.needsApproval || nm.reqStatus === "approved";
      if (ready) { sub = `Next up: ${esc(nm.match)} — good to watch ✅`; fifaCls = "good"; }
      else { sub = `Next up: ${esc(nm.match)} — approval pending ⏳`; fifaCls = "warn"; }
    }
    html += card("fifa", "🌍 To Watch", upNext.length, false, sub, fifaCls);
  }
  {
    const rp = paceSummary();
    const nt = upcomingTests()[0];
    const nDays = nt ? Math.round((new Date(nt.date + "T00:00:00") - new Date(t + "T00:00:00")) / 864e5) : null;
    const sub = nt && nDays <= 7 ? `${esc(nt.name)} ${nDays === 0 ? "today" : nDays === 1 ? "tomorrow" : `in ${nDays} days`}`
      : rp.behind ? `behind pace by ${rp.behind} · ${rp.perWeek}/wk to Feb` : `on pace · ${rp.perWeek}/wk to Feb`;
    html += card("revision", "📖 Revision", `${rp.done}/${rp.total}`, true, sub, (nt && nDays <= 2) || rp.behind ? "warn" : "good");
  }
  html += card("today", "📅 Today's plan", DAY_NAMES[new Date().getDay()].slice(0, 3), true, "tap for your schedule");

  if (pg) {
    const nextName = (pg.ladder.find(l => !l.on) || {}).name || "Legend";
    let h2;
    if (pg.overallPct >= 100) h2 = "👑 LEGEND unlocked! You climbed the whole ladder — take a bow, GOAT! 🐐";
    else if (pg.streak >= 1) {
      const opts = [
        `🔥 ${pg.streak}-week streak! Keep rolling to unlock your ${nextName} badge!`,
        `🔥 ${pg.streak} weeks on target — next stop: your ${nextName} badge!`,
        `On fire, ${pg.streak}-week streak! One more win toward ${nextName}! 🔥`,
      ];
      const di = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
      h2 = opts[di % 3];
    } else if (pg.overallPct > 0) {
      h2 = `Back on it! Win this week to unlock your ${nextName} badge! 💪`;
    } else {
      h2 = `Kickoff your streak and unlock your ${nextName} badge! 🚀`;
    }
    html += `<div class="dash-h2">${esc(h2)}</div>`;

    const chips = pg.streakBadges.map(b => `<span class="chip ${b.on ? "on" : ""}" title="${esc(BADGE_DESC[b.key])} ${b.on ? "— unlocked ✓" : "— locked"}">${b.name}</span>`).join("");
    const tierName = pg.ladderTier ? pg.ladderTier.name : "Academy (locked)";
    html += `<div class="dcard wide" data-go="progress"><div class="dc-h">🏅 Form ${pg.week.rating}/10 · ${pg.streak}-week streak 🔥 · ${pg.streakUnlocked}/4 badges · ${pg.overallPct}% season (${tierName})</div><div class="chips">${chips}</div></div>`;
  } else {
    html += `<div class="dcard wide" data-go="progress"><div class="dc-h">🏅 Badges & progress</div><div class="dc-sub">tap to view form, streaks & ladder</div></div>`;
  }

  el.innerHTML = html;
  el.querySelectorAll(".dcard").forEach(c => (c.onclick = () => activateTab(c.dataset.go)));
}
