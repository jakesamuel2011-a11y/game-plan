// =============================================================
//  app.js — Firebase wiring + UI for Jake's Game Plan
// =============================================================
import { firebaseConfig, PEOPLE } from "./firebase-config.js";
import { buildDayPlan } from "./planner.js";

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

let ME = null;
const cache = { homework: [], videos: [], fixtures: [], tournaments: [], routines: [], nicolog: {} };

// ---------- AUTH ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    ME = user;
    $("loginScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("whoami").textContent = nameFor(user.email);
    await ensureSeed();
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
document.querySelectorAll(".tab").forEach(t => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $("tab-" + t.dataset.tab).classList.add("active");
  };
});

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

  // Argentina group-stage fixtures (IST = US time + 10.5h). World Cup 2026.
  const fixtures = [
    { match: "Argentina vs Algeria", date: "2026-06-17", time: "8:30am IST", watch: true, watched: false, comp: "Group J" },
    { match: "Argentina vs Austria", date: "2026-06-23", time: "12:30am IST", watch: true, watched: false, comp: "Group J" },
    { match: "Argentina vs Jordan", date: "2026-06-28", time: "9:30am IST", watch: true, watched: false, comp: "Group J" },
  ];
  for (const fx of fixtures) await addDoc(collection(db, "fixtures"), fx);

  await setDoc(metaRef, { at: serverTimestamp(), videoGoal: 29, byNov14: 23 });
}

// ---------- LIVE SUBSCRIPTIONS ----------
function subscribeAll() {
  onSnapshot(query(collection(db, "homework")), s => { cache.homework = rows(s); renderHomework(); renderToday(); });
  onSnapshot(query(collection(db, "videos")), s => { cache.videos = rows(s); renderVideos(); });
  onSnapshot(query(collection(db, "fixtures")), s => { cache.fixtures = rows(s); renderFixtures(); });
  onSnapshot(query(collection(db, "tournaments")), s => { cache.tournaments = rows(s); renderTournaments(); renderToday(); });
  onSnapshot(query(collection(db, "routines")), s => { cache.routines = rows(s); renderFitness(); renderNico(); });
  onSnapshot(doc(db, "nicolog", todayStr()), s => { cache.nicolog = s.exists() ? s.data() : {}; renderFitness(); renderNico(); });
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

function renderToday() {
  const day = parseInt($("planDay").value);
  $("todayTitle").textContent = DAY_NAMES[day] + " plan";

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

  // Timeline
  const tl = $("timeline"); tl.innerHTML = "";
  const plan = buildDayPlan(day, pendingHw().map(h => ({ subject: h.subject, task: h.task, mins: h.mins, due: h.due })));
  if (plan.rest) {
    tl.innerHTML = `<div class="block rest"><div class="t">All day</div><div class="b">${plan.note}</div></div>`;
    return;
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
    el.querySelectorAll("[data-s]").forEach(b => b.onclick = () => updateDoc(doc(db, "videos", v.id), { stage: b.dataset.s }));
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

// ---------- FIFA ----------
$("fxAdd").onclick = async () => {
  const match = $("fxMatch").value.trim(); if (!match) return;
  await addDoc(collection(db, "fixtures"), {
    match, date: $("fxDate").value || "", time: $("fxTime").value.trim(), watch: true, watched: false, comp: "",
  });
  $("fxMatch").value = ""; $("fxTime").value = "";
};
function renderFixtures() {
  const list = $("fxList"); list.innerHTML = "";
  if (!cache.fixtures.length) { list.innerHTML = `<p class="muted small">No matches yet.</p>`; return; }
  [...cache.fixtures].sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach(f => {
    const el = document.createElement("div");
    el.className = "item" + (f.watched ? " done" : "");
    el.innerHTML = `
      <button class="check ${f.watched ? "on" : ""}" title="watched">${f.watched ? "✓" : ""}</button>
      <div class="item-main">
        <div class="item-title">${f.match}</div>
        <div class="item-sub">${f.comp ? `<span class="tag">${f.comp}</span>` : ""}${f.date || ""}${f.time ? " · " + f.time : ""}</div>
      </div>
      <button class="star" title="want to watch">${f.watch ? "⭐" : "☆"}</button>
      <button class="del">✕</button>`;
    el.querySelector(".check").onclick = () => updateDoc(doc(db, "fixtures", f.id), { watched: !f.watched });
    el.querySelector(".star").onclick = () => updateDoc(doc(db, "fixtures", f.id), { watch: !f.watch });
    el.querySelector(".del").onclick = () => deleteDoc(doc(db, "fixtures", f.id));
    list.appendChild(el);
  });
}
