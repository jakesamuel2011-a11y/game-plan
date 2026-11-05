// =============================================================
//  revision/revision.js — the 📖 Revision tab.
//
//  Firestore collections (all readable by both logins, like the rest of the app):
//    revprogress/{topicId}  {r1:{done,conf,at,by}, r2:{…}, pts:{index:true}}
//    revsessions            {date, slot, subject, topics[], title, method, mins, done, conf, notes, doneBy}
//    revtests               {subject, name, date, topics[]}
//    revpractice/{packId}   practice state (answers, flashcards, quiz scores, drills)
//    meta/revision_v1       one-time seed flag
//
//  app.js calls initRevision(...) after login and reads sessionsFor() /
//  upcomingTests() / paceSummary() for the Today plan and dashboard.
// =============================================================
import { SUBJECTS, PACKS, PACK_VERSION, REVISION_GOAL, SEED_TESTS, SEED_SESSIONS, allTopics, topicById, subjectByKey } from "./syllabus.js?v=1";
import { renderPack, packModes } from "./packview.js?v=2";

const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const ymd = (d) => d.toISOString().slice(0, 10);
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const fmtDate = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "";
const daysUntil = (s) => Math.round((new Date(s + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 864e5);

let DB, F, ME, NAME_FOR, ON_CHANGE;
const R = { progress: {}, sessions: [], tests: [] };
let view = { name: "home" };
const packCache = new Map();

export function initRevision({ db, fs, me, nameFor, onChange }) {
  DB = db; F = fs; ME = me; NAME_FOR = nameFor; ON_CHANGE = onChange || (() => {});
  seed().finally(() => {
    F.onSnapshot(F.query(F.collection(DB, "revprogress")), s => { R.progress = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); changed(); });
    F.onSnapshot(F.query(F.collection(DB, "revsessions")), s => { R.sessions = s.docs.map(d => ({ id: d.id, ...d.data() })); changed(); });
    F.onSnapshot(F.query(F.collection(DB, "revtests")), s => { R.tests = s.docs.map(d => ({ id: d.id, ...d.data() })); changed(); });
  });
}
function changed() { if (view.name !== "pack") render(); ON_CHANGE(); }

async function seed() {
  try {
    const ref = F.doc(DB, "meta", "revision_v1");
    if ((await F.getDoc(ref)).exists()) return;
    await F.setDoc(ref, { at: F.serverTimestamp() }); // claim first so two devices don't both seed
    for (const t of SEED_TESTS) await F.addDoc(F.collection(DB, "revtests"), { ...t, at: F.serverTimestamp() });
    for (const s of SEED_SESSIONS) await F.addDoc(F.collection(DB, "revsessions"), { mins: 45, ...s, done: false, at: F.serverTimestamp() });
  } catch (e) { console.warn("revision seed skipped", e); }
}

// ---------- read API for app.js ----------
export function sessionsFor(dateStr) {
  return R.sessions.filter(s => s.date === dateStr && !s.done).sort((a, b) => (a.slot || 0) - (b.slot || 0));
}
export function upcomingTests() {
  const t = todayStr();
  return R.tests.filter(x => x.date >= t).sort((a, b) => a.date.localeCompare(b.date));
}
export function overdueSessions() {
  const t = todayStr();
  return R.sessions.filter(s => !s.done && s.date < t);
}
export function paceSummary() {
  const topics = allTopics();
  const total = topics.length * REVISION_GOAL.rounds;
  const done = topics.reduce((n, t) => n + (R.progress[t.id]?.r1?.done ? 1 : 0) + (R.progress[t.id]?.r2?.done ? 1 : 0), 0);
  const start = new Date(REVISION_GOAL.start + "T00:00:00"), by = new Date(REVISION_GOAL.by + "T00:00:00"), now = new Date();
  const frac = Math.min(1, Math.max(0, (now - start) / (by - start)));
  const expected = Math.round(total * frac);
  const weeksLeft = Math.max(1, Math.ceil((by - now) / (7 * 864e5)));
  return {
    total, done, expected, behind: Math.max(0, expected - done),
    perWeek: (Math.max(0, total - done) / weeksLeft).toFixed(1),
    subjectsWithTopics: SUBJECTS.filter(s => s.topics.length).length, subjects: SUBJECTS.length,
  };
}

// ---------- writes ----------
const progRef = (id) => F.doc(DB, "revprogress", id);
async function setRound(topicId, round, conf) {
  const val = conf ? { done: true, conf, at: todayStr(), by: ME().email } : { done: false };
  await F.setDoc(progRef(topicId), { [round]: val }, { merge: true });
}
async function togglePoint(topicId, i) {
  const pts = { ...(R.progress[topicId]?.pts || {}) };
  pts[i] = !pts[i];
  await F.setDoc(progRef(topicId), { pts }, { merge: true });
}
async function completeSession(s, conf, notes) {
  await F.updateDoc(F.doc(DB, "revsessions", s.id), { done: true, conf, notes: notes || "", doneBy: ME().email, doneAt: todayStr() });
  // A session counts as the next revision round for each topic it covers.
  for (const id of s.topics || []) {
    const p = R.progress[id] || {};
    if (!p.r1?.done) await setRound(id, "r1", conf);
    else if (!p.r2?.done && p.r1.at !== todayStr()) await setRound(id, "r2", conf);
  }
}

// ---------- packs ----------
async function loadPack(id) {
  if (!packCache.has(id)) {
    packCache.set(id, fetch(`revision/packs/${id}.json?v=${PACK_VERSION}`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }));
  }
  return packCache.get(id);
}
async function practiceStore(packId) {
  const ref = F.doc(DB, "revpractice", packId);
  const snap = await F.getDoc(ref);
  const store = { state: snap.exists() ? snap.data() : {} };
  let timer = null;
  store.save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => F.setDoc(ref, { ...store.state, updatedBy: ME().email, updatedAt: F.serverTimestamp() }).catch(e => console.warn("practice save failed", e)), 700);
  };
  return store;
}

