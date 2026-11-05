// =============================================================
//  revision/syllabus.js — what Jake revises (pure data, no Firebase)
//
//  SUBJECTS → topics → must-know checklist points (+ optional practice pack).
//  Progress (rounds, confidence, ticked points) lives in Firestore keyed by
//  topic id, so NEVER rename a topic id once it's in use — add new ones instead.
//
//  To add a subject's topics: append to its `topics` array. To add a practice
//  pack: drop a JSON file in revision/packs/ and set `pack` on the topics it covers.
// =============================================================

// Goal: every topic revised twice (Round 1 + Round 2) by end of February.
export const REVISION_GOAL = { start: "2026-11-07", by: "2027-02-28", rounds: 2 };

// Bump when a pack JSON changes so browsers fetch the new copy.
export const PACK_VERSION = 1;

export const PACKS = {
  "em-natural-resources": "Natural resources",
  "bio-reproduction-environment": "Reproduction, ecology & human impact",
  "history-cold-war": "Cold War (KQ4–6)",
};

// "How it's marked" cards, from the IGCSE Exam Guide (Cambridge, Nov 2026).
const SCIENCE_GUIDE = {
  papers: [
    ["Paper 2 · 45 min · 40 marks", "40 multiple-choice questions (30%)"],
    ["Paper 4 · 1h 15 · 80 marks", "Short-answer and structured questions (50%)"],
    ["Paper 6 · 1h · 40 marks", "Written questions on experiments (20%)"],
  ],
  tips: [
    "MCQ: about a minute per question. Rule out wrong options first and never leave a blank.",
    "Theory: marks go to specific keywords, so use exact textbook terms. The marks tell you how many points to make.",
    "Practical paper repeats year to year: practise results tables (units in headings), graphs (labelled axes, sensible scale, best-fit line), errors and improvements, control variables.",
  ],
  note: "Jake is on Core for Biology: Core sits Papers 1, 3 and 6 (same question types, Core content).",
};

