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
function dayTemplate(day) {
  const T = (h, m = 0) => h * 60 + m;
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
  if (FOOTBALL_DAYS.includes(day)) {
    blocks.push({ start: T(17), end: T(18, 30), type: "fixed", label: "⚽ Football training (SCUFA)" });
    blocks.push({ start: T(18, 30), end: T(19), type: "rest", label: "Shower & dinner" });
    blocks.push({ start: T(19), end: T(21, 15), type: "study", label: "Study" });
    blocks.push({ start: T(21, 15), end: T(21, 45), type: "fixed", label: "🐶 Nico evening + wind down" });
    blocks.push({ start: T(22), end: T(22, 1), type: "fixed", label: "😴 Lights out (wake ~5:45 = 7h45 sleep)" });
  } else {
    blocks.push({ start: T(16, 45), end: T(18, 30), type: "study", label: "Study" });
    blocks.push({ start: T(18, 30), end: T(19, 15), type: "rest", label: "Dinner" });
    blocks.push({ start: T(19, 15), end: T(21), type: "study", label: "Study (or World Cup if caught up)" });
    blocks.push({ start: T(21), end: T(21, 45), type: "fixed", label: "🐶 Nico evening + free time / football watch" });
    blocks.push({ start: T(22), end: T(22, 1), type: "fixed", label: "😴 Lights out (wake ~5:45 = 7h45 sleep)" });
  }
  return { windows: blocks.filter(b => b.type === "study"), fixed: blocks, note: "" };
}

function fmt(min) {
  let h = Math.floor(min / 60), m = min % 60;
  const ap = h >= 12 ? "pm" : "am";
  let hh = h % 12; if (hh === 0) hh = 12;
  return m === 0 ? `${hh}${ap}` : `${hh}:${String(m).padStart(2, "0")}${ap}`;
}

// Greedily slot pending homework (sorted earliest-due first) into study windows.
// hwItems: [{subject, task, mins, due}]  -> returns {blocks, overflow}
function buildDayPlan(day, hwItems) {
  const tpl = dayTemplate(day);
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

// Export for both browser (ES module) and Node (test)
export { buildDayPlan, dayTemplate, FOOTBALL_DAYS };
