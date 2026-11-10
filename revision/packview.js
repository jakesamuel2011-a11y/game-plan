// =============================================================
//  revision/packview.js — renders one practice pack (pure UI, no Firebase).
//
//  renderPack(root, pack, store, opts)
//    pack  = parsed revision/packs/<id>.json
//    store = { state, save() }  — state is a plain object this module reads
//            and mutates; call save() after each change (caller persists it).
//            state: { answers:{key:text}, cards:{key:"got"|"again"},
//                     quizzes:[{d, unit, score, n}], drills:{key:date} }
//    opts  = { unit }  — pre-select a unit chip (e.g. "kq4")
//            { submit(key), submitted(key) } — optional: shows a Submit button
//            under each written answer (Jake only)
// =============================================================

const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function h(tag, attrs = {}, html) {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === "on") for (const ev in attrs.on) n.addEventListener(ev, attrs.on[ev]);
    else if (attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  if (html !== undefined) n.innerHTML = html;
  return n;
}

// Modes a pack supports, in display order.
export function packModes(pack) {
  const m = [["learn", "How it's marked"]];
  if (pack.flashcards?.length) m.push(["cards", "Flashcards"]);
  if (pack.quiz?.length) m.push(["quiz", pack.quizTitle || "Quiz"]);
  else if (pack.timeline?.length) m.push(["quiz", "Date quiz"]);
  if (pack.exam?.length) m.push(["exam", pack.exam.some(q => q.model) ? "Exam questions + model answers" : "Exam questions + mark schemes"]);
  if (pack.dataPractice) m.push(["data", "Reading data"]);
  if (pack.planner) m.push(["plan", "6-mark plans"]);
  if (pack.debates?.length) m.push(["drill", "10-mark drill"]);
  if (pack.timeline?.length) m.push(["timeline", "Timeline"]);
  return m;
}

// Summary numbers for progress displays.
export function packStats(pack, state, unit) {
  const inUnit = (x) => !unit || !x.unit || x.unit === unit;
  const cards = (pack.flashcards || []).map((c, i) => ({ ...c, key: "c" + i })).filter(inUnit);
  const got = cards.filter(c => state.cards?.[c.key] === "got").length;
  const exam = (pack.exam || []).map((q, i) => ({ ...q, key: "eq" + i })).filter(inUnit);
  const written = exam.filter(q => (state.answers?.[q.key] || "").trim().length > 20).length;
  const qz = (state.quizzes || []).filter(q => !unit || q.unit === unit || q.unit === "all");
  const best = qz.length ? Math.max(...qz.map(q => Math.round(100 * q.score / q.n))) : null;
  return { cards: cards.length, got, exam: exam.length, written, bestQuizPct: best };
}

// Every written answer Jake has typed in this pack (exam, data and 6-mark
// plan questions), with the question and its mark scheme / model answer, so
// the work can be sent for grading. `key` matches state.answers (plans: "pl<i>").
export function writtenWork(pack, state) {
  const A = state.answers || {};
  const unitName = (k) => (pack.units || []).find(u => u.key === k)?.name || "";
  const out = [];
  const exam = (q, key, kind) => {
    const answer = (A[key] || "").trim();
    if (answer.length < 15) return;
    const guide = q.model
      ? "Model answer: " + q.model.join(" ") + (q.why ? "\nWhy it scores: " + q.why : "")
      : "Mark scheme points: " + (q.points || []).join("; ") + (q.note ? "\nNote: " + q.note : "");
    out.push({ key, kind, pack: pack.title, unit: unitName(q.unit), q: q.q, marks: q.marks, answer, guide });
  };
  (pack.exam || []).forEach((q, i) => exam(q, "eq" + i, "exam"));
  (pack.dataPractice?.questions || []).forEach((q, i) => exam({ ...q, q: (pack.dataPractice.chartTitle ? `[Chart: ${pack.dataPractice.chartTitle}] ` : "") + q.q }, "dp" + i, "data"));
  const p = pack.planner;
  (p?.statements || []).forEach((st, i) => {
    const labs = ["For 1", "For 2", "Against 1", "Against 2", "Conclusion"];
    const parts = labs.map((l, j) => [l, (A[`pl${i}-${j}`] || "").trim()]).filter(([, t]) => t);
    if (parts.map(([, t]) => t).join("").length < 15) return;
    out.push({
      key: "pl" + i, kind: "plan", pack: pack.title, unit: "", q: `“${st.text}” ${p.task}`, marks: 6,
      answer: parts.map(([l, t]) => `${l}: ${t}`).join("\n"),
      guide: `Points that would score. For: ${st.for.join("; ")}. Against: ${st.against.join("; ")}. Example conclusion: ${st.conclusion}`,
    });
  });
  return out;
}