export const SUBJECTS = [
  {
    key: "Math", name: "Math", emoji: "📐",
    guide: {
      papers: [["Paper 2 · 2h · 100 marks", "No calculator (50%)"], ["Paper 4 · 2h · 100 marks", "Calculator (50%)"]],
      tips: [
        "About 1.2 minutes per mark: if a 3-mark question takes 6 minutes, move on and come back.",
        "Non-calculator: practise fractions, surds and standard form by hand.",
        "Always show working: method marks count even when the answer is wrong.",
        "Follow rounding instructions (e.g. 3 s.f.) and don't round partway through.",
      ],
    },
    topics: [],
  },
  {
    key: "English", name: "English", emoji: "✍️",
    guide: {
      papers: [["Paper 1: Reading · 2h · 80 marks", "Comprehension, summary and language analysis on three texts"], ["Paper 2: Writing · 2h · 80 marks", "Directed writing (40) + composition (40)"]],
      tips: [
        "Read the questions before the texts. Summaries in your own words, within the word limit.",
        "Language question: pick specific phrases and explain the effect of each. Naming a technique alone doesn't score.",
        "Paper 2: ~45 min directed writing, ~1h 15 composition, 5–10 min planning first.",
        "Leave 5 minutes to proofread.",
      ],
    },
    topics: [],
  },
  {
    key: "Humanities", name: "Humanities", emoji: "🏛️",
    guide: {
      papers: [["Paper 1 · 2h · 60 marks", "Structured essays: (a) 4, (b) 6, (c) 10 marks"], ["Paper 2 · 1h 45 · 40 marks", "Source-based document questions"], ["Paper 4 or coursework · 40 marks", "Depth study"]],
      tips: [
        "(a) 4 marks: two facts, each with a specific detail.",
        "(b) 6 marks: two or three reasons, each explained (PEEL).",
        "(c) 10 marks: both sides, then a clear verdict with a reason.",
        "Sources: ask who made it, when and why; back each claim with a short quotation.",
      ],
    },
    topics: [
      {
        id: "hist-kq4", unit: "Cold War", pack: "history-cold-war", packUnit: "kq4",
        name: "KQ4: Who was to blame for the Cold War?",
        points: [
          "Yalta (Feb 1945): Germany, Poland, free elections",
          "Potsdam (Jul–Aug 1945): Truman replaces Roosevelt; Poland, reparations",
          "Atomic bomb (Aug 1945) and mistrust",
          "Different ideologies: capitalism vs communism",
          "Stalin's buffer zone: 20+ million Soviet dead",
          "Salami tactics; Czechoslovakia coup (Feb 1948)",
          "Long Telegram and Iron Curtain speech (1946)",
          "Truman Doctrine (Mar 1947): containment",
          "Marshall Plan (1947): ~$13 billion; Stalin bans the East from it",
          "Cominform (1947) and Comecon (1949)",
          "Berlin Blockade (Jun 1948–May 1949) and the Airlift",
          "Consequences: NATO (1949); Germany split into FRG and GDR",
        ],
      },
      {
        id: "hist-kq5", unit: "Cold War", pack: "history-cold-war", packUnit: "kq5",
        name: "KQ5: How effectively did the USA contain communism?",
        points: [
          "China communist (Oct 1949); USA backs Taiwan; NSC-68",
          "Korea: North invades (Jun 1950); UN force under MacArthur",
          "Inchon (Sep 1950); China intervenes (Oct–Nov 1950)",
          "MacArthur sacked (1951); armistice (Jul 1953)",
          "Korea verdict: South saved but costly stalemate",
          "Cuba: Castro (1959) moves towards the USSR",
          "Bay of Pigs (Apr 1961)",
          "Cuban Missile Crisis (Oct 1962): U-2 photos, quarantine, 13 days",
          "The deal: missiles out; no invasion; Turkey missiles removed",
          "After: hotline and Test Ban Treaty (1963)",
          "Vietnam: domino theory; Dien Bien Phu (1954)",
          "Gulf of Tonkin (1964); Rolling Thunder and ground troops (1965)",
          "Tet Offensive (1968): turning point in US opinion",
          "Vietnamisation; Paris Peace (1973); Saigon falls (1975)",
        ],
      },
      {
        id: "hist-kq6", unit: "Cold War", pack: "history-cold-war", packUnit: "kq6",
        name: "KQ6: How secure was Soviet control of Eastern Europe?",
        points: [
          "How control worked: Warsaw Pact, Comecon, secret police, Red Army",
          "Stalin dies (1953); Khrushchev's secret speech (Feb 1956)",
          "Hungary 1956: Nagy, leaving the Warsaw Pact, Soviet tanks",
          "Berlin Wall (Aug 1961): stop the brain drain",
          "Prague Spring (1968): socialism with a human face",
          "Warsaw Pact invasion (Aug 1968); Brezhnev Doctrine",
          "Hungary vs Czechoslovakia: similarities and differences",
          "Solidarity: Gdańsk 1980, Wałęsa, ~10 million members",
          "Martial law (Dec 1981); Solidarity underground",
          "Solidarity wins elections (1989)",
          "Gorbachev (1985): glasnost, perestroika, drops Brezhnev Doctrine",
          "1989: Hungary opens border; Berlin Wall falls (9 Nov)",
          "Warsaw Pact ends; USSR collapses (1991)",
        ],
      },
    ],
  },
  {
    key: "Bio", name: "Biology", emoji: "🧬", guide: SCIENCE_GUIDE,
    topics: [
      {
        id: "bio-plants", unit: "Reproduction", pack: "bio-reproduction-environment",
        name: "Reproduction in plants",
        points: [
          "Asexual vs sexual reproduction",
          "Parts of a flower and their functions",
          "Insect- vs wind-pollinated flowers",
          "Self- vs cross-pollination; fertilisation",
          "Conditions for germination",
        ],
      },
      {
        id: "bio-humans", unit: "Reproduction", pack: "bio-reproduction-environment",
        name: "Reproduction in humans",
        points: [
          "Male and female reproductive systems",
          "Comparing sperm and egg cells; fertilisation",
          "Placenta, umbilical cord, amniotic fluid",
          "Puberty (testosterone, oestrogen); menstrual cycle",
          "STIs (HIV)",
        ],
      },
      {
        id: "bio-ecology", unit: "Ecology", pack: "bio-reproduction-environment",
        name: "Organisms and the environment",
        points: [
          "Food chains and webs; trophic levels",
          "Why energy is lost between levels; pyramids of numbers and biomass",
          "Carbon cycle",
          "Population growth curve phases",
        ],
      },
      {
        id: "bio-impact", unit: "Ecology", pack: "bio-reproduction-environment",
        name: "Human influences on ecosystems",
        points: [
          "Monocultures and intensive farming",
          "Deforestation and its effects",
          "Eutrophication sequence; plastics; greenhouse gases",
        ],
      },
      {
        id: "bio-conservation", unit: "Ecology", pack: "bio-reproduction-environment",
        name: "Conservation",
        points: [
          "Sustainable fishing and forestry",
          "Seed banks, captive breeding, why conserve species",
        ],
      },
    ],
  },
  { key: "Physics", name: "Physics", emoji: "⚡", guide: SCIENCE_GUIDE, topics: [] },
  { key: "Chem", name: "Chemistry", emoji: "⚗️", guide: SCIENCE_GUIDE, topics: [] },
  {
    key: "EM", name: "EM (Environmental Mgmt)", emoji: "🌍",
    guide: {
      papers: [["Paper 1: Theory · 1h 45 · 80 marks", "Short questions (20) + extended answers using sources (60)"], ["Paper 2: Management in context · 1h 45 · 80 marks", "Questions based on one country"]],
      tips: [
        "Most marks come from data: quote figures with units (“from 20% to 45%”, not “it increased”).",
        "One 6-mark argument per paper: two points for, two against, then a conclusion.",
        "Fieldwork (sampling, quadrats, questionnaires) comes up every year: know how to evaluate a method.",
        "Paper 2: link every answer back to the country in the source.",
      ],
    },
    topics: [
      {
        id: "em-rocks", unit: "Natural resources", pack: "em-natural-resources",
        name: "Rocks and the rock cycle",
        points: ["Igneous, sedimentary and metamorphic rocks: how each forms", "The rock cycle"],
      },
      {
        id: "em-extraction", unit: "Natural resources", pack: "em-natural-resources",
        name: "Extraction and its impacts",
        points: [
          "Surface (open-pit) vs deep mining",
          "What makes a deposit worth mining; environmental impact assessments",
          "Impacts: habitat loss, air/water/noise pollution, spoil heaps",
          "Benefits: jobs, infrastructure",
        ],
      },
      {
        id: "em-sustainable", unit: "Natural resources", pack: "em-natural-resources",
        name: "Sustainable management of minerals",
        points: ["Recycling, reduce/reuse, laws and regulation", "Land restoration after mining: one case study"],
      },
      {
        id: "em-energy", unit: "Natural resources", pack: "em-natural-resources",
        name: "Energy resources",
        points: [
          "Renewable vs non-renewable; how fossil fuels form",
          "Nuclear power: pros and cons",
          "Solar, wind, HEP, tidal, wave, geothermal, biofuels: pros and cons",
          "Why energy demand changes; ways to save energy",
        ],
      },
    ],
  },
];

