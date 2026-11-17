// =============================================================
//  revision/revision.js — the 📖 Revision tab.
//
//  Firestore collections (all readable by both logins, like the rest of the app):
//    revprogress/{topicId}  {r1:{done,conf,at,by}, r2:{…}, pts:{index:true}}
//    revsessions            {date, slot, subject, topics[], title, method, mins, done, conf, notes, doneBy}
//    revtests               {subject, name, date, topics[]}
//    revpractice/{packId}   practice state (answers, flashcards, quiz scores, drills,
//                           sent:{key:text} = answers already sent for grading,
//                           done:{key:text} = answers Jake tapped Submit on)
//    studysessions          {by, date, start, end (ISO), mins, subjects[], status:"running"|"done",
//                           conf, notes, answers, gradeId, emailed} — Jake's timed study sessions
//    revgrade               grading sets (one per finished session that had answers; older ones from "Grade this"): {subject, date, by, items[], status:"waiting"|"graded",
//                           feedback, gradedAt, gradedBy}. Jake sends; Mum copies the text into
//                           Claude, then pastes the feedback back for Jake to read.
//    meta/revision_v1       one-time seed flag
//
//  app.js calls initRevision(...) after login and reads sessionsFor() /
//  upcomingTests() / paceSummary() for the Today plan and dashboard.
// =============================================================
import { SUBJECTS, PACKS, PACK_VERSION, REVISION_GOAL, SEED_TESTS, SEED_SESSIONS, allTopics, topicById, subjectByKey } from "./syllabus.js?v=11";
import { renderPack, packModes, writtenWork } from "./packview.js?v=11";

const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const ymd = (d) => d.toISOString().slice(0, 10);
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const fmtDate = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "";
const daysUntil = (s) => Math.round((new Date(s + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 864e5);

let DB, F, ME, NAME_FOR, ON_CHANGE, IS_PARENT;
const R = { progress: {}, sessions: [], tests: [], practice: {}, grades: [], study: [] };
let packHandle = null; // { applyLocks } for the pack open on screen
let liveStore = null; // the pack(s) open on screen (has unsaved typing): { stores:{id:store}, states:{id:state}, setSent(id, sent) }
let view = { name: "home" };
const packCache = new Map();

export function initRevision({ db, fs, me, nameFor, onChange, isParent }) {
  DB = db; F = fs; ME = me; NAME_FOR = nameFor; ON_CHANGE = onChange || (() => {}); IS_PARENT = isParent || (() => false);
  seed().finally(() => {
    F.onSnapshot(F.query(F.collection(DB, "revprogress")), s => { R.progress = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); changed(); });
    F.onSnapshot(F.query(F.collection(DB, "revsessions")), s => { R.sessions = s.docs.map(d => ({ id: d.id, ...d.data() })); changed(); });
    F.onSnapshot(F.query(F.collection(DB, "revtests")), s => { R.tests = s.docs.map(d => ({ id: d.id, ...d.data() })); changed(); });
    F.onSnapshot(F.query(F.collection(DB, "revpractice")), s => { R.practice = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); changed(true); });
    F.onSnapshot(F.query(F.collection(DB, "studysessions")), s => { R.study = s.docs.map(d => ({ id: d.id, ...d.data() })); changed(); });
    F.onSnapshot(F.query(F.collection(DB, "revoff")), s => { revOff = new Set(s.docs.map(d => d.id)); changed(); });
    F.onSnapshot(F.query(F.collection(DB, "revgrade")), s => { R.grades = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.n || 0) - (a.n || 0)); changed(); });
  });
}
function changed(quiet) {
  // Practice saves arrive while Jake types; don't redraw the page under him.
  if (view.name !== "pack" && !(quiet && view.name === "home" && !IS_PARENT())) render();
  else if (view.name === "pack" && !quiet) { const sb = document.getElementById("rvSess"); if (sb) { sb.innerHTML = ""; sessionControl(sb); } packHandle?.applyLocks(); }
  if (!quiet) ON_CHANGE();
}

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
export const subjectName = (key) => subjectByKey(key)?.name || key;
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
// Revision done between two dates (YYYY-MM-DD, inclusive): topic-rounds ticked,
// plus finished planned sessions that don't cover a topic (e.g. past papers),
// plus study sessions of 20+ minutes.
// Drives the "revision" requirement in the weekly Form rating.
export function revisionCount(from, to) {
  let n = 0;
  for (const p of Object.values(R.progress)) for (const r of ["r1", "r2"]) if (p[r]?.done && p[r].at >= from && p[r].at <= to) n++;
  n += R.sessions.filter(s => s.done && !(s.topics || []).length && s.doneAt >= from && s.doneAt <= to).length;
  n += R.study.filter(s => s.status === "done" && (s.mins || 0) >= 20 && s.date >= from && s.date <= to).length;
  return n;
}
// Grading requests still waiting for Mum's feedback (dashboard badge).
export const gradeQueue = () => R.grades.filter(g => g.status !== "graded");
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