// ---------- rendering ----------
const root = () => document.getElementById("revRoot");
function go(v) { view = v; render(); window.scrollTo(0, 0); }

export function render() {
  const el = root(); if (!el) return;
  if (view.name === "subject") return renderSubject(el, subjectByKey(view.key));
  if (view.name === "pack") return renderPackView(el);
  renderHome(el);
}

function confPicker(onPick, withNotes) {
  const box = document.createElement("div");
  box.className = "rv-conf";
  box.innerHTML = `<div class="muted small">How confident are you now? (1 = shaky, 5 = could teach it)</div>
    <div class="rv-conf-row">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-c="${n}">${n}</button>`).join("")}</div>
    ${withNotes ? `<input type="text" class="mininput" placeholder="Notes: anything to recheck? (optional)" />` : ""}`;
  box.querySelectorAll("button[data-c]").forEach(b => b.onclick = () => onPick(+b.dataset.c, box.querySelector("input")?.value.trim()));
  return box;
}

function roundChip(topic, round) {
  const p = R.progress[topic.id]?.[round];
  const label = round === "r1" ? "Round 1" : "Round 2";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "rv-round" + (p?.done ? " on" : "") + (p?.done && p.conf <= 2 ? " shaky" : "");
  b.innerHTML = p?.done ? `✓ ${label} · ${p.conf}/5` : label;
  b.title = p?.done ? `Done ${fmtDate(p.at)} by ${NAME_FOR(p.by)}` : "Tap when you've revised this topic";
  b.onclick = (ev) => {
    ev.stopPropagation();
    const host = b.closest(".rv-topic");
    host.querySelector(".rv-conf")?.remove();
    if (p?.done) {
      if (confirm(`Undo ${label} for “${topic.name}”?`)) setRound(topic.id, round, 0);
      return;
    }
    if (round === "r2" && !R.progress[topic.id]?.r1?.done) { alert("Do Round 1 first."); return; }
    host.appendChild(confPicker(conf => setRound(topic.id, round, conf)));
  };
  return b;
}

function sessionEl(s) {
  const el = document.createElement("div");
  el.className = "item rv-sess" + (s.done ? " done" : "");
  const late = !s.done && s.date < todayStr();
  el.innerHTML = `<div class="item-main">
      <div class="item-title">${esc(s.title)}</div>
      <div class="item-sub"><span class="tag subj">${esc(subjectByKey(s.subject)?.name || s.subject)}</span>${fmtDate(s.date)} · ${s.mins || 45} min${late ? ` · <span class="pill over">missed</span>` : ""}</div>
      <div class="item-sub">${esc(s.method || "")}</div>
      ${s.done ? `<div class="item-sub">✓ confidence ${s.conf}/5${s.notes ? ` · “${esc(s.notes)}”` : ""} · ${esc(NAME_FOR(s.doneBy))}</div>` : ""}
    </div>`;
  if (!s.done) {
    const b = document.createElement("button");
    b.className = "btn tiny primary"; b.textContent = "Done";
    b.onclick = () => {
      el.querySelector(".rv-conf")?.remove();
      el.querySelector(".item-main").appendChild(confPicker((conf, notes) => completeSession(s, conf, notes), true));
    };
    el.appendChild(b);
  }
  return el;
}

function paceCard() {
  const p = paceSummary();
  const pct = p.total ? Math.round(100 * p.done / p.total) : 0;
  const exp = p.total ? Math.round(100 * p.expected / p.total) : 0;
  const status = p.behind > 0 ? `<span class="pill over">behind by ${p.behind}</span>` : `<span class="pill today" style="color:var(--accent);background:#13302a">on pace ✓</span>`;
  return `<div class="card">
    <div class="row-between"><b>🎯 2 full revisions by ${fmtDate(REVISION_GOAL.by)}</b>${status}</div>
    <div class="progress rv-pace"><div class="bar" style="width:${pct}%"></div><div class="rv-exp" style="left:${exp}%" title="where you should be today"></div></div>
    <div class="muted small">${p.done} of ${p.total} topic-rounds done · should be ~${p.expected} by today · ${p.perWeek} a week from here.
    ${p.subjectsWithTopics < p.subjects ? `<br>Only ${p.subjectsWithTopics} of ${p.subjects} subjects have their topics listed so far, so this total will grow.` : ""}</div>
  </div>`;
}

function renderHome(el) {
  const t = todayStr();
  el.innerHTML = `<h2>📖 Revision</h2>${paceCard()}<div id="rvParent"></div>
    <h3 class="section-h">📝 Tests</h3><div id="rvTests" class="list"></div>
    <h3 class="section-h">🗓️ Revision sessions</h3><div id="rvSess" class="list"></div>
    <h3 class="section-h">📚 Subjects</h3><div id="rvSubj" class="rv-grid"></div>`;

  // Tests
  const tl = el.querySelector("#rvTests");
  const up = upcomingTests();
  if (!up.length) tl.innerHTML = `<p class="muted small">No tests coming up. Add one when school announces it.</p>`;
  up.forEach(x => {
    const n = daysUntil(x.date);
    const d = document.createElement("div"); d.className = "item";
    d.innerHTML = `<div class="item-main"><div class="item-title">${esc(x.name)}</div><div class="item-sub">${fmtDate(x.date)} · ${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}</div></div>
      <span class="pill ${n <= 2 ? "over" : n <= 7 ? "today" : "soon"}">${n === 0 ? "today" : n + "d"}</span><button class="del" title="Remove">✕</button>`;
    d.querySelector(".del").onclick = () => { if (confirm(`Remove “${x.name}”?`)) F.deleteDoc(F.doc(DB, "revtests", x.id)); };
    tl.appendChild(d);
  });
  const add = document.createElement("div"); add.className = "card add-card";
  add.innerHTML = `<div class="grid2"><select class="select" id="rvTSubj">${SUBJECTS.map(s => `<option value="${s.key}">${esc(s.name)}</option>`).join("")}</select><input type="date" class="select" id="rvTDate" /></div>
    <input type="text" id="rvTName" placeholder="Test name, e.g. Physics: Forces and motion" /><button class="btn primary" id="rvTAdd">Add test</button>`;
  tl.appendChild(add);
  add.querySelector("#rvTAdd").onclick = async () => {
    const name = add.querySelector("#rvTName").value.trim(), date = add.querySelector("#rvTDate").value, subject = add.querySelector("#rvTSubj").value;
    if (!name || !date) return;
    const topics = (subjectByKey(subject)?.topics || []).map(t => t.id);
    await F.addDoc(F.collection(DB, "revtests"), { subject, name, date, topics, by: ME().email, at: F.serverTimestamp() });
  };

  // Sessions: missed + next 7 days, then recently done
  const sl = el.querySelector("#rvSess");
  const horizon = addDays(t, 7);
  const open = R.sessions.filter(s => !s.done && s.date <= horizon).sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
  const recent = R.sessions.filter(s => s.done).sort((a, b) => (b.doneAt || b.date).localeCompare(a.doneAt || a.date)).slice(0, 3);
  if (!open.length) sl.innerHTML = `<p class="muted small">No sessions planned for the next 7 days. Use the Round buttons in each subject to log revision.</p>`;
  open.forEach(s => sl.appendChild(sessionEl(s)));
  if (recent.length) { sl.insertAdjacentHTML("beforeend", `<div class="muted small" style="margin-top:6px">Recently done</div>`); recent.forEach(s => sl.appendChild(sessionEl(s))); }

  // Subjects grid
  const grid = el.querySelector("#rvSubj");
  SUBJECTS.forEach(s => {
    const n = s.topics.length;
    const r1 = s.topics.filter(x => R.progress[x.id]?.r1?.done).length;
    const r2 = s.topics.filter(x => R.progress[x.id]?.r2?.done).length;
    const c = document.createElement("div"); c.className = "dcard";
    c.innerHTML = n
      ? `<div class="dc-h">${s.emoji} ${esc(s.name)}</div><div class="rv-mini">R1 <div class="progress"><div class="bar" style="width:${100 * r1 / n}%"></div></div>${r1}/${n}</div><div class="rv-mini">R2 <div class="progress"><div class="bar" style="width:${100 * r2 / n}%"></div></div>${r2}/${n}</div>`
      : `<div class="dc-h">${s.emoji} ${esc(s.name)}</div><div class="dc-sub">topics not listed yet</div>`;
    c.onclick = () => go({ name: "subject", key: s.key });
    grid.appendChild(c);
  });

  renderParentCheck(el.querySelector("#rvParent"));
}

// Christabel only: three quick questions on the most recent session's pack.
async function renderParentCheck(box) {
  if (!box || ME()?.email !== "christabelsingh@gmail.com") return;
  const t = todayStr();
  const recent = R.sessions.filter(s => (s.done || s.date <= t) && (s.topics || []).length).sort((a, b) => b.date.localeCompare(a.date) || (b.slot || 0) - (a.slot || 0))[0];
  const topic = recent && topicById(recent.topics[0]);
  if (!topic?.pack) return;
  try {
    const pack = await loadPack(topic.pack);
    const pool = (pack.flashcards || []).filter(c => !topic.packUnit || c.unit === topic.packUnit);
    const day = Math.floor(Date.now() / 864e5);
    const picks = [0, 1, 2].map(i => pool[(day * 7 + i * 5) % pool.length]).filter((c, i, a) => c && a.indexOf(c) === i);
    box.innerHTML = `<div class="card"><b>👩 Parent check (10 min)</b><div class="muted small">Based on ${fmtDate(recent.date)}: ${esc(recent.title)}. Ask Jake to explain each answer out loud.</div>
      <ol class="pk-ul">${picks.map(c => `<li>${esc(c.front)}<details><summary class="muted small">answer</summary><div class="small">${esc(c.back)}</div></details></li>`).join("")}</ol></div>`;
  } catch (e) { /* pack missing: skip */ }
}

function renderSubject(el, s) {
  if (!s) return go({ name: "home" });
  el.innerHTML = `<button class="btn tiny ghost" id="rvBack">← Revision</button><h2>${s.emoji} ${esc(s.name)}</h2>
    <details class="card rv-guide" open><summary><b>📋 How it's marked</b></summary>
      <div class="list" style="margin-top:8px">${s.guide.papers.map(([p, d]) => `<div class="item-sub"><b>${esc(p)}</b> · ${esc(d)}</div>`).join("")}</div>
      <ul class="pk-ul">${s.guide.tips.map(x => `<li>${esc(x)}</li>`).join("")}</ul>${s.guide.note ? `<div class="muted small">${esc(s.guide.note)}</div>` : ""}</details>
    <div id="rvTopics"></div>`;
  el.querySelector("#rvBack").onclick = () => go({ name: "home" });
  const list = el.querySelector("#rvTopics");
  if (!s.topics.length) {
    list.innerHTML = `<div class="card muted small">No topics listed for ${esc(s.name)} yet. Send Claude the chapter list (a photo of the textbook contents page is fine) and they'll appear here.</div>`;
    return;
  }
  let unit = null;
  s.topics.forEach(tp => {
    if (tp.unit !== unit) {
      unit = tp.unit;
      list.insertAdjacentHTML("beforeend", `<h3 class="section-h">${esc(unit || "Topics")}</h3>`);
      if (tp.pack) list.appendChild(unitPracticeCard(tp.pack, s.key, unit));
    }
    const pr = R.progress[tp.id] || {};
    const ticked = (tp.points || []).filter((_, i) => pr.pts?.[i]).length;
    const row = document.createElement("div"); row.className = "card rv-topic";
    row.innerHTML = `<div class="item-title">${esc(tp.name)}</div><div class="rv-rounds"></div>
      <details><summary class="rv-check-sum">✅ Must-know checklist <span class="pill ${ticked === (tp.points || []).length ? "today" : "soon"}">${ticked}/${(tp.points || []).length}</span> <span class="muted small">tick what you can explain without notes</span></summary><div class="rv-pts"></div></details>`;
    const rounds = row.querySelector(".rv-rounds");
    rounds.append(roundChip(tp, "r1"), roundChip(tp, "r2"));
    if (tp.pack) {
      const b = document.createElement("button"); b.className = "btn tiny primary"; b.textContent = "Practise";
      b.onclick = () => go({ name: "pack", id: tp.pack, unit: tp.packUnit, back: s.key });
      rounds.appendChild(b);
    }
    const pts = row.querySelector(".rv-pts");
    (tp.points || []).forEach((p, i) => {
      const it = document.createElement("label"); it.className = "rv-pt";
      it.innerHTML = `<input type="checkbox" ${pr.pts?.[i] ? "checked" : ""}/> <span>${esc(p)}</span>`;
      it.querySelector("input").onchange = () => togglePoint(tp.id, i);
      pts.appendChild(it);
    });
    if (view.open === tp.id) row.querySelector("details").open = true;
    row.querySelector("details").addEventListener("toggle", (e) => { view.open = e.target.open ? tp.id : null; });
    list.appendChild(row);
  });
}

