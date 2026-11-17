// Dev only: print sample plan emails from fake data (run with JavaScriptCore: jsc -m dev/plan-email-test.mjs).
import { SUBJECTS, REVISION_GOAL } from "../revision/syllabus.js";
import { weeklyEmail, fortnightEmail } from "../scripts/plan-email-html.mjs";
const progress = { "em-rocks": { r1: { done: true, at: "2026-11-17", conf: 4 } }, "bio-plants": { r1: { done: true, at: "2026-11-12", conf: 4 } }, "hist-kq4": { r1: { done: true, at: "2026-11-01", conf: 3 } } };
const ctx = { tournaments: [{ date: "2026-12-05", name: "U15 Cup" }], holidays: [{ from: "2026-12-21", to: "2027-01-03", name: "Christmas break" }], footballOff: [], resched: {}, revOff: { "2026-11-23": { reason: "School excursion" }, "2026-11-24": { reason: "School excursion" }, "2026-11-25": { reason: "School excursion" }, "2026-11-26": { reason: "School excursion" }, "2026-11-27": { reason: "School excursion" }, "2026-11-28": { reason: "School excursion" }, "2026-12-18": { reason: "Christmas break: busy day" } } };
const tests = [{ name: "Physics: Motion", date: "2026-12-02", topics: ["phys-motion"] }];
const data = (today) => ({ subjects: SUBJECTS, progress, tests, ctx, today, goalBy: REVISION_GOAL.by });
for (const [name, m] of [["weekly", weeklyEmail(data("2026-11-29"))], ["fortnight", fortnightEmail(data("2026-11-29"))], ["kickoff", weeklyEmail(data("2026-11-17"), "2026-11-18")]])
  print("=====" + name + "\n<h4 style='font-family:Arial'>Subject: " + m.subject + "</h4>" + m.html);