// ---------- daily revision plan ----------
// Each day gets a few topics (one revision round each, about TOPIC_MINS minutes).
// How many depends on the day: app.js sets that with setPlanCapacity (football, holidays,
// tournaments; Sunday 0). Days Jake marks "can't revise" (revoff/{date}) get none.
// Order: topics with a test in the next 14 days first; then Round 1 of every topic, subjects
// taking turns; then Round 2, at least 7 days after that topic's Round 1. The plan is worked out
// again from progress every time, so a topic that isn't done just moves to the next day.
// Saturday adds catch-up (up to 3) for topics planned Mon–Fri that week but not done.
export const TOPIC_MINS = 25;
const PLAN_ORDER = ["Humanities", "EM", "Bio", "Math", "Physics", "Chem", "English"];
let revOff = new Set();
let capacityFor = (d) => (new Date(d + "T00:00:00Z").getUTCDay() === 0 ? 0 : 2);
export function setPlanCapacity(fn) { capacityFor = fn; }
const dayCap = (d) => (revOff.has(d) ? 0 : capacityFor(d));
const weekday = (d) => new Date(d + "T00:00:00Z").getUTCDay();
const roundsDoneOn = (from, to) => Object.values(R.progress).reduce((n, p) => n + ["r1", "r2"].filter(r => p[r]?.done && p[r].at >= from && p[r].at <= to).length, 0);
// Catch-up for a Saturday in the current week: topics planned on past weekdays that weren't done.
function makeup(sat) {
  const t = todayStr(), mon = addDays(sat, -5), lastPast = addDays(t, -1);
  if (weekday(sat) !== 6 || sat < t || mon > lastPast) return 0;
  const end = lastPast < addDays(sat, -1) ? lastPast : addDays(sat, -1);
  let planned = 0;
  for (let d = mon; d <= end; d = addDays(d, 1)) planned += dayCap(d);
  return Math.max(0, Math.min(3, planned - roundsDoneOn(mon, end)));
}
// Simulate from today to `until`. Returns { days: {date: [{topic, round}]}, r1Done: date|null, r2ByGoal }
function simulate(until) {
  const t = todayStr();
  const soon = new Set(upcomingTests().filter(x => x.date <= addDays(t, 14)).flatMap(x => x.topics || []));
  const lists = PLAN_ORDER.map(k => (subjectByKey(k)?.topics || []).map(tp => ({ ...tp, subject: k })));
  const all = [];
  for (let i = 0; lists.some(l => i < l.length); i++) lists.forEach(l => { if (l[i]) all.push(l[i]); });
  const r1at = {}, r2done = new Set();
  all.forEach(tp => { const p = R.progress[tp.id] || {}; if (p.r1?.done) r1at[tp.id] = p.r1.at; if (p.r2?.done) r2done.add(tp.id); });
  const days = {};
  let r1Done = all.every(tp => r1at[tp.id]) ? t : null, r2ByGoal = r2done.size;
  for (let d = t; d <= until; d = addDays(d, 1)) {
    let cap = dayCap(d) + makeup(d);
    if (d === t) cap = Math.max(0, cap - roundsDoneOn(t, t));
    const pick = [];
    const next = () => {
      const r1 = (tp) => !r1at[tp.id], r2 = (tp, gap) => r1at[tp.id] && !r2done.has(tp.id) && r1at[tp.id] <= addDays(d, -gap);
      return all.find(tp => soon.has(tp.id) && r1(tp)) ? [all.find(tp => soon.has(tp.id) && r1(tp)), "r1"]
        : all.find(tp => soon.has(tp.id) && r2(tp, 2)) ? [all.find(tp => soon.has(tp.id) && r2(tp, 2)), "r2"]
        : all.find(r1) ? [all.find(r1), "r1"]
        : all.find(tp => r2(tp, 7)) ? [all.find(tp => r2(tp, 7)), "r2"] : null;
    };
    while (pick.length < cap) {
      const n = next(); if (!n) break;
      const [tp, round] = n;
      if (round === "r1") r1at[tp.id] = d; else r2done.add(tp.id);
      pick.push({ topic: tp, round });
    }
    days[d] = pick;
    if (!r1Done && all.every(tp => r1at[tp.id])) r1Done = d;
    if (d <= REVISION_GOAL.by) r2ByGoal = r2done.size;
  }
  return { days, r1Done, r2ByGoal, total: all.length };
}
// The plan for one day: what's left, what's already done that day, and why a day is off.
export function revisionPlanFor(d) {
  const t = todayStr();
  const off = weekday(d) === 0 ? "sunday" : revOff.has(d) ? "marked" : capacityFor(d) === 0 ? "busy" : null;
  const done = d > t ? [] : allTopics().flatMap(tp => ["r1", "r2"].filter(r => R.progress[tp.id]?.[r]?.done && R.progress[tp.id][r].at === d).map(round => ({ topic: tp, round, done: R.progress[tp.id][round] })));
  const todo = d < t ? [] : (simulate(d).days[d] || []);
  return { off, todo, done, makeup: makeup(d) };
}
export function planProjection() {
  const end = addDays(REVISION_GOAL.by, 120);
  const s = simulate(end);
  return { r1Done: s.r1Done, r2ByGoal: s.r2ByGoal, total: s.total };
}
export function openTopicPractice(topicId) {
  const tp = topicById(topicId); if (!tp) return;
  go(tp.pack ? { name: "pack", id: tp.pack, unit: tp.packUnit, back: tp.subject } : { name: "subject", key: tp.subject });
}
const setRevOff = (d, on) => on ? F.setDoc(F.doc(DB, "revoff", d), { by: ME().email, at: F.serverTimestamp() }) : F.deleteDoc(F.doc(DB, "revoff", d));

