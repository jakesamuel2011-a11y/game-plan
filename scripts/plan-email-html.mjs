// =============================================================
//  plan-email-html.mjs — builds the revision plan emails (pure, no Firebase).
//  weeklyEmail(): Sunday morning, every day of the coming week in detail.
//  fortnightEmail(): every other Sunday, an overview of the next two weeks.
//  Both use revision/dayplan.js, the same planner as the app's Today tab.
// =============================================================
import { makePlanner, dayInfo, addDays, TOPIC_MINS } from "../revision/dayplan.js";

const APP_URL = "https://jakesamuel2011-a11y.github.io/game-plan/";
const SUBJ = { Humanities: "History", EM: "EM", Bio: "Biology", Math: "Math", English: "English", Physics: "Physics", Chem: "Chemistry" };
const EMOJI = { Humanities: "🏛️", EM: "🌍", Bio: "🧬", Math: "📐", English: "✍️", Physics: "⚡", Chem: "⚗️" };
const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d) => { const x = new Date(d + "T00:00:00Z"); return `${DOW[x.getUTCDay()]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const round = (r) => (r === "r1" ? "Round 1" : "Round 2");
const wrap = (title, sub, body) => `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1b232c">
  <div style="background:#0a7d3c;color:#fff;padding:14px 18px;border-radius:12px"><div style="font-size:19px;font-weight:800">${title}</div><div style="opacity:.85;font-size:13px">${sub}</div></div>
  ${body}
  <p style="font-size:12px;color:#7a8a96;margin-top:18px">Topics that aren't done move to the next day, so the <a href="${APP_URL}">Today tab</a> always has the latest plan. Mark trips or busy days under 🚫 No-revision days, and holidays under 🎉 Holidays. Sent automatically.</p></div>`;

// data: { subjects, progress, tests, ctx, today, goalBy }
function setup(data) {
  const pl = makePlanner(data);
  const all = data.subjects.flatMap((s) => s.topics || []);
  const n = (r) => all.filter((t) => data.progress[t.id]?.[r]?.done).length;
  return { pl, total: all.length, r1: n("r1"), r2: n("r2") };
}
const statusHtml = (s, data) => {
  const pr = s.pl.projection();
  return `<p style="font-size:14px;line-height:1.6"><b>Progress so far:</b> Round 1 ${s.r1}/${s.total} topics · Round 2 ${s.r2}/${s.total}.<br>
  <b>At this pace:</b> Round 1 of every topic ${pr.r1Done ? `done by ${fmt(pr.r1Done)}` : "not finished yet"}; ${pr.r2ByGoal} of ${s.total} Round 2s by ${fmt(data.goalBy)} (goal: 2 full revisions).</p>`;
};
const testsHtml = (data, from, to) => {
  const ts = (data.tests || []).filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  return ts.length ? `<p style="font-size:14px"><b>📝 Tests:</b> ${ts.map((x) => `${esc(x.name)} (${fmt(x.date)})`).join(" · ")}</p>` : "";
};
const topicLine = (x) => `${EMOJI[x.topic.subject] || ""} <b>${esc(SUBJ[x.topic.subject] || x.topic.subject)}</b> · ${esc(x.topic.name)} <span style="color:#7a8a96">(${round(x.round)})</span>`;

// Sunday morning: every day of the coming week (Mon–Sun). `from` (optional) starts it on
// another day, e.g. tomorrow, for the first email; it then runs to the next Sunday.
export function weeklyEmail(data, from) {
  const s = setup(data);
  const mon = from || addDays(data.today, ((8 - new Date(data.today + "T00:00:00Z").getUTCDay()) % 7) || 7); // next Monday
  let sun = mon; while (new Date(sun + "T00:00:00Z").getUTCDay() !== 0) sun = addDays(sun, 1);
  const sim = s.pl.simulate(sun).days;
  const lastMon = addDays(mon, -7), lastSun = addDays(mon, -1); // the 7 days before
  const lastWeek = s.pl.roundsDoneOn(lastMon, lastSun);
  let rows = "", count = 0;
  for (let d = mon; d <= sun; d = addDays(d, 1)) {
    const info = dayInfo(d, data.ctx), todo = sim[d] || [];
    count += todo.length;
    const what = info.kind === "sunday" ? "Rest day 🎉" : todo.length ? todo.map(topicLine).join("<br>") : info.kind === "off" || info.kind === "tournament" ? "No revision" : "Nothing left to plan";
    rows += `<tr><td style="padding:8px;border-top:1px solid #e3e8ec;vertical-align:top;white-space:nowrap"><b>${fmt(d)}</b><div style="font-size:12px;color:#7a8a96">${esc(info.label)}${todo.length ? ` · ~${todo.length * TOPIC_MINS} min` : ""}</div></td><td style="padding:8px;border-top:1px solid #e3e8ec;font-size:14px;line-height:1.6">${what}</td></tr>`;
  }
  const body = `<p style="font-size:14px">In the last 7 days Jake revised <b>${lastWeek}</b> topic round${lastWeek === 1 ? "" : "s"}. The plan: <b>${count}</b> topics, about ${Math.round(count * TOPIC_MINS / 60 * 10) / 10} hours.</p>
    ${testsHtml(data, mon, addDays(sun, 7))}
    <table style="width:100%;border-collapse:collapse;margin-top:6px">${rows}</table>
    <p style="font-size:14px">Each topic: open it from the Today tab (▶ Practise), do the flashcards and quiz, try an exam question, then tap ✓ Done.</p>
    ${statusHtml(s, data)}`;
  return { subject: `📅 Jake's revision plan · ${fmt(mon)} – ${fmt(sun)} · ${count} topics`, html: wrap("📅 Jake's revision plan this week", `${fmt(mon)} – ${fmt(sun)}`, body) };
}

// Every other Sunday: overview of the next two weeks, grouped by subject.
export function fortnightEmail(data) {
  const s = setup(data);
  const start = addDays(data.today, 1), end = addDays(data.today, 14);
  const sim = s.pl.simulate(end).days;
  let body = "";
  for (let w = 0; w < 2; w++) {
    const a = addDays(start, w * 7), b = addDays(a, 6);
    const items = []; const offDays = [];
    for (let d = a; d <= b; d = addDays(d, 1)) {
      items.push(...(sim[d] || []));
      const info = dayInfo(d, data.ctx);
      if (info.kind === "off" || info.kind === "tournament" || info.kind === "holiday") offDays.push(`${fmt(d)}: ${esc(info.label)}`);
    }
    const bySubj = {};
    items.forEach((x) => { (bySubj[x.topic.subject] ||= []).push(x); });
    body += `<h3 style="margin:18px 0 6px;color:#0a7d3c;font-size:16px">Week ${w + 1}: ${fmt(a)} – ${fmt(b)} · ${items.length} topics</h3>
      <ul style="font-size:14px;line-height:1.7;margin:0;padding-left:18px">${Object.entries(bySubj).map(([k, xs]) => `<li>${EMOJI[k] || ""} <b>${esc(SUBJ[k] || k)}:</b> ${xs.map((x) => `${esc(x.topic.name)}${x.round === "r2" ? " (Round 2)" : ""}`).join("; ")}</li>`).join("") || "<li>Nothing planned</li>"}</ul>
      ${offDays.length ? `<p style="font-size:13px;color:#7a8a96">${offDays.join(" · ")}</p>` : ""}`;
  }
  body = `<p style="font-size:14px">The plan for the next two weeks, by subject. A day-by-day plan comes every Sunday morning.</p>
    ${testsHtml(data, start, end)}${body}${statusHtml(s, data)}`;
  return { subject: `🗓️ Jake's revision: the next 2 weeks (${fmt(start)} – ${fmt(end)})`, html: wrap("🗓️ Jake's revision: the next 2 weeks", `${fmt(start)} – ${fmt(end)}`, body) };
}
