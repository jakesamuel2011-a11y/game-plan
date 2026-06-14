// =============================================================
//  send-monthly.mjs — monthly progress report to Jake + Christabel.
//  Runs on the 1st of each month (GitHub Actions) and reports the
//  month just finished: form, streaks, badges, and goal progress.
//  Uses the same secrets as the weekly digest.
// =============================================================
import admin from "firebase-admin";
import nodemailer from "nodemailer";

const VIDEO_GOAL = 29;
const SEASON = { videos: 29, hw: 100, fitness: 120, nico: 120 };

const QUOTES = [
  ["Success is no accident. It is hard work, perseverance, sacrifice and love of what you're doing.", "Pelé"],
  ["The day you think there's no improvement to be made is a sad one for any player.", "Lionel Messi"],
  ["Magic is sometimes very close to nothing at all.", "Zinedine Zidane"],
  ["It took me 17 years to become an overnight success.", "Lionel Messi"],
];

function need(name) { const v = process.env[name]; if (!v) { console.error("Missing env var: " + name); process.exit(1); } return v; }

const svc = JSON.parse(need("FIREBASE_SERVICE_ACCOUNT"));
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const ymd = (d) => d.toISOString().slice(0, 10);
const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const within = (ts, a, b) => { if (!ts) return false; const d = ts.toDate ? ts.toDate() : new Date(ts); return d >= a && d <= b; };

async function getAll(name) { const s = await db.collection(name).get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }

async function build() {
  const now = new Date();
  const ref = new Date(now); ref.setDate(0);                 // last day of previous month
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59);
  const monthName = monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });

  const [videos, homework, weeklog] = await Promise.all([getAll("videos"), getAll("homework"), getAll("weeklog")]);

  const videosMonth = videos.filter((v) => v.stage === "done" && within(v.doneAt, monthStart, monthEnd)).length;
  const videosTotal = videos.filter((v) => v.stage === "done").length;

  const hwOnTime = (h) => h.status === "done" && (!h.due || !(h.doneAt && h.doneAt.toDate) || ymd(h.doneAt.toDate()) <= h.due);
  const hwMonth = homework.filter((h) => hwOnTime(h) && within(h.doneAt, monthStart, monthEnd)).length;
  const hwTotal = homework.filter(hwOnTime).length;

  const ms = ymd(monthStart), me = ymd(monthEnd);
  const weeksMonth = weeklog.filter((w) => w.weekStart >= ms && w.weekStart <= me);
  const weeksOnTarget = weeksMonth.filter((w) => w.onTarget).length;
  const avgForm = weeksMonth.length ? (weeksMonth.reduce((s, w) => s + (w.rating || 0), 0) / weeksMonth.length).toFixed(1) : "—";
  const fitMonth = weeksMonth.reduce((s, w) => s + (w.fitness || 0), 0);

  // season totals + blended %
  const seasonFit = weeklog.reduce((s, w) => s + (w.fitness || 0), 0);
  const seasonNico = weeklog.reduce((s, w) => s + (w.nicoDays || 0), 0);
  const fr = (a, b) => Math.min(1, a / b);
  const overall = Math.round(((fr(videosTotal, SEASON.videos) + fr(hwTotal, SEASON.hw) + fr(seasonFit, SEASON.fitness) + fr(seasonNico, SEASON.nico)) / 4) * 100);

  // streak + badges
  const sorted = [...weeklog].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  let streak = 0; for (const w of sorted) { if (w.onTarget) streak++; else break; }
  const everOnTarget = weeklog.some((w) => w.onTarget);
  const everClean = weeklog.some((w) => (w.rating || 0) >= 10);
  const streakBadges = [["⚽ Kickoff", everOnTarget], ["🔥 In Form", streak >= 3], ["🧤 Clean Sheet", everClean], ["Ⓒ Captain's Armband", streak >= 6]];
  const tiers = [["Academy", 20], ["Reserves", 40], ["First Team", 60], ["Star Player", 80], ["Legend", 100]];
  const tierName = tiers.filter(([, p]) => overall >= p).slice(-1)[0]?.[0] || "Academy (in progress)";
  const badgesUnlocked = streakBadges.filter(([, on]) => on).length + tiers.filter(([, p]) => overall >= p).length;

  const [qt, qa] = QUOTES[monthStart.getMonth() % QUOTES.length];
  const hr = `<hr style="border:none;border-top:1px solid #dfe6ea;margin:20px 0 0" />`;
  const li = (s) => `<li>${s}</li>`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1b232c">
    <div style="background:#0a7d3c;color:#fff;padding:16px 18px;border-radius:12px">
      <div style="font-size:20px;font-weight:800">⚽ Jake's monthly report — ${esc(monthName)}</div>
      <div style="opacity:.85;font-size:13px">How the month went, and where the season's at</div>
    </div>
    <div style="background:#f2f6f4;border:1px solid #d8e6df;border-radius:10px;padding:12px 14px;margin-top:14px;font-size:14px">
      <b>📋 Month at a glance</b>
      <ul style="margin:8px 0 0;padding-left:18px;line-height:1.6">
        ${li(`🏅 Form: avg ${avgForm}/10 · ${weeksOnTarget}/${weeksMonth.length} weeks on target`)}
        ${li(`🎬 Videos: ${videosMonth} this month · ${videosTotal}/${VIDEO_GOAL} total`)}
        ${li(`📚 Homework done on time: ${hwMonth} this month`)}
        ${li(`💪 Fitness sessions: ${fitMonth} this month`)}
        ${li(`🏆 Season progress: ${overall}% — ${esc(tierName)} · ${badgesUnlocked} badge(s) unlocked`)}
      </ul>
    </div>
    ${hr}<h3 style="margin:16px 0 6px;color:#0a7d3c">🏆 Badges</h3>
    <p style="font-size:14px">${streakBadges.map(([n, on]) => `${on ? "✅" : "🔒"} ${n}`).join("&nbsp;&nbsp;")}</p>
    <p style="font-size:14px">Career ladder: <b>${esc(tierName)}</b> (${overall}% of season goals). Current streak: <b>${streak}</b> week(s) 🔥</p>
    ${hr}<h3 style="margin:16px 0 6px;color:#0a7d3c">⚡ Keep going</h3>
    <p style="font-size:14px;font-style:italic;color:#33484f">“${esc(qt)}” — ${esc(qa)}</p>
    <p style="margin-top:18px;font-size:12px;color:#7a8a96">Sent automatically from Jake's Game Plan.</p>
  </div>`;

  return { html, subject: `⚽ Jake's monthly report — ${monthName} (${overall}% of season goals)` };
}

async function main() {
  const { html, subject } = await build();
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: need("GMAIL_USER"), pass: need("GMAIL_APP_PASSWORD") } });
  const info = await transporter.sendMail({ from: `"Jake's Game Plan" <${process.env.GMAIL_USER}>`, to: need("MAIL_TO"), subject, html });
  console.log("Sent:", info.messageId);
}
main().catch((e) => { console.error(e); process.exit(1); });