// The "Today's revision" card in the Today tab.
export function mountDayPlan(el, d, { onPractise, label }) {
  el.innerHTML = "";
  const t = todayStr();
  const { off, todo, done, makeup: mk } = revisionPlanFor(d);
  const c = document.createElement("div"); c.className = "card rv-today";
  const mins = todo.length * TOPIC_MINS;
  const head = off === "sunday" ? "Sunday: no revision. Rest day 🎉"
    : off === "marked" ? "No revision planned (marked as a day off)"
    : off === "busy" ? "No revision planned (tournament day)"
    : todo.length ? `${todo.length} topic${todo.length > 1 ? "s" : ""} · about ${mins} min${mk ? ` · includes ${mk} catch-up` : ""}`
    : done.length ? "All done for the day ✅" : d < t ? "Nothing was planned" : "Nothing left to plan 🎉";
  c.innerHTML = `<div class="row-between"><b>📖 ${esc(label || "Today")}'s revision</b></div><div class="muted small">${head}</div><div class="list rv-today-list"></div>`;
  const list = c.querySelector(".rv-today-list");
  const subj = (k) => subjectByKey(k);
  const row = (tp, round, doneRec) => {
    const r = document.createElement("div"); r.className = "item rv-today-item" + (doneRec ? " done" : "");
    r.innerHTML = `<div class="item-main"><div class="item-title">${subj(tp.subject)?.emoji || ""} ${esc(shortNames([tp.subject]))} · ${esc(tp.name)}</div><div class="item-sub">${round === "r1" ? "Round 1" : "Round 2"}${doneRec ? ` · ✓ done, confidence ${doneRec.conf}/5` : " · flashcards + quiz, then exam questions"}</div></div>`;
    if (!doneRec && d === t) {
      const b = document.createElement("div"); b.className = "rv-today-btns";
      if (tp.pack) { const p = document.createElement("button"); p.type = "button"; p.className = "btn tiny primary"; p.textContent = "▶ Practise"; p.onclick = () => onPractise(tp.id); b.appendChild(p); }
      const k = document.createElement("button"); k.type = "button"; k.className = "btn tiny ghost"; k.textContent = "✓ Done";
      k.onclick = () => { r.querySelector(".rv-conf")?.remove(); r.appendChild(confPicker(conf => setRound(tp.id, round, conf))); };
      b.appendChild(k); r.appendChild(b);
    }
    list.appendChild(r);
  };
  if (!off || off === "marked") { done.forEach(x => row(x.topic, x.round, x.done)); todo.forEach(x => row(x.topic, x.round)); }
  if (d >= t && weekday(d) !== 0) {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn tiny ghost rv-offbtn";
    b.textContent = off === "marked" ? "↩︎ Plan revision for this day again" : "🚫 Can't revise this day";
    b.onclick = () => setRevOff(d, off !== "marked");
    if (off !== "busy") c.appendChild(b);
  }
  const pr = planProjection();
  c.insertAdjacentHTML("beforeend", `<div class="muted small rv-proj">Topics you don't finish move to the next day. At this pace: Round 1 of all ${pr.total} topics ${pr.r1Done ? `done by ${fmtDate(pr.r1Done)}` : "not finished yet"}; ${pr.r2ByGoal} of ${pr.total} Round 2s by ${fmtDate(REVISION_GOAL.by)}.</div>`);
  el.appendChild(c);
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

// ---------- Grade this ----------
const subjectPacks = (s) => [...new Set((s?.topics || []).map(t => t.pack).filter(Boolean))];
const stateFor = (packId) => liveStore?.states[packId] || R.practice[packId] || {};
// Written answers in a subject that are new or changed since they were last sent.
async function newWork(s) {
  const out = [];
  for (const id of subjectPacks(s)) {
    try {
      const st = stateFor(id), sent = st.sent || {};
      writtenWork(await loadPack(id), st).forEach(w => { if (sent[w.key] !== w.answer) out.push({ ...w, packId: id }); });
    } catch (e) { /* pack unavailable */ }
  }
  return out;
}
export function gradePrompt(g) {
  const keys = subjectsOf(g), many = keys.length > 1;
  const notes = keys.map(k => subjectByKey(k)?.guide?.note).filter(Boolean).map(n => " " + n).join("");
  const who = NAME_FOR(g.by);
  const total = g.items.reduce((n, i) => n + (+i.marks || 0), 0);
  const head = `Please mark ${who}'s revision answers like a Cambridge IGCSE examiner.
Subject${many ? "s" : ""}: ${subjNames(keys)}. ${who} is 15.${notes}
There ${g.items.length > 1 ? `are ${g.items.length} answers` : "is 1 answer"} (${total} mark${total > 1 ? "s" : ""} in total), each with its mark scheme or model answer below.

For each answer: give a mark (e.g. 3/4), say what earned the marks, what was missing compared with the mark scheme, and one clear tip to improve it.
Then finish with: total score, 2 things ${who} did well, and the 2 most important things to work on next.
Write to ${who} directly. Keep it encouraging, plain, and easy to read on a phone.`;
  const body = g.items.map((i, k) => `--- Question ${k + 1} of ${g.items.length} (${i.marks} mark${i.marks > 1 ? "s" : ""})${many && i.subject ? " · " + subjNames([i.subject]) : ""}${i.unit ? " · " + i.unit : ""} ---
Question: ${i.q}

${who}'s answer:
${i.answer}

${i.guide}`).join("\n\n");
  const p = g.practice;
  const extra = p ? `\n\n--- Also this session: flashcards and quizzes (already marked by the app) ---
${(p.quizzes || []).map(q => `${quizLabel(q)} (${q.pack}): ${q.score}/${q.n}`).join("\n")}${p.cards?.seen ? `\nFlashcards: ${p.cards.seen} reviewed. ${p.cards.got} "Got it", ${p.cards.again} "Not yet".` : ""}${p.notYet?.length ? `\nStill "Not yet": ${p.notYet.join("; ")}` : ""}
Add one short line of feedback on these too (they are not part of the written-answer total).` : "";
  return head + "\n\n" + body + extra;
}
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } finally { t.remove(); }
  }
  const was = btn.textContent; btn.textContent = "✓ Copied"; setTimeout(() => { btn.textContent = was; }, 2000);
}

// One request: status, and either Mum's tools (copy + paste feedback) or the feedback itself.
function gradeItem(g, showSubject) {
  const el = document.createElement("div");
  el.className = "item rv-grade";
  const what = `${g.items.length} answer${g.items.length > 1 ? "s" : ""}${showSubject ? " · " + esc(shortNames(subjectsOf(g))) : ""}`;
  const status = g.status === "graded"
    ? `<span class="pill today" style="color:var(--accent);background:#13302a">✓ ${g.score ? esc(g.score) : "graded"}</span>`
    : `<span class="pill soon">⏳ waiting for ${IS_PARENT() ? "you" : "Mum"}</span>`;
  el.innerHTML = `<div class="item-main">
    <div class="row-between"><div class="item-title">✍️ ${what}</div>${status}</div>
    <div class="item-sub">Sent ${fmtDate(g.date)} by ${esc(NAME_FOR(g.by))}${g.gradedAt ? ` · feedback ${fmtDate(g.gradedAt)}` : ""}</div>
    ${g.practice ? `<div class="item-sub">🃏 ${esc(practiceLine(g.practice))}</div>` : ""}
    <details class="rv-gq"><summary class="muted small">See the questions and answers</summary><ol class="pk-ul small">${g.items.map(i => `<li><b>${esc(i.q)}</b> <span class="muted">(${i.marks})</span><div class="rv-pre">${esc(i.answer)}</div></li>`).join("")}</ol></details>
    ${g.feedback ? `<div class="pk-ms rv-fb"><div class="pk-ms-h">Feedback</div><div class="rv-pre">${esc(g.feedback)}</div></div>` : ""}
    <div class="rv-gtools"></div></div>`;
  if (IS_PARENT()) {
    const tools = el.querySelector(".rv-gtools");
    const copy = document.createElement("button");
    copy.className = "btn primary"; copy.type = "button"; copy.textContent = "📋 Copy for Claude";
    copy.onclick = () => copyText(g.prompt || gradePrompt(g), copy);
    const hint = document.createElement("div");
    hint.className = "muted small"; hint.textContent = "Paste it into a Claude chat. When Claude has marked it, paste the feedback below so Jake can read it.";
    const ta = document.createElement("textarea");
    ta.className = "pk-text"; ta.placeholder = "Paste Claude's feedback here"; ta.value = g.feedback || "";
    const sc = document.createElement("input");
    sc.type = "text"; sc.className = "mininput rv-score"; sc.placeholder = "Score, e.g. 14/20 (Claude gives the total at the end)"; sc.value = g.score || "";
    const save = document.createElement("button");
    save.className = "btn"; save.type = "button"; save.textContent = g.feedback ? "Update feedback" : "Save feedback for Jake";
    save.onclick = async () => {
      const fb = ta.value.trim(); if (!fb) return;
      await F.updateDoc(F.doc(DB, "revgrade", g.id), { feedback: fb, score: sc.value.trim(), status: "graded", gradedAt: todayStr(), gradedBy: ME().email });
    };
    const del = document.createElement("button");
    del.className = "btn tiny ghost"; del.type = "button"; del.textContent = "Remove";
    del.onclick = () => { if (confirm("Remove this grading request?")) F.deleteDoc(F.doc(DB, "revgrade", g.id)); };
    if (g.status === "graded") {
      const d = document.createElement("details"); d.innerHTML = `<summary class="muted small">Copy again or edit feedback</summary>`;
      d.append(copy, ta, sc, save, del); tools.appendChild(d);
    } else tools.append(copy, hint, ta, sc, save, del);
  }
  return el;
}

