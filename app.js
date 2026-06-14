// =============================================================
//  app.js — Firebase wiring + UI for Jake's Game Plan
// =============================================================
import { firebaseConfig, PEOPLE } from "./firebase-config.js";
import { buildDayPlan, matchAssessment, FOOTBALL_DAYS } from "./planner.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
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
const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

let ME = null;
let MY_NAME = "";
let progressCache = null; // {points, nicoStreak, fitnessStreak, badges[], unlocked}
const MUM_EMAIL = "christabelsingh@gmail.com";
const JAKE_EMAIL = "jakesamuel2011@gmail.com";
const isMum = () => !!ME && ME.email === MUM_EMAIL;   // Christabel
const isJake = () => !!ME && ME.email === JAKE_EMAIL;
const cache = { homework: [], videos: [], fixtures: [], tournaments: [], routines: [], nicolog: {}, momtasks: [], footballOff: new Set() };

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
function quoteOfDay() { const s = new Date(new Date().getFullYear(), 0, 0); const day = Math.floor((new Date() - s) / 864e5); return QUOTES[day % QUOTES.length]; }

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
    subscribeAll();
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
$("signupBtn").onclick = async () => {
  try {
    await createUserWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
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

  await setDoc(metaRef, { at: serverTimestamp(), videoGoal: 29, byNov14: 23 });
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

// ---------- LIVE SUBSCRIPTIONS ----------
function subscribeAll() {
  onSnapshot(query(collection(db, "homework")), s => { cache.homework = rows(s); renderHomework(); renderToday(); renderDashboard(); });
  onSnapshot(query(collection(db, "videos")), s => { cache.videos = rows(s); renderVideos(); renderDashboard(); });
  onSnapshot(query(collection(db, "fixtures")), s => { cache.fixtures = rows(s); renderFixtures(); renderDashboard(); });
  onSnapshot(query(collection(db, "tournaments")), s => { cache.tournaments = rows(s); renderTournaments(); renderToday(); renderDashboard(); });
  onSnapshot(query(collection(db, "routines")), s => { cache.routines = rows(s); renderFitness(); renderNico(); renderDashboard(); });
  onSnapshot(doc(db, "nicolog", todayStr()), s => { cache.nicolog = s.exists() ? s.data() : {}; renderFitness(); renderNico(); renderDashboard(); });
  onSnapshot(query(collection(db, "momtasks")), s => { cache.momtasks = rows(s); renderMom(); renderDashboard(); });
  onSnapshot(query(collection(db, "footballoff")), s => { cache.footballOff = new Set(s.docs.map(d => d.id)); renderToday(); renderDashboard(); });
  loadProgress(); // compute points/streaks/badges for the dashboard
}
const rows = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

// ---------- TODAY / PLAN ----------
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
(function fillDaySelect() {
  const sel = $("planDay");
  const today = new Date().getDay();
  for (let i = 0; i < 7; i++) {
    const d = (today + i) % 7;
    const o = document.createElement("option");
    o.value = d;
    o.textContent = i === 0 ? `Today (${DAY_NAMES[d]})` : DAY_NAMES[d];
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

function renderToday() {
  const day = parseInt($("planDay").value);
  $("todayTitle").textContent = DAY_NAMES[day] + " plan";

  const selDate = dateForDay(day);
  const isFootballDay = FOOTBALL_DAYS.includes(day);
  const noFootball = cache.footballOff.has(selDate);

  // Due alerts
  const alerts = $("dueAlerts"); alerts.innerHTML = "";
  const t = todayStr();
  const over = pendingHw().filter(h => h.due && h.due < t);
  const due = pendingHw().filter(h => h.due === t);
  if (over.length) addAlert(alerts, "red", `⚠️ ${over.length} overdue: ${over.map(h => h.subject).join(", ")}`);
  if (due.length) addAlert(alerts, "amber", `📌 Due today: ${due.map(h => h.subject).join(", ")}`);
  const tour = cache.tournaments.filter(x => x.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (tour) addAlert(alerts, "green", `🏆 Next tournament: ${tour.name} on ${tour.date}${tour.location ? " · " + tour.location : ""}`);
  if (!over.length && !due.length) addAlert(alerts, "green", "✅ Nothing overdue — nice work!");

  // Football-cancelled toggle (only on training days: Mon/Wed/Fri)
  if (isFootballDay) {
    const toggle = document.createElement("div");
    toggle.className = "alert " + (noFootball ? "amber" : "green");
    toggle.style.display = "flex";
    toggle.style.justifyContent = "space-between";
    toggle.style.alignItems = "center";
    toggle.innerHTML = `<span>${noFootball ? "🌧️ Training cancelled — extra study time" : "⚽ Training on (5–6:30pm)"}</span>`;
    const btn = document.createElement("button");
    btn.className = "btn tiny " + (noFootball ? "primary" : "ghost");
    btn.textContent = noFootball ? "Training is back on" : "Mark cancelled (rain)";
    btn.onclick = () => setFootballOff(selDate, !noFootball);
    toggle.appendChild(btn);
    alerts.appendChild(toggle);
  }

  // Timeline — open with a quote from a legend
  const tl = $("timeline");
  const [qt, qa] = quoteOfDay();
  const quoteHTML = `<div class="quote">“${esc(qt)}”<span class="q-by">— ${esc(qa)}</span></div>`;
  tl.innerHTML = quoteHTML;
  const plan = buildDayPlan(day, pendingHw().map(h => ({ subject: h.subject, task: h.task, mins: h.mins, due: h.due })), { noFootball });
  if (plan.rest) {
    tl.innerHTML = quoteHTML + `<div class="block rest"><div class="t">All day</div><div class="b">${plan.note}</div></div>`;
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
function renderHomework() {
  const list = $("hwList"); list.innerHTML = "";
  const items = [...cache.homework].sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
    return (a.due || "9999").localeCompare(b.due || "9999");
  });
  if (!items.length) { list.innerHTML = `<p class="muted small">No homework yet. Add this week's tasks above 👆</p>`; return; }
  const t = todayStr();
  items.forEach(h => {
    const done = h.status === "done";
    let pill = "";
    if (!done && h.due) {
      if (h.due < t) pill = `<span class="pill over">overdue</span>`;
      else if (h.due === t) pill = `<span class="pill today">due today</span>`;
      else pill = `<span class="pill soon">${h.due}</span>`;
    }
    const el = document.createElement("div");
    el.className = "item" + (done ? " done" : "");
    el.innerHTML = `
      <button class="check ${done ? "on" : ""}">${done ? "✓" : ""}</button>
      <div class="item-main">
        <div class="item-title"><span class="tag subj">${h.subject}</span>${h.task}</div>
        <div class="item-sub">${pill} ${h.mins || 45} min ${done && h.doneBy ? "· done by " + nameFor(h.doneBy) : ""}</div>
      </div>
      <button class="del">✕</button>`;
    el.querySelector(".check").onclick = () => updateDoc(doc(db, "homework", h.id), {
      status: done ? "todo" : "done", doneBy: done ? "" : ME.email, doneAt: done ? null : serverTimestamp(),
    });
    el.querySelector(".del").onclick = () => deleteDoc(doc(db, "homework", h.id));
    list.appendChild(el);
  });
}

// ---------- VIDEOS ----------
const STAGES = ["idea", "filming", "editing", "done"];
$("vidAdd").onclick = async () => {
  const title = $("vidTitle").value.trim();
  if (!title) return;
  await addDoc(collection(db, "videos"), {
    title, skill: $("vidSkill").value.trim(), stage: "idea",
    youtube: false, next: false, wins: false, addedBy: ME.email, createdAt: serverTimestamp(),
  });
  $("vidTitle").value = ""; $("vidSkill").value = "";
};
function renderVideos() {
  const done = cache.videos.filter(v => v.stage === "done").length;
  const goal = 29, byNov14 = 23;
  const today = new Date();
  const deadline = new Date("2026-12-31");
  const weeksLeft = Math.max(1, Math.ceil((deadline - today) / (7 * 864e5)));
  const remaining = Math.max(0, goal - done);
  $("videoStats").innerHTML = `
    <div class="stat"><div class="n">${done}/${goal}</div><div class="l">videos done</div></div>
    <div class="stat"><div class="n">${remaining}</div><div class="l">to go</div></div>
    <div class="stat"><div class="n">${(remaining / weeksLeft).toFixed(1)}</div><div class="l">/week needed</div></div>
    <div class="stat"><div class="n">${byNov14}</div><div class="l">by Nov 14 (concert)</div></div>`;
  const pct = Math.round((done / goal) * 100);
  $("videoStats").insertAdjacentHTML("afterend", "");
  const list = $("vidList"); list.innerHTML =
    `<div class="card"><div class="progress"><div style="width:${pct}%"></div></div><div class="small muted">${pct}% to the GNR concert 🎸 — upload weekly to NEXT + YouTube, log in NEXT wins doc.</div></div>`;
  if (!cache.videos.length) { list.insertAdjacentHTML("beforeend", `<p class="muted small">No videos yet. Add your first idea above 👆</p>`); return; }
  [...cache.videos].reverse().forEach(v => {
    const el = document.createElement("div");
    el.className = "item" + (v.stage === "done" ? " done" : "");
    const stageBtns = STAGES.map(s => `<button data-s="${s}" class="${v.stage === s ? "on" : ""}">${s}</button>`).join("");
    el.innerHTML = `
      <div class="item-main">
        <div class="item-title">${v.title}</div>
        ${v.skill ? `<div class="item-sub">🛠️ Skill: ${v.skill}</div>` : ""}
        <div class="stage-btns">${stageBtns}</div>
        <div class="stage-btns" style="margin-top:6px">
          <button data-c="youtube" class="${v.youtube ? "on" : ""}">▶ YouTube</button>
          <button data-c="next" class="${v.next ? "on" : ""}">📱 NEXT</button>
          <button data-c="wins" class="${v.wins ? "on" : ""}">🏅 Wins doc</button>
        </div>
      </div>
      <button class="del">✕</button>`;
    el.querySelectorAll("[data-s]").forEach(b => b.onclick = () => updateDoc(doc(db, "videos", v.id), { stage: b.dataset.s, doneAt: b.dataset.s === "done" ? serverTimestamp() : null }));
    el.querySelectorAll("[data-c]").forEach(b => b.onclick = () => updateDoc(doc(db, "videos", v.id), { [b.dataset.c]: !v[b.dataset.c] }));
    el.querySelector(".del").onclick = () => deleteDoc(doc(db, "videos", v.id));
    list.appendChild(el);
  });
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
function renderFitness() { renderRoutine("fitness", $("fitList")); }
function renderNico() { renderRoutine("nico", $("nicoList")); }
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
$("nicoAdd").onclick = async () => {
  const t = $("nicoTask").value.trim(); if (!t) return;
  await addDoc(collection(db, "routines"), { title: t, kind: "nico" });
  $("nicoTask").value = "";
};

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

function renderFixtures() {
  renderPending();
  const list = $("fxList"); list.innerHTML = "";
  if (!cache.fixtures.length) { list.innerHTML = `<p class="muted small">No matches yet.</p>`; return; }
  [...cache.fixtures].sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach(f => {
    const a = matchAssessment(f.date, f.time);
    const status = f.reqStatus || "none";
    const el = document.createElement("div");
    el.className = "item" + (f.watched ? " done" : "");

    let statusHtml;
    if (!a.needsApproval) statusHtml = `<span class="pill soon">auto-OK ✓</span>`;
    else if (status === "approved") statusHtml = `<span class="pill" style="background:#13302a;color:var(--accent)">✓ approved${f.reqNote ? " — " + esc(f.reqNote) : ""}</span>`;
    else if (status === "declined") statusHtml = `<span class="pill over">declined${f.reqNote ? " — " + esc(f.reqNote) : ""}</span>`;
    else if (status === "requested") statusHtml = `<span class="pill today">⏳ not yet approved — awaiting Christabel</span>`;
    else statusHtml = `<span class="pill ${LEVEL_CLASS[a.level] || "today"}">⏳ not yet approved</span>`;

    // recommendation tag (visible to both) while a decision is pending
    let recTag = "";
    if (a.needsApproval && (status === "none" || status === "requested") && progressCache && progressCache.week) {
      const r = progressCache.week.rec;
      const c = r.level === "approve" ? "var(--accent)" : r.level === "conditional" ? "var(--amber)" : "var(--red)";
      const ic = r.level === "approve" ? "✅" : r.level === "conditional" ? "🟡" : "⛔";
      recTag = ` <span style="color:${c}">· rec: ${ic} ${r.level}</span>`;
    }

    el.innerHTML = `
      <button class="check ${f.watched ? "on" : ""}" title="watched">${f.watched ? "✓" : ""}</button>
      <div class="item-main">
        <div class="item-title">${esc(f.match)}</div>
        <div class="item-sub">${f.comp ? `<span class="tag">${esc(f.comp)}</span>` : ""}${esc(f.date || "")}${f.time ? " · " + esc(f.time) : ""}</div>
        <div class="item-sub">${statusHtml} <span class="muted">${a.text}</span>${recTag}</div>
        <div class="rowbtns"></div>
      </div>
      <button class="star" title="want to watch">${f.watch ? "⭐" : "☆"}</button>
      <button class="del">✕</button>`;

    const rb = el.querySelector(".rowbtns");
    if (a.needsApproval && status !== "approved") {
      if (isJake() && (status === "none" || status === "declined")) {
        const b = mkBtn(status === "declined" ? "Ask again" : "Request to watch", "primary");
        b.onclick = () => setReq(f, { reqStatus: "requested", reqBy: ME.email, reqNote: "" });
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
    if (status === "approved" && !isJake()) {
      const un = mkBtn("Undo approval", "ghost");
      un.onclick = () => setReq(f, { reqStatus: "requested" });
      rb.appendChild(un);
    }

    el.querySelector(".check").onclick = () => updateDoc(doc(db, "fixtures", f.id), { watched: !f.watched });
    el.querySelector(".star").onclick = () => updateDoc(doc(db, "fixtures", f.id), { watch: !f.watch });
    el.querySelector(".del").onclick = () => deleteDoc(doc(db, "fixtures", f.id));
    list.appendChild(el);
  });
}

// ---------- FROM MUM ----------
$("momAdd").onclick = async () => {
  const text = $("momText").value.trim(); if (!text) return;
  await addDoc(collection(db, "momtasks"), {
    text, due: $("momDue").value || "", done: false,
    by: ME.email, createdAt: serverTimestamp(),
  });
  $("momText").value = ""; $("momDue").value = "";
};
function renderMom() {
  const list = $("momList"); if (!list) return; list.innerHTML = "";
  if (!cache.momtasks.length) { list.innerHTML = `<p class="muted small">Nothing from Christabel yet.</p>`; return; }
  const t = todayStr();
  [...cache.momtasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.due || "9999").localeCompare(b.due || "9999");
  }).forEach(m => {
    let pill = "";
    if (!m.done && m.due) pill = m.due < t ? `<span class="pill over">overdue</span>` : m.due === t ? `<span class="pill today">today</span>` : `<span class="pill soon">${m.due}</span>`;
    const el = document.createElement("div");
    el.className = "item" + (m.done ? " done" : "");
    el.innerHTML = `
      <button class="check ${m.done ? "on" : ""}">${m.done ? "✓" : ""}</button>
      <div class="item-main">
        <div class="item-title">${esc(m.text)}</div>
        <div class="item-sub">${pill} from ${nameFor(m.by)}${m.done && m.doneBy ? " · done by " + nameFor(m.doneBy) : ""}</div>
      </div>
      <button class="del">✕</button>`;
    el.querySelector(".check").onclick = () => updateDoc(doc(db, "momtasks", m.id), {
      done: !m.done, doneBy: m.done ? "" : ME.email, doneAt: m.done ? null : serverTimestamp(),
    });
    el.querySelector(".del").onclick = () => deleteDoc(doc(db, "momtasks", m.id));
    list.appendChild(el);
  });
}

// ---------- PROGRESS: weekly requirements, recommendation, badges & ladder ----------
const REQ = { fitness: 3, nicoDays: 5 };               // Standard weekly bar
const SEASON = { videos: 29, hw: 100, fitness: 120, nico: 120 }; // season targets for blended %

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
  if (!on) return `<svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><circle cx="32" cy="30" r="26" fill="#454c56"/><circle cx="32" cy="30" r="21" fill="#2a2f37"/><path d="M26 30 V26.5 a6 6 0 0 1 12 0 V30" fill="none" stroke="#828b95" stroke-width="2.6"/><rect x="24" y="30" width="16" height="12" rx="2.5" fill="#828b95"/></svg>`;
  return `<svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><circle cx="32" cy="30" r="26" fill="${a.ring}"/><circle cx="32" cy="30" r="21" fill="${a.face}"/>${a.em}</svg>`;
}

function computeWeek(logs, nicoIds, fitIds, weekStart) {
  const overdue = cache.homework.filter(h => h.status !== "done" && h.due && h.due < todayStr()).length;
  const videoCount = cache.videos.filter(v => v.stage === "done" && v.doneAt && v.doneAt.toDate && v.doneAt.toDate() >= weekStart).length;
  let fitness = 0, nicoDays = 0;
  for (const d in logs) {
    if (new Date(d + "T00:00:00") >= weekStart) {
      const log = logs[d] || {};
      fitness += fitIds.filter(id => log[id]).length;
      if (nicoIds.length && nicoIds.every(id => log[id])) nicoDays++;
    }
  }
  const pillars = { hw: overdue === 0, video: videoCount >= 1, fitness: fitness >= REQ.fitness, nico: nicoDays >= REQ.nicoDays };
  const pillarsMet = Object.values(pillars).filter(Boolean).length;
  const rating = Math.round((pillars.hw ? 2.5 : 0) + (pillars.video ? 2.5 : 0) + Math.min(1, fitness / REQ.fitness) * 2.5 + Math.min(1, nicoDays / REQ.nicoDays) * 2.5);
  const missing = [];
  if (!pillars.hw) missing.push(`clear ${overdue} overdue homework`);
  if (!pillars.video) missing.push("upload this week's video");
  if (!pillars.fitness) missing.push(`${REQ.fitness - fitness} more fitness session(s)`);
  if (!pillars.nico) missing.push(`Nico duties to ${REQ.nicoDays}/7 (now ${nicoDays})`);
  let rec;
  if (pillarsMet === 4) rec = { level: "approve", text: "Recommend approve — earned it (4/4 weekly requirements met).", note: "" };
  else if (pillarsMet === 3) rec = { level: "conditional", text: `Recommend conditional — 3/4 met. Suggested condition: ${missing[0]}.`, note: `OK once: ${missing[0]}` };
  else rec = { level: "hold", text: `Recommend hold — only ${pillarsMet}/4 met. Missing: ${missing.join("; ")}.`, note: "" };
  return { pillars, pillarsMet, fitness, nicoDays, videoCount, rating, onTarget: pillarsMet === 4, rec };
}

async function loadProgress() {
  const days = [];
  for (let i = 0; i < 21; i++) days.push(ymd(new Date(Date.now() - i * 864e5)));
  let logs = {};
  try {
    const snaps = await Promise.all(days.map(d => getDoc(doc(db, "nicolog", d))));
    snaps.forEach((s, i) => { if (s.exists()) logs[days[i]] = s.data(); });
  } catch (e) { console.warn("progress load failed", e); }

  const nicoIds = cache.routines.filter(r => r.kind === "nico").map(r => r.id);
  const fitIds = cache.routines.filter(r => r.kind === "fitness").map(r => r.id);
  const weekStart = mondayOf(new Date());
  const week = computeWeek(logs, nicoIds, fitIds, weekStart);

  const weekKey = ymd(weekStart);
  try {
    await setDoc(doc(db, "weeklog", weekKey), { weekStart: weekKey, pillarsMet: week.pillarsMet, rating: week.rating, onTarget: week.onTarget, fitness: week.fitness, nicoDays: week.nicoDays, updatedAt: serverTimestamp() }, { merge: true });
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
  let seasonFitness = 0, seasonNico = 0;
  try {
    const all = await getDocs(collection(db, "weeklog"));
    all.forEach(d => { const w = d.data(); seasonFitness += w.fitness || 0; seasonNico += w.nicoDays || 0; });
  } catch (e) { seasonFitness = week.fitness; seasonNico = week.nicoDays; }
  const videosDone = cache.videos.filter(v => v.stage === "done").length;
  const hwOnTime = hwOnTimeCount();
  const fr = (a, b) => Math.min(1, a / b);
  const overallPct = Math.round(((fr(videosDone, SEASON.videos) + fr(hwOnTime, SEASON.hw) + fr(seasonFitness, SEASON.fitness) + fr(seasonNico, SEASON.nico)) / 4) * 100);

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
    season: { videosDone, hwOnTime, seasonFitness, seasonNico },
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
    <div class="stat"><div class="n">${week.rating}/10</div><div class="l">this week's form</div></div>
    <div class="stat"><div class="n">${streak}🔥</div><div class="l">week streak</div></div>
    <div class="stat"><div class="n">${week.pillarsMet}/4</div><div class="l">requirements</div></div>
    <div class="stat"><div class="n">${overallPct}%</div><div class="l">season goals</div></div>`;

  const chip = (ok, label) => `<span class="chip ${ok ? "on" : ""}">${ok ? "✓" : "✗"} ${label}</span>`;
  const cell = (b, sub) => `<div class="bcell ${b.on ? "" : "lock"}" title="${esc(BADGE_DESC[b.key])} ${b.on ? "— unlocked ✓" : "— locked"}">${badgeSVG(b.key, b.on)}<div class="bname">${b.name}</div><div class="bmeta muted small">${sub}</div></div>`;

  detailEl.innerHTML = `
    <div class="card"><b>This week's requirements</b>
      <div class="chips" style="margin-top:8px">${chip(p.hw, "HW on time")} ${chip(p.video, "1 video")} ${chip(p.fitness, `fitness ${week.fitness}/${REQ.fitness}`)} ${chip(p.nico, `Nico ${week.nicoDays}/${REQ.nicoDays}d`)}</div>
      <div class="muted small" style="margin-top:8px">Meet all four to keep your week "on target" — that's what builds streaks and unlocks matches.</div>
    </div>
    <h3 class="section-h">Streak badges (${progressCache.streakUnlocked}/4)</h3>
    <div class="badgegrid">${streakBadges.map(b => cell(b, b.on ? "unlocked ✓" : b.meta)).join("")}</div>
    <h3 class="section-h">Career ladder — ${overallPct}% of season goals${ladderTier ? ` · ${ladderTier.name}` : ""}</h3>
    <div class="progress"><div style="width:${overallPct}%"></div></div>
    <div class="badgegrid five">${ladder.map(b => cell(b, `${b.p}%`)).join("")}</div>`;
}

// ---------- DASHBOARD (one-glance home) ----------
function renderDashboard() {
  const el = $("dashboard"); if (!el) return;
  const t = todayStr();
  const hi = $("dashHi"); if (hi) hi.textContent = MY_NAME ? `Hi ${MY_NAME} 👋` : "Dashboard";

  const pend = cache.homework.filter(h => h.status !== "done");
  const over = pend.filter(h => h.due && h.due < t).length;
  const dueToday = pend.filter(h => h.due === t).length;
  const horizon = workingHorizon(2);
  const soon = pend.filter(h => h.due && h.due >= t && h.due <= horizon);
  const soonSubj = [...new Set(soon.map(h => h.subject))];

  const vDone = cache.videos.filter(v => v.stage === "done").length;
  const weeksLeft = Math.max(1, Math.ceil((new Date("2026-12-31") - new Date()) / (7 * 864e5)));
  const perWk = (Math.max(0, 29 - vDone) / weeksLeft).toFixed(1);

  const nextTour = cache.tournaments.filter(x => x.date && x.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  const fitIds = cache.routines.filter(r => r.kind === "fitness").map(r => r.id);
  const fitDone = fitIds.filter(id => cache.nicolog[id]).length;
  const isFb = FOOTBALL_DAYS.includes(new Date().getDay());
  const fbOff = cache.footballOff.has(t);

  const pendApprovals = cache.fixtures.filter(f => matchAssessment(f.date, f.time).needsApproval && f.reqStatus === "requested").length;
  const upcoming = cache.fixtures.filter(f => f.watch && !f.watched && f.date && f.date >= t).sort((a, b) => a.date.localeCompare(b.date));

  const nicoIds = cache.routines.filter(r => r.kind === "nico").map(r => r.id);
  const nicoDone = nicoIds.filter(id => cache.nicolog[id]).length;
  const momOpen = cache.momtasks.filter(m => !m.done).length;
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
  parts.push(`${vDone}/29 videos`);
  parts.push(`Nico ${nicoDone}/${nicoIds.length}`);
  if (isMum() && pendApprovals) parts.push(`${pendApprovals} match${pendApprovals > 1 ? "es" : ""} to approve`);
  else if (upcoming[0]) parts.push(`next match: ${esc(upcoming[0].match)}`);
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
  html += card("videos", "🎬 GNR Videos", `${vDone}/29`, true, `${perWk}/wk to hit Dec 31`);
  html += card("football", "🏆 Football", `${fitDone}/${fitIds.length}`, true,
    nextTour ? `Next: ${esc(nextTour.name)} · ${nextTour.date}` : (isFb ? (fbOff ? "training cancelled 🌧️" : "training today ⚽") : "fitness today"));
  if (isMum() && pendApprovals)
    html += card("fifa", "🌍 World Cup", pendApprovals, false, "awaiting your approval ⏳", "warn");
  else {
    const nm = upcoming[0];
    let sub = "no matches starred";
    if (nm) {
      const na = matchAssessment(nm.date, nm.time);
      const state = !na.needsApproval ? "auto-OK ✓"
        : nm.reqStatus === "approved" ? "approved ✓"
          : nm.reqStatus === "declined" ? "declined"
            : nm.reqStatus === "requested" ? "awaiting approval ⏳"
              : "not yet approved";
      sub = `Next: ${esc(nm.match)} — ${state}`;
    }
    html += card("fifa", "🌍 World Cup", upcoming.length, false, sub);
  }
  html += card("nico", "🐶 Nico", `${nicoDone}/${nicoIds.length}`, true,
    (nicoIds.length && nicoDone === nicoIds.length) ? "all done today ✅" : "duties today",
    (nicoIds.length && nicoDone === nicoIds.length) ? "good" : "");
  html += card("mum", "👩 From Christabel", momOpen, false, momOpen ? "open task(s)" : "all done ✅", momOpen ? "warn" : "good");
  html += card("today", "📅 Today's plan", DAY_NAMES[new Date().getDay()].slice(0, 3), true, "tap for your schedule");

  if (pg) {
    const chips = pg.streakBadges.map(b => `<span class="chip ${b.on ? "on" : ""}" title="${esc(BADGE_DESC[b.key])} ${b.on ? "— unlocked ✓" : "— locked"}">${b.name}</span>`).join("");
    const tierName = pg.ladderTier ? pg.ladderTier.name : "Academy (locked)";
    html += `<div class="dcard wide" data-go="progress"><div class="dc-h">🏆 Form ${pg.week.rating}/10 · ${pg.streak}-week streak 🔥 · ${pg.streakUnlocked}/4 badges · ${pg.overallPct}% season (${tierName})</div><div class="chips">${chips}</div></div>`;
  } else {
    html += `<div class="dcard wide" data-go="progress"><div class="dc-h">🏆 Badges & progress</div><div class="dc-sub">tap to view form, streaks & ladder</div></div>`;
  }

  el.innerHTML = html;
  el.querySelectorAll(".dcard").forEach(c => (c.onclick = () => activateTab(c.dataset.go)));
}
const ymd = (d) => d.toISOString().slice(0, 10);