export function renderPack(root, pack, store, opts = {}) {
  const S = store.state;
  S.answers ||= {}; S.cards ||= {}; S.quizzes ||= []; S.drills ||= {};
  const modeKeys = packModes(pack).map(([k]) => k);
  let mode = modeKeys.includes(opts.mode) ? opts.mode : modeKeys.includes("cards") ? "cards" : "learn";
  let unit = opts.unit || "all";
  const inUnit = (x) => unit === "all" || !x.unit || x.unit === unit;
  const unitName = (k) => (pack.units || []).find(u => u.key === k)?.name || "";

  root.innerHTML = "";
  root.classList.add("pk");
  const head = h("div", { class: "pk-head" }, `<div class="pk-title">${esc(pack.title)}</div><div class="muted small">${esc(pack.sub || "")}${pack.test ? ` · Test: ${esc(pack.test)}` : ""}</div>`);
  const modesBar = h("div", { class: "pk-modes" });
  const unitsBar = h("div", { class: "pk-units" });
  const body = h("div", { class: "pk-body" });
  root.append(head, modesBar, unitsBar, body);

  packModes(pack).forEach(([k, label]) => {
    const b = h("button", { class: "pk-mode", type: "button", "data-m": k, on: { click: () => { mode = k; draw(); } } }, esc(label));
    modesBar.appendChild(b);
  });
  if (pack.units?.length) {
    [{ key: "all", name: "All" }, ...pack.units].forEach(u => {
      unitsBar.appendChild(h("button", { class: "chip", type: "button", "data-u": u.key, on: { click: () => { unit = u.key; draw(); } } }, esc(u.name)));
    });
  }

  function draw() {
    modesBar.querySelectorAll(".pk-mode").forEach(b => b.classList.toggle("on", b.dataset.m === mode));
    unitsBar.querySelectorAll(".chip").forEach(b => b.classList.toggle("on", b.dataset.u === unit));
    unitsBar.classList.toggle("hidden", !pack.units?.length || mode === "learn");
    body.innerHTML = "";
    ({ learn, cards, quiz, exam, data, plan, drill, timeline })[mode]();
  }

  // ---------- shared bits ----------
  function textBox(key, placeholder) {
    const t = h("textarea", { class: "pk-text", placeholder });
    t.value = S.answers[key] || "";
    t.addEventListener("input", () => { S.answers[key] = t.value; store.save(); });
    return t;
  }
  // "Submit answer": sends this one answer to Mum for marking. Goes back to
  // "Submit" if Jake edits the answer afterwards.
  function submitBtn(card, key) {
    if (!opts.submit) return;
    const b = h("button", { class: "btn primary pk-submit", type: "button" });
    const set = () => { const done = opts.submitted(key); b.textContent = done ? "✓ Submitted for marking" : "Submit answer"; b.classList.toggle("done", done); };
    b.addEventListener("click", async () => {
      if (opts.submitted(key)) return set();
      b.disabled = true; b.textContent = "Sending…";
      try { await opts.submit(key); } catch (e) { alert("Couldn't submit: " + e.message); }
      b.disabled = false; set();
    });
    card.addEventListener("input", set);
    set();
    card.appendChild(b);
  }
  function reveal(label, target) {
    target.hidden = true;
    const b = h("button", { class: "btn tiny ghost", type: "button", on: { click: () => { target.hidden = !target.hidden; b.textContent = target.hidden ? label : "Hide"; } } }, esc(label));
    return b;
  }
  function msBox(title, items, note, paras) {
    let html = `<div class="pk-ms-h">${esc(title)}</div>`;
    if (items?.length) html += `<ul>${items.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    if (paras?.length) html += paras.map(p => `<p>${esc(p)}</p>`).join("");
    if (note) html += `<p class="pk-note">${esc(note)}</p>`;
    return h("div", { class: "pk-ms" }, html);
  }
  function examCard(q, key) {
    const c = h("div", { class: "card pk-eq" });
    c.appendChild(h("div", { class: "row-between" }, `<div class="pk-q">${esc(q.q)}</div><span class="pill soon">${q.marks} mark${q.marks > 1 ? "s" : ""}</span>`));
    if (q.unit && unit === "all") c.appendChild(h("div", { class: "tag" }, esc(unitName(q.unit))));
    c.appendChild(textBox(key, `Write your answer first (${q.marks} mark${q.marks > 1 ? "s" : ""}), then check`));
    submitBtn(c, key);
    const ms = q.model
      ? msBox("Model answer", null, q.why ? "Why it scores: " + q.why : "", q.model)
      : msBox("Mark scheme points", q.points, q.note);
    c.append(reveal(q.model ? "Show model answer" : "Check against mark scheme", ms), ms);
    return c;
  }

  // ---------- modes ----------
  function learn() {
    if (pack.strategyIntro) body.appendChild(h("p", { class: "muted small" }, esc(pack.strategyIntro)));
    (pack.strategy || []).forEach(s => {
      body.appendChild(h("div", { class: "card" + (s.key ? " pk-key" : "") }, `<b>${esc(s.title)}</b><ul class="pk-ul">${s.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`));
    });
    if (pack.commandWords?.length) {
      body.appendChild(h("div", { class: "card" }, `<b>Command words</b><dl class="pk-cw">${pack.commandWords.map(([w, m]) => `<dt>${esc(w)}</dt><dd>${esc(m)}</dd>`).join("")}</dl>`));
    }
  }

  function cards() {
    const all = (pack.flashcards || []).map((c, i) => ({ ...c, key: "c" + i })).filter(inUnit);
    let deck = shuffle(all.filter(c => S.cards[c.key] !== "got"));
    const known = () => all.filter(c => S.cards[c.key] === "got").length;
    body.appendChild(h("p", { class: "muted small" }, esc(pack.flashIntro || "Answer out loud, then flip.")));
    const card = h("div", { class: "pk-flip", role: "button", tabindex: "0" });
    const btns = h("div", { class: "pk-btns" });
    const meta = h("div", { class: "muted small pk-meta" });
    const bar = h("div", { class: "progress" }, `<div class="bar"></div>`);
    const again = h("button", { class: "btn ghost", type: "button" }, "Not yet");
    const got = h("button", { class: "btn primary", type: "button" }, "Got it");
    const restart = h("button", { class: "btn tiny ghost", type: "button" }, "Reset these cards");
    btns.append(again, got);
    body.append(card, btns, meta, bar, restart);
    let flipped = false;
    function show() {
      flipped = false; card.classList.remove("on");
      if (!deck.length) {
        card.innerHTML = `<div class="pk-face">🎉 You know all ${all.length} cards here.<div class="muted small">Switch unit or try the exam questions.</div></div>`;
        again.disabled = got.disabled = true;
      } else {
        const c = deck[0];
        card.innerHTML = `<div class="pk-face"><div class="pk-front">${esc(c.front)}</div><div class="muted small">${c.unit && unit === "all" ? esc(unitName(c.unit)) + " · " : ""}tap to flip</div></div>`;
        again.disabled = got.disabled = false;
      }
      meta.textContent = `${deck.length} left this round · ${known()} / ${all.length} known`;
      bar.querySelector(".bar").style.width = (all.length ? 100 * known() / all.length : 0) + "%";
    }
    const flip = () => {
      if (!deck.length) return;
      const c = deck[0]; flipped = !flipped; card.classList.toggle("on", flipped);
      card.innerHTML = flipped
        ? `<div class="pk-face"><div class="pk-front sm">${esc(c.front)}</div><div class="pk-back">${esc(c.back)}</div></div>`
        : `<div class="pk-face"><div class="pk-front">${esc(c.front)}</div><div class="muted small">tap to flip</div></div>`;
    };
    card.addEventListener("click", flip);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    got.onclick = () => { const c = deck.shift(); S.cards[c.key] = "got"; store.save(); show(); };
    again.onclick = () => {
      const c = deck.shift(); S.cards[c.key] = "again"; store.save();
      deck.splice(Math.min(deck.length, 3 + Math.floor(Math.random() * 3)), 0, c); show();
    };
    restart.onclick = () => { all.forEach(c => delete S.cards[c.key]); store.save(); deck = shuffle(all); show(); };
    show();
  }

  function logQuiz(score, n) { S.quizzes.push({ d: today(), unit, score, n }); store.save(); }

  function quiz() {
    if (pack.quiz?.length) return mcq();
    // Date quiz built from the timeline
    const events = (pack.timeline || []).filter(inUnit);
    const years = [...new Set((pack.timeline || []).map(e => e.year))].sort();
    const qs = shuffle(events).slice(0, 10);
    let i = 0, score = 0;
    body.appendChild(h("p", { class: "muted small" }, esc(pack.quizIntro || "Pick the year.")));
    const box = h("div", { class: "card" });
    const next = h("button", { class: "btn primary", type: "button" }, "Next");
    body.append(box, next);
    function show() {
      if (i >= qs.length) {
        logQuiz(score, qs.length);
        box.innerHTML = `<div class="pk-big">${score} / ${qs.length}</div><div>${score >= 8 ? "Strong. Dates are locked in." : score >= 5 ? "Good base. Go again and beat it." : "Worth another go. Check the Timeline first."}</div>`;
        next.textContent = "Play again"; next.onclick = () => { body.innerHTML = ""; quiz(); };
        return;
      }
      const e = qs[i];
      const near = shuffle(years.filter(y => y !== e.year && Math.abs(y - e.year) <= 6)).slice(0, 3);
      const opts = shuffle([e.year, ...near]);
      box.innerHTML = `<div class="muted small">Question ${i + 1} of ${qs.length} · score ${score}</div><div class="pk-q">When? ${esc(e.event)}</div>`;
      const grid = h("div", { class: "pk-opts" });
      const fb = h("div", { class: "muted small" });
      opts.forEach(y => grid.appendChild(h("button", {
        class: "pk-opt", type: "button", on: {
          click: (ev) => {
            if (grid.dataset.done) return; grid.dataset.done = 1;
            if (y === e.year) { score++; ev.currentTarget.classList.add("right"); fb.textContent = "Correct."; }
            else { ev.currentTarget.classList.add("wrong"); fb.textContent = `It was ${e.year}.`; [...grid.children].forEach(b => { if (+b.textContent === e.year) b.classList.add("right"); }); }
          }
        }
      }, String(y))));
      box.append(grid, fb);
      next.textContent = "Next"; next.onclick = () => { i++; show(); };
    }
    show();
  }

  function mcq() {
    const qs = pack.quiz;
    let right = 0, done = 0;
    body.appendChild(h("p", { class: "muted small" }, esc(pack.quizIntro || "")));
    const score = h("div", { class: "pk-big" }, "0 / 0");
    body.appendChild(score);
    qs.forEach((q, i) => {
      const c = h("div", { class: "card" }, `<div class="pk-q"><span class="muted">${i + 1}.</span> ${esc(q.q)}</div>`);
      const grid = h("div", { class: "pk-opts wide" });
      const why = h("div", { class: "pk-why" }, esc(q.why || "")); why.hidden = true;
      q.options.forEach((o, j) => grid.appendChild(h("button", {
        class: "pk-opt sm", type: "button", on: {
          click: (ev) => {
            if (grid.dataset.done) return; grid.dataset.done = 1;
            [...grid.children][q.answer].classList.add("right");
            if (j !== q.answer) ev.currentTarget.classList.add("wrong"); else right++;
            done++; why.hidden = false; score.textContent = `${right} / ${done}`;
            if (done === qs.length) logQuiz(right, done);
          }
        }
      }, `<b>${"ABCD"[j]}</b> ${esc(o)}`)));
      c.append(grid, why); body.appendChild(c);
    });
    body.appendChild(h("button", { class: "btn ghost", type: "button", on: { click: () => { body.innerHTML = ""; mcq(); } } }, "Start again"));
  }

  function exam() {
    body.appendChild(h("p", { class: "muted small" }, esc(pack.examIntro || "")));
    (pack.exam || []).forEach((q, i) => { if (inUnit(q)) body.appendChild(examCard(q, "eq" + i)); });
  }

  function data() {
    const d = pack.dataPractice;
    body.appendChild(h("p", { class: "muted small" }, esc(d.intro)));
    const W = 640, H = 300, L = 44, R = 12, T = 16, B = 46, max = d.max;
    const n = d.categories.length, gw = (W - L - R) / n, bw = gw * 0.32;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.chartTitle)}">`;
    for (let v = 0; v <= max; v += 10) {
      const y = T + (H - T - B) * (1 - v / max);
      svg += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${v}%</text>`;
    }
    const colors = ["#7d8f99", "#4aa8ff"];
    d.categories.forEach((c, i) => {
      const x0 = L + gw * i + gw / 2 - bw;
      d.series.forEach((sr, j) => {
        const v = sr.values[i], hh = (H - T - B) * v / max, x = x0 + j * bw, y = H - B - hh;
        svg += `<rect x="${x}" y="${y}" width="${bw - 2}" height="${hh}" rx="2" fill="${colors[j % 2]}"/><text x="${x + (bw - 2) / 2}" y="${y - 4}" text-anchor="middle" font-size="11" fill="var(--text)">${v}</text>`;
      });
      svg += `<text x="${L + gw * i + gw / 2}" y="${H - B + 18}" text-anchor="middle" font-size="13" fill="var(--text)">${esc(c)}</text>`;
    });
    svg += "</svg>";
    const legend = d.series.map((s, j) => `<span><i style="background:${colors[j % 2]}"></i>${esc(s.name)}</span>`).join("");
    body.appendChild(h("div", { class: "card" }, `<b>${esc(d.chartTitle)}</b><div class="pk-chart">${svg}</div><div class="pk-legend">${legend}</div><div class="muted small"><i>${esc(d.flag)}</i></div>`));
    d.questions.forEach((q, i) => body.appendChild(examCard(q, "dp" + i)));
  }

  function plan() {
    const p = pack.planner;
    body.appendChild(h("p", { class: "muted small" }, esc(p.intro)));
    p.statements.forEach((st, i) => {
      const c = h("div", { class: "card pk-eq" }, `<div class="row-between"><div class="pk-q">“${esc(st.text)}” ${esc(p.task)}</div><span class="pill soon">6 marks</span></div>`);
      [["For, point 1", "for"], ["For, point 2", "for"], ["Against, point 1", "against"], ["Against, point 2", "against"], ["Conclusion: your judgement and what it depends on", "concl"]].forEach(([lab, cls], j) => {
        c.appendChild(h("div", { class: "pk-lab " + cls }, esc(lab)));
        c.appendChild(textBox(`pl${i}-${j}`, j < 4 ? "Point + why it matters" : "Overall I think… because… but it depends on…"));
      });
      submitBtn(c, "pl" + i);
      const ms = msBox("Points that would score", null, null, [`For: ${st.for.join("; ")}.`, `Against: ${st.against.join("; ")}.`, `Conclusion example: ${st.conclusion}`]);
      c.append(reveal("Compare with model points", ms), ms);
      body.appendChild(c);
    });
  }

  function drill() {
    const ds = shuffle((pack.debates || []).map((d, i) => ({ ...d, key: "d" + i })).filter(inUnit));
    let i = 0;
    const c = h("div", { class: "card" });
    const row = h("div", { class: "pk-btns" });
    const rev = h("button", { class: "btn ghost", type: "button" }, "Reveal side 1");
    const nxt = h("button", { class: "btn primary", type: "button" }, "Next question");
    row.append(rev, nxt); body.append(c, row);
    let stage = 0;
    function show() {
      stage = 0; const d = ds[i];
      const isHow = /^How (effectively|secure)/.test(d.q);
      c.innerHTML = `<div class="muted small">${esc(unitName(d.unit))} · 10 marks · ${i + 1} of ${ds.length}</div><div class="pk-q">${esc(d.q)}</div>
        <p class="muted small">Before you reveal: say out loud (or jot down) two points for and two against. Then pick a side.</p>
        <div class="pk-side for" hidden><b>${isHow ? "Yes / effective" : "Agree"}</b><ul>${d.for.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div class="pk-side against" hidden><b>${isHow ? "No / not effective" : "Disagree"}</b><ul>${d.against.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div class="pk-side judge" hidden><b>One possible judgement</b><p>${esc(d.judgement)}</p></div>`;
      rev.textContent = "Reveal side 1"; rev.disabled = false;
    }
    rev.onclick = () => {
      const sides = c.querySelectorAll(".pk-side");
      sides[stage].hidden = false; stage++;
      if (stage === 1) rev.textContent = "Reveal side 2";
      else if (stage === 2) rev.textContent = "Reveal judgement";
      else { rev.textContent = "Your verdict can differ"; rev.disabled = true; S.drills[ds[i].key] = today(); store.save(); }
    };
    nxt.onclick = () => { i = (i + 1) % ds.length; show(); };
    if (ds.length) show(); else c.textContent = "No drills for this unit.";
  }

  function timeline() {
    const ev = (pack.timeline || []).filter(inUnit).slice().sort((a, b) => a.year - b.year);
    body.appendChild(h("div", { class: "pk-tl" }, ev.map(e => `<div class="pk-ev u-${esc(e.unit)}"><b>${e.year}</b> ${esc(e.event)}</div>`).join("")));
  }

  draw();
}