// ---------- Study sessions ----------
// Jake taps Start, picks subjects, practises, then taps End. Every new answer
// in those subjects (submitted ones, plus drafts if he ticks the box) is
// copied into a grading set linked to the session. A GitHub Action emails Mum
// within ~15 min (scripts/send-session-email.mjs); she pastes Claude's
// feedback back and Jake sees it in the session row.
const subjectsOf = (g) => g.subjects?.length ? g.subjects : [g.subject];
const subjNames = (keys) => keys.map(k => subjectByKey(k)?.name || k).join(", ");
// Short names, as in the school timetable (EM rather than "EM (Environmental Mgmt)").
const shortNames = (keys) => keys.map(k => k === "EM" ? "EM" : subjectByKey(k)?.name || k).join(", ");
const hhmm = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
const minsSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso)) / 6e4));
export const runningSession = () => R.study.find(s => s.status === "running" && s.by === ME().email);
const anyRunning = () => R.study.find(s => s.status === "running");
let sessUI = { mode: null, picks: [], conf: 0, notes: "", drafts: true, mins: null }; // survives re-renders

async function startSession(subjects) {
  await F.addDoc(F.collection(DB, "studysessions"), {
    by: ME().email, date: todayStr(), start: new Date().toISOString(), subjects, status: "running", at: F.serverTimestamp(),
  });
}
// New answers in these subjects, split into submitted and not-yet-submitted.
async function sessionWork(keys) {
  const all = [];
  for (const k of keys) (await newWork(subjectByKey(k))).forEach(w => all.push({ ...w, subject: k }));
  const fin = all.filter(w => stateFor(w.packId).done?.[w.key] === w.answer);
  return { fin, drafts: all.filter(w => !fin.includes(w)) };
}
// Flashcards and quizzes done since the session started (they mark themselves).
// Returns { [subject]: { quizzes:[{pack, kind, score, n}], cards:{seen, got, again}, notYet:[front…] } }
async function sessionPractice(keys, startISO) {
  const out = {};
  for (const k of keys) {
    const p = { quizzes: [], cards: { seen: 0, got: 0, again: 0 }, notYet: [] };
    const byAt = {}; // a quiz mixing several books is saved under each book with the same start time: join it back
    for (const id of subjectPacks(subjectByKey(k))) {
      try {
        const st = stateFor(id), pack = await loadPack(id), name = PACKS[id] || pack.title;
        (st.quizzes || []).filter(q => q.at && q.at >= startISO && q.n > 0).forEach(q => {
          const j = byAt[q.at];
          if (j) { j.score += q.score; j.n += q.n; j.pack += " + " + name; }
          else p.quizzes.push(byAt[q.at] = { pack: name, kind: q.kind || "quiz", score: q.score, n: q.n });
        });
        const last = {};
        (st.cardLog || []).filter(e => e.at >= startISO).forEach(e => { last[e.key] = e.r; });
        for (const [key, r] of Object.entries(last)) {
          p.cards.seen++; p.cards[r === "got" ? "got" : "again"]++;
          if (r !== "got" && p.notYet.length < 10) { const c = pack.flashcards?.[+key.slice(1)]; if (c) p.notYet.push(c.front); }
        }
      } catch (e) { /* pack unavailable */ }
    }
    if (p.quizzes.length || p.cards.seen) out[k] = p;
  }
  return out;
}
const quizLabel = (q) => q.kind === "dates" ? "Date quiz" : "Quiz";
// One short line, e.g. "Quiz 14/16 · Flashcards ✓9 ✗3"
export function practiceLine(p) {
  if (!p) return "";
  const qs = (p.quizzes || []).map(q => `${quizLabel(q)} ${q.score}/${q.n}`);
  const c = p.cards?.seen ? [`Flashcards ✓${p.cards.got} ✗${p.cards.again}`] : [];
  return [...qs, ...c].join(" · ");
}

async function endSession(sess, { subjects, conf, notes, mins, drafts }) {
  const work = await sessionWork(subjects);
  const practice = await sessionPractice(subjects, sess.start);
  const items = [...work.fin, ...(drafts ? work.drafts : [])];
  // One grading set per subject, so each subject gets its own feedback and score.
  const grades = {}, answersBy = {};
  if (items.length) {
    for (const k of subjects) {
      const mine = items.filter(i => i.subject === k);
      if (!mine.length) continue;
      const g = {
        sessionId: sess.id, subject: k, subjects: [k], date: todayStr(), n: Date.now(), by: sess.by, status: "waiting", at: F.serverTimestamp(),
        items: mine.map(({ key, packId, subject, kind, pack, unit, q, marks, answer, guide }) => ({ key, packId, subject, kind, pack, unit, q, marks, answer, guide })),
      };
      if (practice[k]) g.practice = practice[k];
      g.prompt = gradePrompt(g); // stored so the email script can send the same text
      grades[k] = (await F.addDoc(F.collection(DB, "revgrade"), g)).id;
      answersBy[k] = mine.length;
    }
    for (const id of new Set(items.map(i => i.packId))) {
      const sent = { ...(stateFor(id).sent || {}) };
      items.filter(i => i.packId === id).forEach(i => { sent[i.key] = i.answer; });
      liveStore?.setSent(id, sent); // so the open pack's next save keeps it
      await F.setDoc(F.doc(DB, "revpractice", id), { sent }, { merge: true });
    }
  }
  await F.updateDoc(F.doc(DB, "studysessions", sess.id), {
    status: "done", end: new Date().toISOString(), doneAt: todayStr(), mins, subjects, conf, notes: notes || "",
    answers: items.length, answersBy, grades, gradeId: Object.values(grades)[0] || null, practice, emailed: false,
  });
}

