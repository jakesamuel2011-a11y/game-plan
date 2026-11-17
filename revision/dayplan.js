// =============================================================
//  revision/dayplan.js — Jake's daily revision plan (pure logic, no Firebase).
//  Used by the app (Today tab) and by scripts/send-plan-email.mjs, so the
//  emails always match what the app shows.
//
//  Each day gets a few topics (one revision round each, about TOPIC_MINS minutes):
//    football day 1 · other school day 2 · Saturday 3 (+ up to 3 catch-up for the
//    week) · marked holiday 3 · tournament day 0 · Sunday 0 · "no-revision" day 0.
//  Order: topics with a test in the next 14 days first; then Round 1 of every topic,
//  subjects taking turns; then Round 2, at least 7 days after that topic's Round 1.
//  The plan is worked out again from progress every time, so a topic that isn't
//  done just moves to the next day.
// =============================================================

export const TOPIC_MINS = 25;
export const REV_PER_DAY = { football: 1, school: 2, saturday: 3, holiday: 3 };
export const FOOTBALL_DAYS = [1, 3, 5];
const PLAN_ORDER = ["Humanities", "EM", "Bio", "Math", "Physics", "Chem", "English"];

export const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekday = (d) => new Date(d + "T00:00:00Z").getUTCDay();

// ctx: { tournaments:[{date,name}], holidays:[{from,to,name}], footballOff:Set|[], resched:Map|{}, revOff:Map|{} }
function norm(ctx = {}) {
  const asMap = (x) => (x instanceof Map ? x : new Map(Object.entries(x || {})));
  return {
    tournaments: ctx.tournaments || [], holidays: ctx.holidays || [],
    footballOff: ctx.footballOff instanceof Set ? ctx.footballOff : new Set(ctx.footballOff || []),
    resched: asMap(ctx.resched), revOff: asMap(ctx.revOff),
  };
}

// What kind of day it is, for labels: {kind, label}
export function dayInfo(d, ctxIn) {
  const ctx = norm(ctxIn), wd = weekday(d);
  if (wd === 0) return { kind: "sunday", label: "Sunday" };
  const off = ctx.revOff.get(d);
  if (off) return { kind: "off", label: off.reason || "No-revision day" };
  const tour = ctx.tournaments.find((x) => x.date === d);
  if (tour) return { kind: "tournament", label: `Tournament${tour.name ? ": " + tour.name : ""}` };
  const hol = ctx.holidays.find((h) => h.from && h.to && d >= h.from && d <= h.to);
  if (hol) return { kind: "holiday", label: `Holiday${hol.name ? ": " + hol.name : ""}` };
  if (wd === 6) return { kind: "saturday", label: "Saturday" };
  const movedHere = [...ctx.resched.values()].some((r) => r.toDate === d);
  const training = movedHere || (FOOTBALL_DAYS.includes(wd) && !ctx.footballOff.has(d) && !ctx.resched.has(d));
  return training ? { kind: "football", label: "Football training" } : { kind: "school", label: "School day" };
}
export function capacity(d, ctx) {
  const k = dayInfo(d, ctx).kind;
  return k === "sunday" || k === "off" || k === "tournament" ? 0 : REV_PER_DAY[k];
}

// subjects: [{key, topics:[{id, name, pack, packUnit}]}] · progress: {topicId: {r1:{done,at,conf}, r2}}
// tests: [{date, topics:[ids]}] · today: "YYYY-MM-DD"
export function makePlanner({ subjects, progress, tests, ctx: ctxIn, today, goalBy }) {
  const ctx = norm(ctxIn);
  const P = progress || {};
  const dayCap = (d) => capacity(d, ctx);
  const roundsDoneOn = (from, to) => Object.values(P).reduce((n, p) => n + ["r1", "r2"].filter((r) => p[r]?.done && p[r].at >= from && p[r].at <= to).length, 0);
  // Catch-up for a Saturday in the current week: topics planned on past weekdays that weren't done.
  // Work done any day this week (today included) counts, so getting ahead cancels catch-up.
  function makeup(sat) {
    const mon = addDays(sat, -5), lastPast = addDays(today, -1);
    if (weekday(sat) !== 6 || sat < today || mon > lastPast || dayCap(sat) === 0) return 0;
    const end = lastPast < addDays(sat, -1) ? lastPast : addDays(sat, -1);
    let planned = 0;
    for (let d = mon; d <= end; d = addDays(d, 1)) planned += dayCap(d);
    const fri = addDays(sat, -1), doneTo = today < fri ? today : fri;
    return Math.max(0, Math.min(3, planned - roundsDoneOn(mon, doneTo)));
  }
  const bySubj = new Map(subjects.map((s) => [s.key, s]));
  const lists = PLAN_ORDER.map((k) => (bySubj.get(k)?.topics || []).map((tp) => ({ ...tp, subject: k })));
  const all = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) lists.forEach((l) => { if (l[i]) all.push(l[i]); });

  // Simulate from today to `until`: { days: {date: [{topic, round}]}, r1Done, r2ByGoal, total }
  function simulate(until) {
    const soon = new Set((tests || []).filter((x) => x.date >= today && x.date <= addDays(today, 14)).flatMap((x) => x.topics || []));
    const r1at = {}, r2done = new Set();
    all.forEach((tp) => { const p = P[tp.id] || {}; if (p.r1?.done) r1at[tp.id] = p.r1.at; if (p.r2?.done) r2done.add(tp.id); });
    const days = {};
    let r1Done = all.every((tp) => r1at[tp.id]) ? today : null, r2ByGoal = r2done.size;
    for (let d = today; d <= until; d = addDays(d, 1)) {
      let cap = dayCap(d) + makeup(d);
      if (d === today) cap = Math.max(0, cap - roundsDoneOn(today, today));
      const r1 = (tp) => !r1at[tp.id];
      const r2 = (tp, gap) => r1at[tp.id] && !r2done.has(tp.id) && r1at[tp.id] <= addDays(d, -gap);
      const pick = [];
      while (pick.length < cap) {
        let tp, round;
        if ((tp = all.find((x) => soon.has(x.id) && r1(x)))) round = "r1";
        else if ((tp = all.find((x) => soon.has(x.id) && r2(x, 2)))) round = "r2";
        else if ((tp = all.find(r1))) round = "r1";
        else if ((tp = all.find((x) => r2(x, 7)))) round = "r2";
        else break;
        if (round === "r1") r1at[tp.id] = d; else r2done.add(tp.id);
        pick.push({ topic: tp, round });
      }
      days[d] = pick;
      if (!r1Done && all.every((tp) => r1at[tp.id])) r1Done = d;
      if (!goalBy || d <= goalBy) r2ByGoal = r2done.size;
    }
    return { days, r1Done, r2ByGoal, total: all.length };
  }
  // Rounds already ticked on a day (for today and the past).
  const doneOn = (d) => all.flatMap((tp) => ["r1", "r2"].filter((r) => P[tp.id]?.[r]?.done && P[tp.id][r].at === d).map((round) => ({ topic: tp, round, done: P[tp.id][round] })));
  function planFor(d) {
    const info = dayInfo(d, ctx);
    return { info, todo: d < today ? [] : simulate(d).days[d] || [], done: d > today ? [] : doneOn(d), makeup: makeup(d) };
  }
  const projection = () => { const s = simulate(addDays(goalBy || today, 120)); return { r1Done: s.r1Done, r2ByGoal: s.r2ByGoal, total: s.total }; };
  return { planFor, simulate, projection, makeup, dayCap, roundsDoneOn };
}
