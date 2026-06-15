// =============================================================
//  planner.js — pure schedule logic (no Firebase, fully testable)
//  Builds Jake's day around: school 6:30am–4:15pm,
//  football Mon/Wed/Fri 5:00–6:30pm, 6h+ sleep on school nights,
//  weekdays + Saturday morning for work, Sat afternoon + Sunday free.
// =============================================================

// day: 0=Sun, 1=Mon ... 6=Sat  (matches JS Date.getDay())
const FOOTBALL_DAYS = [1, 3, 5];

// Returns the ordered blocks for a day. Study windows are where
// homework gets slotted; everything else is fixed/rest/free.
// Each window: {start, end, type, label}  (times = minutes from midnight)
function dayTemplate(day, opts = {}) {
  const T = (h, m = 0) => h * 60 + m;
  if (opts.holiday) { // marked holiday — day off
    return { rest: true, windows: [], note: "🎉 Holiday — enjoy your day off! Great time for videos or catching up if you like." };
  }
  if (day === 0) { // Sunday — free
    return { rest: true, windows: [], note: "Rest & recharge — fully free day 🎉" };
  }
  if (day === 6) { // Saturday — morning work only
    const study = { start: T(9), end: T(13), type: "study", label: "Study / catch-up" };
    return {
      windows: [study],
      fixed: [
        { start: T(8), end: T(8, 30), type: "fixed", label: "🐶 Nico morning duties + breakfast" },
        study,
        { start: T(13), end: T(13, 30), type: "free", label: "Done! Lunch — afternoon is FREE 🎉" },
      ],
      note: "Finish everything this morning. Saturday afternoon + all Sunday are free.",
    };
  }
  // Weekday
  const blocks = [
    { start: T(6), end: T(6, 30), type: "fixed", label: "🐶 Nico morning duties + breakfast" },
    { start: T(6, 30), end: T(16, 15), type: "fixed", label: "🎒 School" },
    { start: T(16, 15), end: T(16, 45), type: "rest", label: "Snack & rest" },
  ];
  const footballDay = FOOTBALL_DAYS.includes(day);
  const trainingOn = footballDay && !opts.noFootball;
  let note = "";
  if (trainingOn) {
    blocks.push({ start: T(17), end: T(18, 30), type: "fixed", label: "⚽ Football training (SCUFA)" });
    blocks.push({ start: T(18, 30), end: T(19), type: "rest", label: "Shower & dinner" });
    blocks.push({ start: T(19), end: T(21, 15), type: "study", label: "Study" });
    blocks.push({ start: T(21, 15), end: T(21, 45), type: "fixed", label: "🐶 Nico evening + wind down" });
    blocks.push({ start: T(22), end: T(22, 1), type: "fixed", label: "😴 Lights out (wake ~5:45 = 7h45 sleep)" });
  } else {
    // No-football evening (normal Tue/Thu, or a rained-out Mon/Wed/Fri):
    // the 5–6:30 slot is freed up for study so the time isn't wasted.
    if (footballDay && opts.noFootball)
      note = "🌧️ Training cancelled — the 5–6:30 slot is now study time. Get ahead, then relax.";
    blocks.push({ start: T(16, 45), end: T(18, 30), type: "study", label: footballDay ? "Study (training cancelled)" : "Study" });
    blocks.push({ start: T(18, 30), end: T(19, 15), type: "rest", label: "Dinner" });
    blocks.push({ start: T(19, 15), end: T(21), type: "study", label: "Study (or World Cup if caught up)" });
    blocks.push({ start: T(21), end: T(21, 45), type: "fixed", label: "🐶 Nico evening + free time / football watch" });
    blocks.push({ start: T(22), end: T(22, 1), type: "fixed", label: "😴 Lights out (wake ~5:45 = 7h45 sleep)" });
  }
  return { windows: blocks.filter(b => b.type === "study"), fixed: blocks, note };
}

function fmt(min) {
  let h = Math.floor(min / 60), m = min % 60;
  const ap = h >= 12 ? "pm" : "am";
  let hh = h % 12; if (hh === 0) hh = 12;
  return m === 0 ? `${hh}${ap}` : `${hh}:${String(m).padStart(2, "0")}${ap}`;
}