// The start / running / end control. Used at the top of the Revision tab and in Progress.
function sessionControl(host) {
  const box = document.createElement("div");
  host.appendChild(box);
  const run = runningSession();
  if (IS_PARENT()) {
    const j = anyRunning();
    if (j) box.innerHTML = `<div class="card rv-sbar"><b>⏱️ ${esc(NAME_FOR(j.by))} is revising now</b> · ${esc(shortNames(j.subjects))} · <span class="rv-timer" data-start="${j.start}">${minsSince(j.start)}</span> min</div>`;
    return;
  }
  const chips = (picks, onToggle) => {
    const row = document.createElement("div"); row.className = "rv-schips";
    SUBJECTS.forEach(s => {
      const b = document.createElement("button"); b.type = "button";
      b.className = "chip" + (picks.includes(s.key) ? " on" : "");
      b.textContent = `${s.emoji} ${s.key === "EM" ? "EM" : s.name}`;
      b.onclick = () => onToggle(s.key);
      row.appendChild(b);
    });
    return row;
  };
  const redraw = () => { host.innerHTML = ""; sessionControl(host); };
  if (!run) {
    if (sessUI.mode !== "start") {
      box.innerHTML = `<div class="card rv-sbar"><div class="row-between"><div><b>⏱️ Study session</b><div class="muted small">Start one before you revise. When you end it, your answers go to Mum to mark.</div></div><button class="btn primary" type="button">▶ Start session</button></div></div>`;
      box.querySelector("button").onclick = () => {
        const cur = view.name === "subject" ? view.key : view.name === "pack" ? view.back : null;
        sessUI = { ...sessUI, mode: "start", picks: cur ? [cur] : [] }; redraw();
      };
      return;
    }
    const c = document.createElement("div"); c.className = "card rv-sbar";
    c.innerHTML = `<b>▶ Which subject are you revising?</b><div class="muted small">One subject per session, so the timing stays clear.</div>`;
    c.appendChild(chips(sessUI.picks, k => { sessUI.picks = [k]; redraw(); }));
    const row = document.createElement("div"); row.className = "pk-btns";
    const go = document.createElement("button"); go.className = "btn primary"; go.type = "button"; go.textContent = "Start";
    go.onclick = async () => { if (!sessUI.picks.length) return alert("Pick the subject you're revising."); go.disabled = true; await startSession(sessUI.picks); sessUI.mode = null; };
    const cancel = document.createElement("button"); cancel.className = "btn ghost"; cancel.type = "button"; cancel.textContent = "Cancel";
    cancel.onclick = () => { sessUI.mode = null; redraw(); };
    row.append(go, cancel); c.appendChild(row); box.appendChild(c);
    return;
  }
  if (sessUI.mode !== "end" || sessUI.id !== run.id) {
    box.innerHTML = `<div class="card rv-sbar on"><div class="row-between"><div><b>⏱️ Session running · <span class="rv-timer" data-start="${run.start}">${minsSince(run.start)}</span> min</b><div class="muted small">${esc(shortNames(run.subjects))} · started ${hhmm(run.start)} · model answers hidden until you end it</div></div><button class="btn primary" type="button">■ End session</button></div></div>`;
    box.querySelector("button").onclick = () => { sessUI = { ...sessUI, mode: "end", id: run.id, picks: run.subjects.slice(0, 1), conf: 0, notes: "", drafts: true, mins: Math.max(1, Math.min(minsSince(run.start), 240)) }; redraw(); };
    return;
  }
  // End panel
  const c = document.createElement("div"); c.className = "card rv-sbar on";
  c.innerHTML = `<b>■ End session</b><div class="muted small">Started ${hhmm(run.start)}. Check the subject you revised:</div>`;
  c.appendChild(chips(sessUI.picks, k => { sessUI.picks = [k]; redraw(); }));
  const rest = document.createElement("div");
  rest.innerHTML = `<label class="rv-slab">Minutes revised <input type="number" min="1" max="600" class="mininput rv-smins" value="${sessUI.mins}"></label>
    <div class="muted small">How confident do you feel now? (1 = shaky, 5 = could teach it)</div>
    <div class="rv-conf-row">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-c="${n}" class="${sessUI.conf === n ? "on" : ""}">${n}</button>`).join("")}</div>
    <input type="text" class="mininput rv-snotes" placeholder="Notes: what did you do? anything to recheck? (optional)" value="${esc(sessUI.notes)}">
    <div class="muted small rv-swork">Checking your answers…</div>`;
  c.appendChild(rest);
  rest.querySelector(".rv-smins").oninput = (e) => { sessUI.mins = +e.target.value; };
  rest.querySelector(".rv-snotes").oninput = (e) => { sessUI.notes = e.target.value; };
  rest.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { sessUI.conf = +b.dataset.c; rest.querySelectorAll("[data-c]").forEach(x => x.classList.toggle("on", x === b)); });
  const workEl = rest.querySelector(".rv-swork");
  Promise.all([sessionWork(sessUI.picks), sessionPractice(sessUI.picks, run.start)]).then(([{ fin, drafts }, prac]) => {
    const pl = Object.entries(prac).map(([k, p]) => `${esc(shortNames([k]))}: ${esc(practiceLine(p))}`).join("<br>");
    workEl.innerHTML = `${pl ? `🃏 Recorded with this session:<br>${pl}<br>` : ""}${fin.length ? `✅ <b>${fin.length}</b> submitted answer${fin.length > 1 ? "s" : ""} will go to Mum to mark.` : "No submitted answers this time."}
      ${drafts.length ? `<label class="rv-pt" style="margin-top:6px"><input type="checkbox" ${sessUI.drafts ? "checked" : ""}> <span>Also send ${drafts.length} answer${drafts.length > 1 ? "s" : ""} you didn't submit</span></label>` : ""}`;
    const cb = workEl.querySelector("input"); if (cb) cb.onchange = () => { sessUI.drafts = cb.checked; };
  });
  const row = document.createElement("div"); row.className = "pk-btns";
  const fin = document.createElement("button"); fin.className = "btn primary"; fin.type = "button"; fin.textContent = "✓ Finish session";
  fin.onclick = async () => {
    if (!sessUI.picks.length) return alert("Pick the subject you revised.");
    if (!sessUI.conf) return alert("Tap how confident you feel (1–5).");
    if (!(sessUI.mins > 0)) return alert("How many minutes did you revise?");
    fin.disabled = true; fin.textContent = "Saving…";
    try { await endSession(run, { subjects: sessUI.picks, conf: sessUI.conf, notes: sessUI.notes, mins: Math.round(sessUI.mins), drafts: sessUI.drafts }); sessUI.mode = null; }
    catch (e) { alert("Couldn't save: " + e.message); fin.disabled = false; fin.textContent = "✓ Finish session"; }
  };
  const back = document.createElement("button"); back.className = "btn ghost"; back.type = "button"; back.textContent = "Keep going";
  back.onclick = () => { sessUI.mode = null; redraw(); };
  const del = document.createElement("button"); del.className = "btn tiny ghost"; del.type = "button"; del.textContent = "Delete this session";
  del.onclick = () => { if (confirm("Delete this session? (Started by mistake)")) { sessUI.mode = null; F.deleteDoc(F.doc(DB, "studysessions", run.id)); } };
  row.append(fin, back); c.append(row, del); box.appendChild(c);
}
setInterval(() => document.querySelectorAll(".rv-timer").forEach(t => { t.textContent = minsSince(t.dataset.start); }), 30000);

// Progress tab: session control + the table of sessions.
export function mountStudyLog(el) {
  if (!el || !DB) return;
  el.innerHTML = "";
  sessionControl(el);
  const done = R.study.filter(s => s.status === "done").sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const weekAgo = addDays(todayStr(), -6);
  const wk = done.filter(s => s.date >= weekAgo);
  const wkMins = wk.reduce((n, s) => n + (s.mins || 0), 0);
  const card = document.createElement("div"); card.className = "card";
  if (!done.length) { card.innerHTML = `<b>📒 Study sessions</b><div class="muted small" style="margin-top:4px">No sessions yet. Tap ▶ Start session before revising.</div>`; el.appendChild(card); return; }
  const gById = Object.fromEntries(R.grades.map(g => [g.id, g]));
  // One row per subject in each session (time, minutes and confidence are the session's).
  const rows = done.slice(0, 20).flatMap(s => (s.subjects?.length ? s.subjects : ["?"]).map((k, i) => {
    const gid = s.grades ? s.grades[k] : (s.gradeId && (gById[s.gradeId]?.subjects || []).includes(k) ? s.gradeId : null);
    const n = s.answersBy ? (s.answersBy[k] || 0) : (gid ? gById[gid]?.items?.length || 0 : 0);
    return { s, k, gid, n, first: i === 0 };
  }));
  const mark = (gid, n) => {
    const g = gid && gById[gid];
    if (!g) return `<span class="muted">${n ? "–" : "no answers"}</span>`;
    return g.status === "graded" ? `<button class="rv-link" data-g="${g.id}">✓ ${g.score ? esc(g.score) : "feedback"} ▸</button>` : `<button class="rv-link" data-g="${g.id}">⏳ waiting ▸</button>`;
  };
  card.innerHTML = `<div class="row-between"><b>📒 Study sessions</b><span class="muted small">last 7 days: ${wk.length} session${wk.length === 1 ? "" : "s"} · ${Math.floor(wkMins / 60)}h ${wkMins % 60}m</span></div>
    <div class="rv-tscroll"><table class="rv-table rv-stable"><thead><tr><th>Date</th><th>Time</th><th>Mins</th><th>Subject</th><th>Conf.</th><th>Answers</th><th>Score</th><th>Quiz &amp; cards</th></tr></thead><tbody>
    ${rows.map(({ s, k, gid, n, first }) => `<tr class="${first ? "rv-snew" : "rv-ssame"}"><td>${fmtDate(s.date)}</td><td class="small">${hhmm(s.start)}–${hhmm(s.end)}</td><td>${s.mins || "–"}</td><td class="small">${esc(shortNames([k]))}${first && s.notes ? `<div class="muted">“${esc(s.notes)}”</div>` : ""}</td><td>${s.conf ? s.conf + "/5" : "–"}</td><td>${n}</td><td class="small">${mark(gid, n)}</td><td class="small">${esc(practiceLine(s.practice?.[k])) || "–"}</td></tr>${gid ? `<tr class="rv-gdetail" data-for="${gid}" hidden><td colspan="8"></td></tr>` : ""}`).join("")}
    </tbody></table></div>`;
  card.querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
    const tr = card.querySelector(`.rv-gdetail[data-for="${b.dataset.g}"]`);
    tr.hidden = !tr.hidden;
    if (!tr.hidden && !tr.firstElementChild.childElementCount) tr.firstElementChild.appendChild(gradeItem(gById[b.dataset.g], true));
  });
  el.appendChild(card);
}

// ---------- Progress tab section (app.js puts this HTML in the Progress tab) ----------
export function openSubject(key) { view = key ? { name: "subject", key } : { name: "home" }; render(); }
export function progressHtml() {
  const t = todayStr(), weekAgo = addDays(t, -6);
  const avg = (xs) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "–";
  // per subject
  const rows = SUBJECTS.map(s => {
    const n = s.topics.length;
    if (!n) return `<tr class="muted"><td><button class="rv-link" data-rvsub="${s.key}">${s.emoji} ${esc(s.name)}</button></td><td colspan="3" class="small">topics not listed yet</td></tr>`;
    const p = s.topics.map(x => R.progress[x.id] || {});
    const r1 = p.filter(x => x.r1?.done).length, r2 = p.filter(x => x.r2?.done).length;
    const confs = p.flatMap(x => [x.r2?.done ? x.r2.conf : x.r1?.done ? x.r1.conf : null]).filter(Boolean);
    const bar = (k) => `<div class="progress" style="margin:0"><div style="width:${100 * k / n}%"></div></div><span class="small muted">${k}/${n}</span>`;
    return `<tr><td><button class="rv-link" data-rvsub="${s.key}">${s.emoji} ${esc(s.name)}</button></td><td>${bar(r1)}</td><td>${bar(r2)}</td><td class="small">${avg(confs)}</td></tr>`;
  }).join("");
  // this week
  const weekRounds = revisionCount(weekAgo, t);
  const weekSess = R.sessions.filter(s => s.done && s.doneAt >= weekAgo && s.doneAt <= t);
  const missed = R.sessions.filter(s => !s.done && s.date < t);
  // shaky topics: latest round rated 1–2
  const shaky = allTopics().filter(tp => { const p = R.progress[tp.id] || {}; const last = p.r2?.done ? p.r2 : p.r1; return last?.done && last.conf <= 2; });
  const recent = R.sessions.filter(s => s.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || "")).slice(0, 5);
  const next = upcomingTests()[0];
  return `${paceCard()}
    <div class="stats">
      <div class="stat"><div class="n">${weekRounds}</div><div class="l">revision done in last 7 days</div></div>
      <div class="stat"><div class="n">${weekSess.length}</div><div class="l">planned sessions done</div></div>
      <div class="stat"><div class="n" style="${missed.length ? "color:var(--red)" : ""}">${missed.length}</div><div class="l">sessions missed</div></div>
      <div class="stat"><div class="n" style="${shaky.length ? "color:var(--amber)" : ""}">${shaky.length}</div><div class="l">topics to revisit</div></div>
    </div>
    <div class="card"><b>By subject</b>
      <table class="rv-table"><thead><tr><th></th><th>Round 1</th><th>Round 2</th><th>Avg conf.</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    ${shaky.length ? `<div class="card"><b>🟠 Revisit these (rated 1–2)</b><ul class="pk-ul">${shaky.map(tp => `<li>${esc(subjectByKey(tp.subject)?.name)}: ${esc(tp.name)}</li>`).join("")}</ul></div>` : ""}
    ${next ? `<div class="card"><b>📝 Next test</b><div class="small">${esc(next.name)} · ${fmtDate(next.date)} (${daysUntil(next.date) === 0 ? "today" : `in ${daysUntil(next.date)} days`})</div></div>` : ""}
    ${recent.length ? `<div class="card"><b>Recent sessions</b><ul class="pk-ul">${recent.map(s => `<li>${fmtDate(s.doneAt || s.date)} · ${esc(s.title)} · <b>${s.conf}/5</b>${s.notes ? ` <span class="muted">“${esc(s.notes)}”</span>` : ""}</li>`).join("")}</ul></div>` : ""}`;
}

// ---------- rendering ----------
const root = () => document.getElementById("revRoot");
function go(v) { liveStore = null; view = v; render(); window.scrollTo(0, 0); }

export function render() {
  const host = root(); if (!host) return;
  // Subject switcher: always at the top of every Revision page.
  const current = view.name === "subject" ? view.key : view.name === "pack" ? view.back : null;
  host.innerHTML = `<nav class="rv-nav"><button type="button" class="rv-navbtn ${view.name === "home" ? "on" : ""}" data-k="">📖 Overview</button>${SUBJECTS.map(s => `<button type="button" class="rv-navbtn ${current === s.key ? "on" : ""}" data-k="${s.key}">${s.emoji} ${esc(s.key === "EM" ? "EM" : s.name)}</button>`).join("")}</nav><div id="rvSess"></div><div id="rvView"></div>`;
  host.querySelectorAll(".rv-navbtn").forEach(b => b.onclick = () => go(b.dataset.k ? { name: "subject", key: b.dataset.k } : { name: "home" }));
  const tabs = document.querySelector(".tabs");
  if (tabs) host.querySelector(".rv-nav").style.top = Math.round(tabs.getBoundingClientRect().bottom) + "px"; // sit just under the app's tab bar
  const on = host.querySelector(".rv-navbtn.on"); if (on) on.parentElement.scrollLeft = on.offsetLeft - 40;
  sessionControl(host.querySelector("#rvSess"));
  const el = host.querySelector("#rvView");
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
  el.innerHTML = `<h2>📖 Revision</h2>
    <h3 class="section-h">📚 Subjects: tap one for its topics, checklists and practice</h3><div id="rvSubj" class="rv-grid"></div>
    ${paceCard()}<div id="rvParent"></div>
    <h3 class="section-h">📝 Tests</h3><div id="rvTests" class="list"></div>
    <h3 class="section-h">🗓️ Revision sessions</h3><div id="rvSess" class="list"></div>
    <div id="rvGrades"></div>`; // marking and feedback for each session: at the bottom

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
      ? `<div class="dc-h">${s.emoji} ${esc(s.name)}</div>${s.topics.some(x => x.pack) ? `<div class="dc-sub good" style="margin-top:0">🎯 practice ready</div>` : ""}<div class="rv-mini">R1 <div class="progress"><div class="bar" style="width:${100 * r1 / n}%"></div></div>${r1}/${n}</div><div class="rv-mini">R2 <div class="progress"><div class="bar" style="width:${100 * r2 / n}%"></div></div>${r2}/${n}</div>`
      : `<div class="dc-h">${s.emoji} ${esc(s.name)}</div><div class="dc-sub">topics not listed yet</div>`;
    c.onclick = () => go({ name: "subject", key: s.key });
    grid.appendChild(c);
  });

  renderParentCheck(el.querySelector("#rvParent"));

  // Grading: Mum sees everything waiting; Jake sees his latest requests and feedback.
  const gb = el.querySelector("#rvGrades");
  const waiting = gradeQueue();
  const list = IS_PARENT() ? waiting : R.grades.slice(0, 3);
  if (list.length) {
    gb.innerHTML = `<h3 class="section-h">✍️ ${IS_PARENT() ? `Ready to grade (${waiting.length})` : "Marking"}</h3>`;
    const l = document.createElement("div"); l.className = "list";
    list.forEach(g => l.appendChild(gradeItem(g, true)));
    gb.appendChild(l);
  } else if (IS_PARENT()) {
    gb.innerHTML = `<h3 class="section-h">✍️ Ready to grade (0)</h3><div class="card muted small">Nothing to mark yet. When Jake ends a study session with written answers, they appear here (and you get an email), with a 📋 Copy for Claude button, a box to paste the feedback and a Score box.</div>`;
  }
}

// Christabel only: three quick questions on the most recent session's pack.
async function renderParentCheck(box) {
  if (!box || !IS_PARENT()) return;
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
    <div id="rvTopics"></div><div id="rvGrade"></div>`; // marking for this subject: at the bottom
  el.querySelector("#rvBack").onclick = () => go({ name: "home" });
  if (subjectPacks(s).length) {
    const gbox = el.querySelector("#rvGrade");
    const mine = R.grades.filter(g => subjectsOf(g).includes(s.key)).slice(0, 3);
    if (mine.length) { gbox.insertAdjacentHTML("beforeend", `<h3 class="section-h">✍️ Marking</h3>`); const l = document.createElement("div"); l.className = "list"; mine.forEach(g => l.appendChild(gradeItem(g))); gbox.appendChild(l); }
  }
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

