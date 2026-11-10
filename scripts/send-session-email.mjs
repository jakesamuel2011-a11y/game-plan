// =============================================================
//  send-session-email.mjs
//  Runs every 15 minutes (GitHub Actions, .github/workflows/session-email.yml).
//  When Jake finishes a study session, emails the parent the session details
//  and his answers, ready to paste into Claude for marking. Each session is
//  emailed once (marked emailed: true).
//
//  Env (GitHub Secrets, same as the digest):
//    FIREBASE_SERVICE_ACCOUNT, GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO
//  Optional: MAIL_PARENT — who gets these emails. If unset, the parent's
//  login email from firebase-config.js (PEOPLE) is used, else MAIL_TO.
// =============================================================
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";

const APP_URL = "https://jakesamuel2011-a11y.github.io/game-plan/";
const SUBJ = { Humanities: "History", EM: "Environmental Management", Bio: "Biology", Math: "Maths", English: "English", Physics: "Physics", Chem: "Chemistry" };

function need(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing env var: ${name}`); process.exit(1); }
  return v;
}
function parentEmail() {
  if (process.env.MAIL_PARENT) return process.env.MAIL_PARENT;
  try {
    const cfg = readFileSync(new URL("../firebase-config.js", import.meta.url), "utf8");
    const m = cfg.match(/"([^"\s]+@[^"\s]+)"\s*:\s*"Christabel"/);
    if (m) return m[1];
  } catch (e) { /* fall through */ }
  return need("MAIL_TO");
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(need("FIREBASE_SERVICE_ACCOUNT"))) });
const db = admin.firestore();
const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const time = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";

async function main() {
  const snap = await db.collection("studysessions").where("status", "==", "done").get();
  const todo = snap.docs.filter((d) => d.data().emailed !== true);
  if (!todo.length) { console.log("No finished sessions to email."); return; }
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: need("GMAIL_USER"), pass: need("GMAIL_APP_PASSWORD") } });
  const to = parentEmail();

  for (const d of todo) {
    const s = d.data();
    const subjects = (s.subjects || []).map((k) => SUBJ[k] || k).join(", ");
    // One grading set per subject (older sessions: a single gradeId).
    const ids = s.grades ? Object.values(s.grades) : (s.gradeId ? [s.gradeId] : []);
    const sets = [];
    for (const id of ids) { const gs = await db.collection("revgrade").doc(id).get(); if (gs.exists) sets.push(gs.data()); }
    const n = sets.reduce((t, g) => t + (g.items?.length || 0), 0);
    let html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1b232c">
      <div style="background:#0a7d3c;color:#fff;padding:14px 18px;border-radius:12px">
        <div style="font-size:19px;font-weight:800">📖 Jake finished a study session</div>
        <div style="opacity:.85;font-size:13px">${esc(s.date)} · ${time(s.start)}–${time(s.end)}</div>
      </div>
      <ul style="line-height:1.7;font-size:14px">
        <li><b>Subjects:</b> ${esc(subjects)}</li>
        <li><b>Time:</b> ${s.mins || "?"} minutes</li>
        <li><b>Confidence:</b> ${s.conf || "?"}/5</li>
        ${s.notes ? `<li><b>Notes:</b> “${esc(s.notes)}”</li>` : ""}
        <li><b>Written answers:</b> ${n}</li>
      </ul>`;
    if (n) {
      html += `<p style="font-size:14px"><b>To mark them:</b> copy each grey box (one per subject) into a Claude chat. Then paste Claude's feedback and the score into the app: <b>Revision ▸ Ready to grade</b> (or <b>Progress ▸ Study sessions</b>), and Jake will see it there.</p>`;
      for (const g of sets) {
        html += `<h3 style="margin:18px 0 6px;color:#0a7d3c;font-size:16px">${esc(SUBJ[g.subject] || g.subject)} · ${g.items?.length || 0} answer(s)</h3>
        <pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:13px;background:#f6f8f9;border:1px solid #dfe6ea;border-radius:8px;padding:10px">${esc(g.prompt || "")}</pre>`;
      }
    } else {
      html += `<p style="font-size:14px">No written answers this session (flashcards, quizzes or reading only).</p>`;
    }
    html += `<p style="font-size:12px;color:#7a8a96"><a href="${APP_URL}">Open Jake's Game Plan</a> · sent automatically when a session ends.</p></div>`;

    await transporter.sendMail({
      from: `"Jake's Game Plan" <${process.env.GMAIL_USER}>`,
      to,
      subject: `📖 Jake's session done: ${subjects} · ${s.mins || "?"} min${n ? ` · ${n} answer${n > 1 ? "s" : ""} to mark` : ""}`,
      html,
    });
    await d.ref.update({ emailed: true, emailedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log("Emailed session", d.id);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