// Greedily slot pending homework (sorted earliest-due first) into study windows.
// hwItems: [{subject, task, mins, due}]  -> returns {blocks, overflow}
function buildDayPlan(day, hwItems, opts = {}) {
  const tpl = dayTemplate(day, opts);
  const queue = hwItems.map(h => ({ ...h, mins: Math.max(10, h.mins || 45) }));
  const out = [];

  if (tpl.rest) {
    return { rest: true, note: tpl.note, blocks: [], overflow: [] };
  }

  // Build a quick lookup of study windows for filling
  const filled = {}; // index in fixed -> array of assigned task strings
  const studyWindows = (tpl.windows || []);
  let wi = 0;
  studyWindows.forEach((w, idx) => { filled[idx] = []; });

  // Fill windows
  studyWindows.forEach((w, idx) => {
    let remaining = w.end - w.start;
    // insert a short break for long windows (>110 min)
    let breakBudget = remaining > 110 ? 10 : 0;
    remaining -= breakBudget;
    while (queue.length && remaining >= 20) {
      const item = queue[0];
      if (item.mins <= remaining) {
        filled[idx].push(`${item.subject}: ${item.task} (${item.mins}m)`);
        remaining -= item.mins;
        queue.shift();
      } else {
        // partial start
        filled[idx].push(`${item.subject}: ${item.task} — start (${remaining}m of ${item.mins}m)`);
        item.mins -= remaining;
        remaining = 0;
      }
    }
    if (breakBudget && filled[idx].length) filled[idx].push("☕ 10-min break");
  });

  // Compose timeline from fixed (full template incl. study windows)
  const full = tpl.fixed || [];
  // map study windows back into full list by matching start time
  full.forEach(b => {
    if (b.type === "study") {
      const idx = studyWindows.findIndex(w => w.start === b.start);
      const tasks = idx >= 0 ? filled[idx] : [];
      out.push({
        time: `${fmt(b.start)}–${fmt(b.end)}`,
        title: b.label,
        sub: tasks.length ? tasks.join(" · ") : "Nothing pending — relax or watch football ⚽",
        kind: tasks.length ? "study" : "free",
      });
    } else {
      out.push({
        time: b.start === b.end || b.end - b.start <= 1 ? fmt(b.start) : `${fmt(b.start)}–${fmt(b.end)}`,
        title: b.label,
        sub: "",
        kind: b.type,
      });
    }
  });

  return { rest: false, note: tpl.note, blocks: out, overflow: queue };
}

// ---------- World Cup match approval logic ----------
// Parse an IST kickoff string like "12:30am IST" or "9pm" -> decimal hour (0..23.99) or null.
function parseISTHour(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return h + min / 60;
}

// Assess a fixture for sleep impact + whether it needs Mum's approval.
// Rule: weekend / daytime matches are auto-OK; only school-night or late/overnight
// kickoffs need approval. Returns {needsApproval, level, text}.
//   level: 'none' | 'school' | 'ok' | 'high' | 'unknown'
function matchAssessment(dateStr, timeStr) {
  if (!dateStr) return { needsApproval: true, level: "unknown", text: "Date unknown — check before approving." };
  const hour = parseISTHour(timeStr);
  const wd = new Date(dateStr + "T00:00:00").getDay(); // 0 Sun .. 6 Sat
  if (hour === null) return { needsApproval: true, level: "unknown", text: "Kickoff time unknown — check before approving." };

  // Daytime kickoff (6:00am–6:59pm)
  if (hour >= 6 && hour < 19) {
    if (wd >= 1 && wd <= 5 && hour >= 6.5 && hour < 16.25)
      return { needsApproval: false, autoDecline: true, level: "school", text: "Kicks off during school hours — can't watch live. Catch the highlights later! 📺" };
    return { needsApproval: false, level: "none", text: "Daytime kickoff — no sleep impact." };
  }
  // Evening / night kickoff (7:00pm–11:59pm): is there school tomorrow?
  if (hour >= 19) {
    const schoolTomorrow = wd >= 0 && wd <= 4; // Sun..Thu nights precede Mon..Fri
    if (schoolTomorrow)
      return hour >= 21
        ? { needsApproval: true, level: "high", text: "⚠️ Late kickoff before a school day — high sleep impact." }
        : { needsApproval: true, level: "ok", text: "School night — would run into the evening." };
    return { needsApproval: false, level: "none", text: "Weekend evening — no school next day." };
  }
  // Overnight / early morning (12:00am–5:59am): is today a school day?
  const schoolToday = wd >= 1 && wd <= 5;
  if (schoolToday)
    return { needsApproval: true, level: "high", text: "⚠️ Overnight/early kickoff on a school day — high sleep impact." };
  return { needsApproval: false, level: "none", text: "Weekend early hours — no school." };
}

// Export for both browser (ES module) and Node (test)
export { buildDayPlan, dayTemplate, FOOTBALL_DAYS, parseISTHour, matchAssessment };