// ---------- several books at once (one subject) ----------
// Picking more than one book merges them into one pack for the screen. Merged
// items and chapters are keyed "<packId>::c3", "<packId>::eq2", "<packId>::<unit>";
// one shared state is split back into each book's own revpractice/{packId} on every save.
const SEP = "::";
const MERGE_FIELDS = ["answers", "cards", "done", "sent", "drills"];
const splitKey = (k) => { const i = k.indexOf(SEP); return [k.slice(0, i), k.slice(i + SEP.length)]; };

function mergePacks(ids, packs) {
  const m = { title: ids.map((id, i) => PACKS[id] || packs[i].title).join(" + "), sub: "Mixed: questions from every chapter you pick, shuffled.",
    units: [], flashcards: [], quiz: [], exam: [], debates: [], timeline: [], strategy: [], commandWords: [] };
  const words = new Set();
  ids.forEach((id, i) => {
    const p = packs[i], book = PACKS[id] || p.title, q = (u) => id + SEP + (u || "*");
    (p.units || []).forEach(u => m.units.push({ key: q(u.key), name: u.name, book, label: `${book} · ${u.name}` }));
    const lists = ["flashcards", "quiz", "exam", "debates", "timeline"];
    if (lists.some(l => (p[l] || []).some(x => !x.unit))) m.units.push({ key: q(), name: p.units?.length ? "Other" : "Whole book", book, label: book });
    const tag = (l, pre) => (p[l] || []).forEach((x, j) => m[l].push({ ...x, unit: q(x.unit), ...(pre ? { key: id + SEP + pre + j } : {}) }));
    tag("flashcards", "c"); tag("quiz"); tag("exam", "eq"); tag("debates", "d"); tag("timeline");
    (p.strategy || []).forEach(x => m.strategy.push({ ...x, title: `${book}: ${x.title}` }));
    (p.commandWords || []).forEach(w => { if (!words.has(w[0].toLowerCase())) { words.add(w[0].toLowerCase()); m.commandWords.push(w); } });
  });
  return m;
}
function mergedStore(ids, stores) {
  const S = { quizzes: [], cardLog: [] };
  MERGE_FIELDS.forEach(f => { S[f] = {}; ids.forEach(id => Object.entries(stores[id].state[f] || {}).forEach(([k, v]) => { S[f][id + SEP + k] = v; })); });
  const base = Object.fromEntries(ids.map(id => [id, { quizzes: (stores[id].state.quizzes || []).slice(), cardLog: (stores[id].state.cardLog || []).slice() }]));
  const split = () => ids.forEach(id => {
    const st = stores[id].state, pre = id + SEP, mine = (k) => k.startsWith(pre), strip = (k) => k.slice(pre.length);
    const units = (u) => (u || "all").split("+").filter(mine).map(strip).sort().join("+") || "all";
    const before = JSON.stringify(st);
    MERGE_FIELDS.forEach(f => { st[f] = Object.fromEntries(Object.entries(S[f]).filter(([k]) => mine(k)).map(([k, v]) => [strip(k), v])); });
    st.cardLog = base[id].cardLog.concat(S.cardLog.filter(e => mine(e.key)).map(e => ({ ...e, key: strip(e.key), unit: units(e.unit) }))).slice(-1500);
    st.quizzes = base[id].quizzes.concat(S.quizzes.map(q => {
      const bu = Object.entries(q.byUnit || {}).filter(([k]) => mine(k));
      if (!bu.length) return null;
      return { d: q.d, at: q.at, unit: units(q.unit), kind: q.kind, score: bu.reduce((a, [, v]) => a + v[0], 0), n: bu.reduce((a, [, v]) => a + v[1], 0),
        byUnit: Object.fromEntries(bu.map(([k, v]) => [strip(k), v.slice()])) };
    }).filter(Boolean));
    if (JSON.stringify(st) !== before) stores[id].save();
  });
  return { state: S, save: split };
}