// A card at the top of each unit: one button per practice mode, straight into it.
function unitPracticeCard(packId, subjectKey, unitName) {
  const c = document.createElement("div");
  c.className = "card rv-unitpk";
  c.innerHTML = `<b>🎯 Practise ${esc(PACKS[packId] || unitName)}</b><div class="rv-modes"></div>`;
  const row = c.querySelector(".rv-modes");
  loadPack(packId).then(pack => {
    packModes(pack).forEach(([k, label]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "rv-modebtn"; b.textContent = label;
      b.onclick = () => go({ name: "pack", id: packId, mode: k, back: subjectKey });
      row.appendChild(b);
    });
  }).catch(() => { row.innerHTML = `<span class="muted small">Practice pack unavailable offline.</span>`; });
  return c;
}

async function renderPackView(el) {
  const v = view;
  el.innerHTML = `<button class="btn tiny ghost" id="rvBack">← ${esc(subjectByKey(v.back)?.name || "Revision")}</button><div id="rvPack"><p class="muted small">Loading ${esc(PACKS[v.id] || "pack")}…</p></div>`;
  el.querySelector("#rvBack").onclick = () => go(v.back ? { name: "subject", key: v.back } : { name: "home" });
  try {
    const [pack, store] = await Promise.all([loadPack(v.id), practiceStore(v.id)]);
    if (view !== v) return; // navigated away while loading
    renderPack(el.querySelector("#rvPack"), pack, store, { unit: v.unit, mode: v.mode });
  } catch (e) {
    el.querySelector("#rvPack").innerHTML = `<p class="error">Couldn't load this pack (${esc(e.message)}). Check your connection and try again.</p>`;
  }
}
