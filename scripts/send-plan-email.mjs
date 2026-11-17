// =============================================================
//  send-plan-email.mjs — revision plan emails to Jake and Mum (MAIL_TO).
//  Called at the end of send-session-email.mjs, which GitHub Actions runs
//  every 15 minutes, so no extra workflow is needed. It only sends when due:
//    • Weekly (every Sunday from 7am India time): each day of the coming week.
//    • Fortnightly (every other Sunday): the next two weeks by subject.
//  What was sent is kept in Firestore mailstate/plans {weeklyFor, fortnightFor}.
//  The very first run sends both at once (rest of this week + next two weeks).
// =============================================================
import { SUBJECTS, REVISION_GOAL } from "../revision/syllabus.js";
import { weeklyEmail, fortnightEmail } from "./plan-email-html.mjs";
import { addDays } from "../revision/dayplan.js";

const SEND_HOUR_IST = 7;
// One-off: send the weekly + fortnightly emails now, planned from this date (today).
// Sent once (mailstate/plans.sentNowFor).
const SEND_NOW_FROM = "2026-11-17";
const docs = async (db, name) => (await db.collection(name).get()).docs;

export async function runPlanEmails(db, transporter) {
  const ist = new Date(Date.now() + 5.5 * 3600e3);
  const today = ist.toISOString().slice(0, 10), isSunday = ist.getUTCDay() === 0, hour = ist.getUTCHours();
  const stateRef = db.collection("mailstate").doc("plans");
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() : null;
  const first = !state;
  const weeklyDue = first || (isSunday && hour >= SEND_HOUR_IST && state.weeklyFor !== today);
  const fortnightDue = first || (isSunday && hour >= SEND_HOUR_IST && (!state.fortnightFor || today >= addDays(state.fortnightFor, 14)));
  const nowDue = SEND_NOW_FROM && state && state.sentNowFor !== SEND_NOW_FROM && today === SEND_NOW_FROM;
  if (!weeklyDue && !fortnightDue && !nowDue) { console.log("Plan emails: nothing due."); return; }

  const progress = Object.fromEntries((await docs(db, "revprogress")).map((d) => [d.id, d.data()]));
  const tests = (await docs(db, "revtests")).map((d) => d.data());
  const ctx = {
    tournaments: (await docs(db, "tournaments")).map((d) => d.data()),
    holidays: (await docs(db, "holidays")).map((d) => d.data()),
    footballOff: (await docs(db, "footballoff")).map((d) => d.id),
    resched: Object.fromEntries((await docs(db, "footballresched")).map((d) => [d.id, d.data()])),
    revOff: Object.fromEntries((await docs(db, "revoff")).map((d) => [d.id, d.data()])),
  };
  const data = { subjects: SUBJECTS, progress, tests, ctx, today, goalBy: REVISION_GOAL.by };
  const to = process.env.MAIL_TO;
  if (!to) throw new Error("Missing env var: MAIL_TO");
  const send = (m) => transporter.sendMail({ from: `"Jake's Game Plan" <${process.env.GMAIL_USER}>`, to, subject: m.subject, html: m.html });

  const next = { ...(state || {}) };
  if (nowDue) {
    await send(weeklyEmail(data, today));
    await send(fortnightEmail(data, today));
    next.sentNowFor = SEND_NOW_FROM; console.log("Sent plan emails from", today);
  }
  if (weeklyDue) {
    await send(weeklyEmail(data, first && !isSunday ? addDays(today, 1) : undefined));
    next.weeklyFor = today; console.log("Sent weekly plan email");
  }
  if (fortnightDue) {
    await send(fortnightEmail(data));
    // First run on a weekday: count it from last Sunday, so the next one comes in 2 weeks' Sunday.
    let anchor = today; while (new Date(anchor + "T00:00:00Z").getUTCDay() !== 0) anchor = addDays(anchor, -1);
    next.fortnightFor = anchor; console.log("Sent fortnightly plan email");
  }
  await stateRef.set(next, { merge: true });
}
