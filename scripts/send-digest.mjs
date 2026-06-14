// =============================================================
//  send-digest.mjs
//  Runs on a schedule (GitHub Actions) twice a week.
//  Reads the Firestore data and emails a summary to Jake + Mum.
//
//  Needs these environment variables (set as GitHub Secrets):
//    FIREBASE_SERVICE_ACCOUNT  - the full service-account JSON (one line)
//    GMAIL_USER                - the Gmail address it sends FROM
//    GMAIL_APP_PASSWORD        - a Gmail "app password" (not your normal password)
//    MAIL_TO                   - recipients, comma-separated (jake, mum)
// =============================================================
import admin from "firebase-admin";
import nodemailer from "nodemailer";

const VIDEO_GOAL = 29;
const VIDEO_DEADLINE = new Date("2026-12-31");

function need(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing env var: ${name}`); process.exit(1); }
  return v;
}

// ---- init firebase admin ----
const svc = JSON.parse(need("FIREBASE_SERVICE_ACCOUNT"));
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const ymd = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const todayStr = ymd(today);

async function getAll(name) {
  const snap = await db.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function withinDays(ts, days) {
  if (!ts) return false;
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return (today - date) / 864e5 <= days;
}

async function build() {
  const [homework, videos, fixtures, tournaments, routines] = await Promise.all([
    getAll("homework"), getAll("videos"), getAll("fixtures"),
    getAll("tournaments"), getAll("routines"),
  ]);

  // Nico/fitness logs for the last 7 days
  const logDates = [];
  for (let i = 0; i < 7; i++) logDates.push(ymd(new Date(today - i * 864e5)));
  const logSnaps = await Promise.all(logDates.map((d) => db.collection("nicolog").doc(d).get()));
  const logs = {};
  logSnaps.forEach((s, i) => { if (s.exists) logs[logDates[i]] = s.data(); });

  // ---- Homework ----
  const pending = homework.filter((h) => h.status !== "done");
  const overdue = pending.filter((h) => h.due && h.due < todayStr);
  const dueSoon = pending.filter((h) => h.due && h.due >= todayStr).sort((a, b) => a.due.localeCompare(b.due));
  const noDate = pending.filter((h) => !h.due);
  const doneRecently = homework.filter((h) => h.status === "done" && withinDays(h.doneAt, 7));

  // ---- Videos ----
  const vDone = videos.filter((v) => v.stage === "done").length;
  const weeksLeft = Math.max(1, Math.ceil((VIDEO_DEADLINE - today) / (7 * 864e5)));
  const remaining = Math.max(0, VIDEO_GOAL - vDone);
  const perWeek = (remaining / weeksLeft).toFixed(1);
  const uploaded = videos.filter((v) => v.youtube && v.next).length;

  // ---- Football ----
  const upcomingTours = tournaments
    .filter((t) => t.date && t.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const fitness = routines.filter((r) => r.kind === "fitness");
  const nico = routines.filter((r) => r.kind === "nico");
  const countDoneOverWeek = (items) => {
    let total = 0;
    for (const d of logDates) { const log = logs[d] || {}; total += items.filter((r) => log[r.id]).length; }
    return total;
  };
  const fitDone7 = countDoneOverWeek(fitness);
  const nicoDoneToday = nico.filter((r) => (logs[todayStr] || {})[r.id]).length;

  // ---- World Cup ----
  const upcomingMatches = fixtures
    .filter((f) => f.watch && !f.watched && f.date && f.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  // ---- Build HTML ----
  const li = (s) => `<li>${s}</li>`;
  const section = (title, body) =>
    `<h3 style="margin:18px 0 6px;color:#0a7d3c">${title}</h3>${body}`;
  const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

  let html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1b232c">
    <div style="background:#0a7d3c;color:#fff;padding:16px 18px;border-radius:12px">
      <div style="font-size:20px;font-weight:800">⚽ Jake's Game Plan — twice-weekly update</div>
      <div style="opacity:.85;font-size:13px">${today.toDateString()}</div>
    </div>`;

  // Homework
  let hwBody = "";
  if (overdue.length) hwBody += `<p style="color:#c0392b;font-weight:700">⚠️ Overdue (${overdue.length}):</p><ul>${overdue.map((h) => li(`${esc(h.subject)}: ${esc(h.task)} <em>(due ${h.due})</em>`)).join("")}</ul>`;
  if (dueSoon.length) hwBody += `<p style="font-weight:700">📌 Coming up:</p><ul>${dueSoon.slice(0, 8).map((h) => li(`${esc(h.subject)}: ${esc(h.task)} <em>(due ${h.due})</em>`)).join("")}</ul>`;
  if (noDate.length) hwBody += `<p>📝 No due date set: ${noDate.map((h) => esc(h.subject)).join(", ")}</p>`;
  hwBody += `<p style="color:#0a7d3c">✅ ${doneRecently.length} homework task(s) completed in the last 7 days.</p>`;
  if (!pending.length) hwBody = `<p style="color:#0a7d3c;font-weight:700">🎉 No pending homework — all clear!</p>` + hwBody;
  html += section("📚 Homework", hwBody);

  // Videos
  const pct = Math.round((vDone / VIDEO_GOAL) * 100);
  html += section("🎬 GNR Video Goal", `
    <p><b>${vDone}/${VIDEO_GOAL}</b> done (${pct}%) · <b>${remaining}</b> to go · need <b>${perWeek}/week</b> to hit Dec 31.</p>
    <p>${uploaded} video(s) uploaded to both YouTube + NEXT. ${vDone >= 23 ? "🎸 Past the 23-by-Nov-14 mark!" : `Target: 23 by Nov 14 for the concert.`}</p>`);

  // Football
  let fBody = "";
  fBody += upcomingTours.length
    ? `<p>🏆 Next tournament: <b>${esc(upcomingTours[0].name)}</b> on ${upcomingTours[0].date}${upcomingTours[0].location ? " · " + esc(upcomingTours[0].location) : ""}</p>`
    : `<p>No tournaments on the calendar yet.</p>`;
  fBody += `<p>💪 Fitness: ${fitDone7} routine check-offs in the last 7 days.</p>`;
  fBody += `<p>🐶 Nico: ${nicoDoneToday}/${nico.length} duties done today.</p>`;
  html += section("🏆 Football & 🐶 Nico", fBody);

  // World Cup
  html += section("🌍 World Cup watchlist", upcomingMatches.length
    ? `<ul>${upcomingMatches.slice(0, 6).map((f) => li(`${esc(f.match)} — ${f.date}${f.time ? " · " + esc(f.time) : ""}`)).join("")}</ul>`
    : `<p>No upcoming starred matches. Add the ones you want to watch in the app.</p>`);

  html += `<p style="margin-top:20px;font-size:12px;color:#7a8a96">Sent automatically from Jake's Game Plan. Open the app to update anything.</p></div>`;

  return { html, summary: `${pending.length} HW pending, ${vDone}/${VIDEO_GOAL} videos` };
}

async function main() {
  const { html, summary } = await build();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: need("GMAIL_USER"), pass: need("GMAIL_APP_PASSWORD") },
  });
  const info = await transporter.sendMail({
    from: `"Jake's Game Plan" <${process.env.GMAIL_USER}>`,
    to: need("MAIL_TO"),
    subject: `⚽ Game Plan update — ${summary}`,
    html,
  });
  console.log("Sent:", info.messageId);
}

main().catch((e) => { console.error(e); process.exit(1); });