async function renderPackView(el) {
  const v = view;
  const s = subjectByKey(v.back);
  const ids = v.ids ||= [v.id];
  // Chapters are remembered fully qualified ("<packId>::<unit>") so they survive adding or removing a book.
  v.units ||= [].concat(v.unit || []).map(u => u.includes(SEP) ? u : v.id + SEP + u);
  const books = subjectPacks(s);
  el.innerHTML = `<button class="btn tiny ghost" id="rvBack">← ${esc(s?.name || "Revision")}</button><div id="rvBooks"></div><div id="rvPack"><p class="muted small">Loading ${esc(ids.map(id => PACKS[id] || "pack").join(" + "))}…</p></div>`;
  el.querySelector("#rvBack").onclick = () => go(v.back ? { name: "subject", key: v.back } : { name: "home" });
  if (books.length > 1) {
    const c = el.querySelector("#rvBooks");
    c.className = "card rv-books";
    c.innerHTML = `<b>📚 Books</b><div class="muted small">Tap to add or remove. Pick more than one to mix their chapters.</div><div class="rv-schips"></div>`;
    books.forEach(id => {
      const b = document.createElement("button"); b.type = "button";
      b.className = "chip" + (ids.includes(id) ? " on" : ""); b.textContent = PACKS[id] || id;
      b.onclick = () => {
        const next = ids.includes(id) ? ids.filter(x => x !== id) : books.filter(x => x === id || ids.includes(x));
        if (!next.length) return; // keep at least one book
        view = { ...v, id: next[0], ids: next }; render();
      };
      c.querySelector(".rv-schips").appendChild(b);
    });
  }
  try {
    const stores = liveStore?.stores || {};
    const [packs] = await Promise.all([Promise.all(ids.map(loadPack)), ...ids.map(async id => { stores[id] ||= await practiceStore(id); })]);
    if (view !== v) return; // navigated away while loading
    const byId = Object.fromEntries(ids.map((id, i) => [id, packs[i]]));
    const multi = ids.length > 1;
    const pack = multi ? mergePacks(ids, packs) : packs[0];
    const store = multi ? mergedStore(ids, stores) : stores[ids[0]];
    liveStore = {
      stores, states: Object.fromEntries(ids.map(id => [id, stores[id].state])),
      setSent(id, sent) {
        if (!stores[id]) return;
        stores[id].state.sent = sent;
        if (multi && ids.includes(id)) {
          for (const k of Object.keys(store.state.sent)) if (k.startsWith(id + SEP)) delete store.state.sent[k];
          for (const [k, a] of Object.entries(sent)) store.state.sent[id + SEP + k] = a;
        }
      },
    };
    const jake = s && !IS_PARENT();
    // Submit marks an answer finished; it goes to Mum when the session ends.
    const current = (key) => {
      if (!multi) return writtenWork(pack, store.state).find(w => w.key === key);
      const [id, raw] = splitKey(key);
      return byId[id] && writtenWork(byId[id], stores[id].state).find(w => w.key === raw);
    };
    const submit = async (key) => {
      const w = current(key);
      if (!w) { alert("Write a bit more first, then submit."); return; }
      store.state.done = { ...(store.state.done || {}), [key]: w.answer };
      store.save();
    };
    const submitted = (key) => { const w = current(key); return !!w && (store.state.done?.[key] === w.answer || store.state.sent?.[key] === w.answer); };
    const locked = () => !!runningSession(); // model answers hidden while his session runs
    const unit = multi ? v.units.filter(u => ids.includes(splitKey(u)[0])) : v.units.filter(u => splitKey(u)[0] === ids[0]).map(u => splitKey(u)[1]);
    const onUnits = (keys) => {
      const q = multi ? keys : keys.map(k => ids[0] + SEP + k);
      v.units = [...v.units.filter(u => !ids.includes(splitKey(u)[0])), ...q]; // keep picks in books not shown
    };
    const onMode = (m) => { v.mode = m; };
    const o = { unit, mode: v.mode, onUnits, onMode };
    packHandle = renderPack(el.querySelector("#rvPack"), pack, store, jake ? { ...o, submit, submitted, locked } : o);
  } catch (e) {
    el.querySelector("#rvPack").innerHTML = `<p class="error">Couldn't load this pack (${esc(e.message)}). Check your connection and try again.</p>`;
  }
}