export const allTopics = () => SUBJECTS.flatMap(s => s.topics.map(t => ({ ...t, subject: s.key })));
export const topicById = (id) => allTopics().find(t => t.id === id);
export const subjectByKey = (k) => SUBJECTS.find(s => s.key === k);

// One-time seed: the Nov 7–13 EM + Biology plan from Jake_Revision_Plan.xlsx,
// and the three tests. `topics` = which topics a session counts as a revision round for.
export const SEED_TESTS = [
  { subject: "Humanities", name: "History: Cold War (KQ4–6)", date: "2026-11-05", topics: ["hist-kq4", "hist-kq5", "hist-kq6"] },
  { subject: "EM", name: "EM: Natural resources", date: "2026-11-12", topics: ["em-rocks", "em-extraction", "em-sustainable", "em-energy"] },
  { subject: "Bio", name: "Biology: Reproduction & environment", date: "2026-11-13", topics: ["bio-plants", "bio-humans", "bio-ecology", "bio-impact", "bio-conservation"] },
];
export const SEED_SESSIONS = [
  { date: "2026-11-07", slot: 1, subject: "EM", topics: ["em-rocks"], title: "Rocks and the rock cycle", method: "Draw the rock cycle from memory, then check it" },
  { date: "2026-11-07", slot: 2, subject: "EM", topics: ["em-extraction"], title: "Extraction and its impacts + mine case study", method: "Mind map of impacts and benefits; write the case study on one page" },
  { date: "2026-11-07", slot: 3, subject: "Bio", topics: ["bio-plants"], title: "Reproduction in plants", method: "Label a blank flower; table comparing insect- vs wind-pollinated flowers" },
  { date: "2026-11-08", slot: 1, subject: "EM", topics: ["em-sustainable"], title: "Sustainable management of minerals", method: "Practise 6-mark 'evaluate' questions" },
  { date: "2026-11-08", slot: 2, subject: "EM", topics: ["em-energy"], title: "Energy resources, demand and saving energy", method: "Pros/cons grid for each energy source" },
  { date: "2026-11-08", slot: 3, subject: "Bio", topics: ["bio-humans"], title: "Human reproduction", method: "Label both systems; table comparing sperm and egg cells; sketch the cycle" },
  { date: "2026-11-09", slot: 1, subject: "Bio", topics: ["bio-ecology"], title: "Food chains/webs, pyramids, carbon cycle, population curve", method: "Draw the carbon cycle and pyramids from memory" },
  { date: "2026-11-09", slot: 2, subject: "Bio", topics: ["bio-impact", "bio-conservation"], title: "Human impact and conservation (Bio + EM overlap)", method: "Learn eutrophication step by step; deforestation effects; conservation methods" },
  { date: "2026-11-10", slot: 1, subject: "EM", topics: [], title: "Timed past-paper questions: whole Natural Resources topic", method: "Mark against the mark scheme; list weak spots" },
  { date: "2026-11-10", slot: 2, subject: "EM", topics: [], title: "Final EM review: weak spots only", method: "Flashcards and blank-page recall; no new content" },
  { date: "2026-11-12", slot: 1, subject: "Bio", topics: [], mins: 30, title: "Light Biology review (after the EM test)", method: "Biology flashcards and weak spots only; no new content; early night" },
];
