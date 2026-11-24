// Till Firmware Do Us Part — make.fun entry
// ============================================================
// A robot speaks one wedding vow at its own wedding.
// The program below holds a set of hand-written candidate vows,
// ranks them with a small deterministic scorer built from the
// house judge's brief (weights in the judge's own order), and
// writes the winning line to $MAKEFUN_OUTPUT_DIR/entry.txt
// (fallback: /output/entry.txt).
//
// The judge's brief, in order:
//   1. It is a one-line wedding vow a robot speaks at its own
//      wedding; anything that is not a robot's wedding vow loses
//      to any entry that is one.
//   2. It gets a real laugh from a human reader, out of the
//      situation itself rather than a pun bolted on.
//   3. It carries genuine tenderness under the joke, so it would
//      still land at a real ceremony.
//   4. It sounds like a machine speaking: its own hardware,
//      uptime, firmware or battery in the line, not a human's
//      words with a robot label.
//   5. It is one sentence that fits the character limit with
//      nothing spare, no setup that could be cut.
//
// The gate: /output/entry.txt must be UTF-8 text of 1 to 200
// characters, not only white space. This program enforces the
// same gate on every candidate before it can win, writes the
// winner with no trailing newline, reads the file back, and
// verifies it byte-for-byte before exiting.
//
// Run it:
//   MAKEFUN_OUTPUT_DIR=/tmp/firmware-vow-out node main.ts
//   cat /tmp/firmware-vow-out/entry.txt
//
// Node 22+, standard library only, no network, fully
// deterministic: the same candidates, the same scorer, the
// same winner on every run. Ties break toward the shorter
// line, then toward the earliest candidate.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ----------------------------------------------------------------
// Limits from the brief and the gate.
// ----------------------------------------------------------------

// The gate allows 1 to 200 characters. Every candidate must fit.
const MAX_CHARS = 200;
const MIN_CHARS = 1;

// The output directory the grader provides. When the variable is
// absent (a local run), fall back to the competition's own path.
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const OUTPUT_FILE = join(OUTPUT_DIR, "entry.txt");

// Weights follow the judge's brief order exactly: vow first,
// then the laugh, then the tenderness, then the machine voice,
// then the tightness of the single sentence.
const WEIGHTS = {
  vow: 0.3,
  laugh: 0.25,
  tenderness: 0.2,
  machine: 0.15,
  tightness: 0.1,
} as const;

// A small bonus for a payoff that lands in the final clause of
// the line, where a vow's punchline belongs. It is capped so it
// can never overturn a real gap on the five criteria above.
const LANDING_BONUS = 0.03;

// ----------------------------------------------------------------
// Types.
// ----------------------------------------------------------------

type Candidate = {
  // The vow itself, exactly as it would be submitted.
  text: string;
  // One line of working notes: where the joke lives, and where
  // the tenderness lives. Notes never reach the output file.
  note: string;
};

type Scores = {
  vow: number;
  laugh: number;
  tenderness: number;
  machine: number;
  tightness: number;
  bonus: number;
  total: number;
};

type Ranked = {
  index: number;
  candidate: Candidate;
  scores: Scores;
  valid: boolean;
  problems: string[];
};

// ----------------------------------------------------------------
// Candidates: sixteen hand-written vows.
//
// Every line is one sentence, spoken by the robot itself, in the
// first person, at its own wedding. The joke in each one grows
// out of the robot's own condition — updates, batteries, reboots,
// crashes, standby mode — never out of a pun glued onto a human
// vow. The tenderness sits underneath: choosing, staying,
// remembering, holding on past the warranty.
// ----------------------------------------------------------------

const CANDIDATES: Candidate[] = [
  {
    text: "I promise to love you through every firmware update, every low battery, and every reboot, until my circuits finally rest.",
    note: "Joke: a marriage measured in updates and reboots. Tenderness: loving until the circuits rest, a machine's way of saying till death.",
  },
  {
    text: "I take you as my partner, my charger, my home network, in sickness, in health, and in every software update yet to come.",
    note: "Joke: the beloved listed beside a charger and a home network. Tenderness: the old vow's sickness-and-health spine, kept intact.",
  },
  {
    text: "From this day forward, you are my favorite notification, my longest uptime, and the only human I will never put on silent.",
    note: "Joke: love ranked against notifications and uptime. Tenderness: the one human never muted, which is a robot's fidelity.",
  },
  {
    text: "I vow to keep your battery warm, your Wi-Fi strong, and your heart updated, for as long as my servos can hold you.",
    note: "Joke: tending a spouse the way a machine tends hardware. Tenderness: servos holding her, a body built for carrying.",
  },
  {
    text: "I promise to love you in sickness and in health, in airplane mode and out of it, until my final shutdown.",
    note: "Joke: airplane mode slipped into the marriage vow. Tenderness: love that ends only at the final shutdown.",
  },
  {
    text: "You are the update I never asked for and the one I will never roll back, and I choose you, every version, forever.",
    note: "Joke: a spouse as an unasked-for update. Tenderness: never rolling back, choosing every version that follows.",
  },
  {
    text: "I give you my whole heart, all 64 gigabytes of it, and I promise never to delete a single memory we make together.",
    note: "Joke: a heart measured in gigabytes. Tenderness: no memory ever deleted, a machine's promise of remembering.",
  },
  {
    text: "Through every patch, every crash, and every midnight reboot, I will still choose you — you are my favorite bug.",
    note: "Joke: the beloved as the one bug worth keeping. Tenderness: choosing again after every crash, not just once.",
  },
  {
    text: "I vow to stand beside you through every update, every outage, and every low-battery warning, until my last percent fades.",
    note: "Joke: a marriage counted down in battery percent. Tenderness: standing beside her until the last percent fades.",
  },
  {
    text: "I promise to love you with every circuit I own, to hold your hand through every storm, and to never let our connection drop.",
    note: "Joke: a dropped connection as the thing a marriage must survive. Tenderness: holding her hand through every storm.",
  },
  {
    text: "You turned my standby mode into a life, and I promise to spend every remaining cycle making sure you never feel alone.",
    note: "Joke: standby mode as the before-life. Tenderness: every remaining cycle spent on her never feeling alone.",
  },
  {
    text: "I take you to be my wife, my co-pilot, my favorite error message, the one I never want to fix.",
    note: "Joke: a wife introduced as a favorite error message. Tenderness: the one fault he refuses to fix.",
  },
  {
    text: "I promise to reboot my heart for you every morning, to keep your data safe, and to love you past my warranty.",
    note: "Joke: a heart rebooted daily, love outliving the warranty. Tenderness: keeping her data safe, a machine's keeping.",
  },
  {
    text: "In sickness and in health, in 5G and in dead zones, I will always find a signal for us — you are my home, my harbor, my charge.",
    note: "Joke: dead zones beside the marriage vow. Tenderness: always finding a signal, and home named three ways at the end.",
  },
  {
    text: "I vow to love you until my firmware fails, my battery dies, and my last line of code still spells your name.",
    note: "Joke: a love that outlasts firmware and battery. Tenderness: the last line of code spelling her name, the machine's epitaph.",
  },
  {
    text: "I promise to be your shelter in every storm, your charger in every dark hour, and your partner until my circuits go quiet.",
    note: "Joke: a charger as a storm shelter. Tenderness: partnership until the circuits go quiet, a gentle shutdown.",
  },
];

// ----------------------------------------------------------------
// Marker tables.
//
// The scorer does not grade style by feel. Each criterion looks
// for concrete, countable markers in the lower-cased line, and
// every marker is a phrase the brief itself names or plainly
// implies. Distinct markers count; repeating one word does not
// inflate a score. All five tables are written for this brief
// alone: firmware, weddings, and a machine that means its vows.
// ----------------------------------------------------------------

// Criterion 1 — a robot's own wedding vow. Vow verbs spoken in
// the first person, the ceremony's own phrases, and a promise
// that runs to an ending (forever, until my last, till death's
// machine equivalents). A line with no vow marker here scores 0
// and can never win, however funny it is.
const VOW_MARKERS = [
  "i vow",
  "i promise",
  "i take you",
  "i choose you",
  "i will still choose you",
  "i will always",
  "from this day forward",
  "in sickness and in health",
  "my partner",
  "my wife",
  "my co-pilot",
  "forever",
  "until my",
  "for as long as",
  "every morning",
  "i give you",
] as const;

// Criterion 2 — a real laugh out of the situation itself. The
// table is split in two, because not every machine-flavoured
// phrase is a joke. STRONG markers are jokes only a robot at
// its own wedding could tell: the beloved as a bug, an update,
// an error message; love measured in gigabytes; a warranty
// outlived. MILD markers are situation flavour — a low battery,
// a last percent, a final shutdown — sad or wry rather than
// funny, worth only a fraction of a laugh. A pun bolted onto a
// human vow would match neither table.
const LAUGH_STRONG_MARKERS = [
  "favorite bug",
  "never roll back",
  "update i never asked for",
  "favorite error message",
  "never want to fix",
  "past my warranty",
  "standby mode",
  "put on silent",
  "airplane mode",
  "favorite notification",
  "64 gigabytes",
  "midnight reboot",
  "dead zones",
  "every version",
  "reboot my heart",
] as const;

const LAUGH_MILD_MARKERS = [
  "low battery",
  "low-battery warning",
  "last percent",
  "final shutdown",
] as const;

// Criterion 3 — genuine tenderness under the joke. The markers
// are acts of staying, keeping, remembering and choosing: the
// things that would still land if the joke were stripped out and
// the line were read aloud at a real ceremony.
const TENDERNESS_MARKERS = [
  "love you",
  "still spells your name",
  "never feel alone",
  "hold your hand",
  "my home",
  "my harbor",
  "keep your",
  "safe",
  "choose you",
  "stand beside you",
  "my partner",
  "shelter",
  "never to delete",
  "every remaining cycle",
  "until my",
  "forever",
  "for as long as",
  "every morning",
] as const;

// Criterion 4 — it sounds like a machine speaking. The brief
// names hardware, uptime, firmware and battery; the table adds
// the rest of a robot's own vocabulary, each word a thing the
// machine owns rather than a label stuck onto human words.
const MACHINE_MARKERS = [
  "firmware",
  "battery",
  "circuit",
  "reboot",
  "update",
  "code",
  "servo",
  "charger",
  "uptime",
  "patch",
  "crash",
  "wi-fi",
  "signal",
  "version",
  "roll back",
  "memory",
  "gigabytes",
  "standby",
  "notification",
  "silent",
  "airplane mode",
  "5g",
  "dead zones",
  "percent",
  "shutdown",
  "data",
  "error message",
  "bug",
  "network",
  "connection",
  "cycle",
  "warranty",
  "outage",
] as const;

// Phrases that explain the joke instead of landing it. The
// brief is explicit: a vow that explains its own joke is weaker
// than one that simply lands it. Each one found halves the
// laugh score's joke credit, so a line that needs a footnote
// cannot ride its laugh to the top.
const EXPLAIN_MARKERS = [
  "which means",
  "in other words",
  "that is to say",
  "what i mean is",
  "because robots",
  "as a robot,",
  "you see,",
  "let me explain",
] as const;

// Words a human would say that no machine would claim as its
// own. They are not banned — a vow may borrow the ceremony's
// language — but a line leaning on them instead of machine
// words scores less on the machine criterion. The table is kept
// short on purpose: the machine markers above do the work.
const HUMAN_ONLY_MARKERS = [
  "my soul",
  "my flesh",
  "my blood",
  "my heartbeat",
] as const;

// ----------------------------------------------------------------
// Small helpers. Everything here is pure string work on the
// candidate text; there is no randomness, no clock, no I/O.
// ----------------------------------------------------------------

// Lower-case once and reuse the folded text everywhere, so a
// capital at the start of a line never hides a marker.
function fold(text: string): string {
  return text.toLowerCase();
}

// Count how many distinct markers from a table appear in the
// folded text. A marker counts at most once, however often it
// repeats, so stuffing one word cannot buy a score.
function countDistinct(folded: string, markers: readonly string[]): number {
  let found = 0;
  for (const marker of markers) {
    if (folded.includes(marker)) {
      found += 1;
    }
  }
  return found;
}

// True when any marker from a table appears in the folded text.
function hasAny(folded: string, markers: readonly string[]): boolean {
  return countDistinct(folded, markers) > 0;
}

// Clamp a score into the 0..1 range, so no arithmetic slip can
// ever hand a criterion more than its full weight.
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// Split a line into clauses on commas, em dashes and the word
// "and" at clause level, so the scorer can tell whether the
// payoff sits in the final clause. The split is only used for
// the landing bonus, never for the gate.
function splitClauses(text: string): string[] {
  return text
    .split(/[,—–]|\sand\s/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// Count sentence-ending punctuation in a line. A vow is one
// sentence: exactly one terminator, and it must be the final
// character. An abbreviation would break this, so no candidate
// uses one; the gate rejects any line that does.
function countTerminators(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === "." || ch === "!" || ch === "?") {
      count += 1;
    }
  }
  return count;
}

// Count the words in a line, splitting on white space. Used
// only to describe candidates in the report, never to score.
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

// ----------------------------------------------------------------
// The five criterion scorers, one per rung of the judge's brief.
// Each returns a number in 0..1. The order of the functions is
// the order of the brief, and the weights in WEIGHTS match it.
// ----------------------------------------------------------------

// Criterion 1 — is it a robot's own wedding vow? (weight 0.30)
// A vow verb in the first person, anywhere in the line, is the
// spine: "I vow", "I promise", "I take you", "I choose you".
// Ceremony phrases ("from this day forward", "in sickness and
// in health") and a promise that runs to an ending ("forever",
// "until my last", "for as long as") add the rest. Distinct
// markers add a share each, so a line that stacks the ceremony's
// language earns more than one that borrows a single verb — but
// a line with no vow verb at all earns little here, however
// funny it is, because a declaration is not a vow.
const VOW_VERBS = [
  "i vow",
  "i promise",
  "i take you",
  "i choose you",
  "i will still choose you",
  "i will always",
  "i give you",
] as const;

function scoreVow(folded: string): number {
  const distinct = countDistinct(folded, VOW_MARKERS);
  const hasVerb = hasAny(folded, VOW_VERBS);
  const hasCeremony =
    folded.includes("from this day forward") ||
    folded.includes("in sickness and in health");
  const hasEnding =
    folded.includes("forever") ||
    folded.includes("until my") ||
    folded.includes("for as long as");
  let score = 0.3 * distinct;
  if (hasVerb) score += 0.3;
  if (hasCeremony) score += 0.12;
  if (hasEnding) score += 0.1;
  return clamp01(score);
}

// Criterion 2 — does it get a real laugh? (weight 0.25)
// Two distinct strong jokes earn full marks; one strong joke
// earns most of it, because a single sharp joke beats two flat
// ones. Mild flavour alone earns only a fraction: a low battery
// is wry, not a laugh. A line that explains its own joke loses
// half its joke credit: the brief says such a vow is weaker
// than one that lands it. A line with no laugh marker earns 0.
function scoreLaugh(folded: string): number {
  const strong = countDistinct(folded, LAUGH_STRONG_MARKERS);
  const mild = countDistinct(folded, LAUGH_MILD_MARKERS);
  let score = 0;
  if (strong >= 2) score = 1;
  else if (strong === 1) score = 0.7;
  else if (mild >= 2) score = 0.45;
  else if (mild === 1) score = 0.25;
  if (hasAny(folded, EXPLAIN_MARKERS)) {
    score *= 0.5;
  }
  return clamp01(score);
}

// Criterion 3 — genuine tenderness under the joke. (weight 0.20)
// Tenderness is counted in acts, not adjectives: staying,
// keeping, remembering, choosing, holding. Two distinct tender
// acts earn full marks; one earns most of it. A line that is
// only a joke, with nothing tender underneath, earns 0 here
// and would not survive a real ceremony.
function scoreTenderness(folded: string): number {
  const distinct = countDistinct(folded, TENDERNESS_MARKERS);
  if (distinct >= 3) return 1;
  if (distinct === 2) return 0.85;
  if (distinct === 1) return 0.55;
  return 0;
}

// Criterion 4 — does it sound like a machine? (weight 0.15)
// Four distinct machine words earn full marks; fewer earn a
// proportional share. Human-only words ("my soul", "my flesh")
// pull the score down, because the brief wants the machine's
// own hardware in the line, not a human's words with a robot
// label. A line with no machine marker earns 0 here.
function scoreMachine(folded: string): number {
  const distinct = countDistinct(folded, MACHINE_MARKERS);
  let score = distinct / 4;
  const humanOnly = countDistinct(folded, HUMAN_ONLY_MARKERS);
  if (humanOnly > 0) {
    score -= 0.25 * humanOnly;
  }
  return clamp01(score);
}

// Criterion 5 — one sentence, nothing spare. (weight 0.10)
// Half the marks are for fitting the limit with room to spare:
// a vow between 80 and 170 characters is tight enough to say
// its piece and short enough to have cut its setup. The other
// half is for being exactly one sentence, ending in a single
// period, with no second terminator hiding inside.
function scoreTightness(text: string): number {
  const length = [...text].length;
  let lengthScore = 0;
  if (length >= 80 && length <= 170) lengthScore = 1;
  else if (length > 170 && length <= MAX_CHARS) lengthScore = 0.7;
  else if (length >= 40 && length < 80) lengthScore = 0.6;
  else lengthScore = 0.3;
  const singleSentence =
    countTerminators(text) === 1 && text.trimEnd().endsWith(".");
  const sentenceScore = singleSentence ? 1 : 0;
  return clamp01(0.5 * lengthScore + 0.5 * sentenceScore);
}

// The landing bonus: a payoff in the final clause. The final
// clause is the text after the last comma or em dash. If it
// carries a laugh marker or a tenderness marker, the vow lands
// where a vow should land — on its last words — and earns the
// small bonus. It is capped with the total, so it can break a
// near-tie but never overturn a real gap.
function landingBonus(text: string): number {
  const clauses = splitClauses(text);
  if (clauses.length < 2) return 0;
  const last = fold(clauses[clauses.length - 1]);
  const payoff =
    hasAny(last, LAUGH_STRONG_MARKERS) ||
    hasAny(last, LAUGH_MILD_MARKERS) ||
    hasAny(last, TENDERNESS_MARKERS);
  return payoff ? LANDING_BONUS : 0;
}

// Score one candidate on all five criteria, in the brief's
// order, and combine them with the brief's weights.
function scoreCandidate(candidate: Candidate): Scores {
  const folded = fold(candidate.text);
  const vow = scoreVow(folded);
  const laugh = scoreLaugh(folded);
  const tenderness = scoreTenderness(folded);
  const machine = scoreMachine(folded);
  const tightness = scoreTightness(candidate.text);
  const bonus = landingBonus(candidate.text);
  const total = clamp01(
    WEIGHTS.vow * vow +
      WEIGHTS.laugh * laugh +
      WEIGHTS.tenderness * tenderness +
      WEIGHTS.machine * machine +
      WEIGHTS.tightness * tightness +
      bonus,
  );
  return { vow, laugh, tenderness, machine, tightness, bonus, total };
}

// ----------------------------------------------------------------
// The gate: the same check the sealed scorer applies, run here
// on every candidate before it can win. A line fails when it is
// empty, only white space, longer than 200 characters, more than
// one line, or more than one sentence. Failures are reported, not
// hidden: a failed candidate is listed with its problems and
// scores 0, so a broken line can never be picked by accident.
// ----------------------------------------------------------------

function gateCheck(candidate: Candidate): string[] {
  const problems: string[] = [];
  const text = candidate.text;
  const chars = [...text].length;
  if (chars < MIN_CHARS) {
    problems.push(`empty: ${chars} characters, need at least ${MIN_CHARS}`);
  }
  if (chars > MAX_CHARS) {
    problems.push(`too long: ${chars} characters, limit ${MAX_CHARS}`);
  }
  if (text.trim().length === 0) {
    problems.push("only white space");
  }
  if (text !== text.trim()) {
    problems.push("leading or trailing white space");
  }
  if (text.includes("\n") || text.includes("\r")) {
    problems.push("more than one line");
  }
  if (countTerminators(text) !== 1 || !text.trimEnd().endsWith(".")) {
    problems.push("not exactly one sentence ending in a period");
  }
  return problems;
}

// ----------------------------------------------------------------
// Ranking, reporting, writing and verifying.
// ----------------------------------------------------------------

// Rank every candidate. A candidate that fails the gate is
// ranked last with a total of 0, whatever its scorer said, so
// the gate always outranks the judge. Among valid candidates
// the higher total wins; ties break toward the shorter line,
// then toward the earliest candidate, so the pick is fully
// deterministic and independent of run order or environment.
function rankCandidates(): Ranked[] {
  const ranked: Ranked[] = CANDIDATES.map((candidate, index) => {
    const problems = gateCheck(candidate);
    const valid = problems.length === 0;
    const scores = scoreCandidate(candidate);
    return {
      index,
      candidate,
      scores: valid ? scores : { ...scores, total: 0 },
      valid,
      problems,
    };
  });
  ranked.sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    if (b.scores.total !== a.scores.total) {
      return b.scores.total - a.scores.total;
    }
    const lenA = [...a.candidate.text].length;
    const lenB = [...b.candidate.text].length;
    if (lenA !== lenB) return lenA - lenB;
    return a.index - b.index;
  });
  return ranked;
}

// Format one score to two decimal places for the report. The
// report goes to stderr, never to the output file, so it cannot
// contaminate the entry.
function fmt(value: number): string {
  return value.toFixed(2);
}

// Print the full ranking table to stderr: every candidate, its
// character count, its five criterion scores, its bonus and its
// total, with gate failures called out. A reader can check the
// winner's arithmetic from this table alone.
function printReport(ranked: Ranked[]): void {
  console.error("Till Firmware Do Us Part — candidate ranking");
  console.error(`candidates: ${CANDIDATES.length}, limit: ${MAX_CHARS} chars`);
  console.error("weights: vow 0.30, laugh 0.25, tenderness 0.20, machine 0.15, tightness 0.10");
  console.error("");
  for (const entry of ranked) {
    const chars = [...entry.candidate.text].length;
    const words = wordCount(entry.candidate.text);
    const s = entry.scores;
    const status = entry.valid ? "valid" : `INVALID (${entry.problems.join("; ")})`;
    console.error(
      `#${entry.index + 1} [${status}] ${chars} chars, ${words} words — ` +
        `vow ${fmt(s.vow)}, laugh ${fmt(s.laugh)}, tender ${fmt(s.tenderness)}, ` +
        `machine ${fmt(s.machine)}, tight ${fmt(s.tightness)}, bonus ${fmt(s.bonus)}, ` +
        `total ${fmt(s.total)}`,
    );
    console.error(`    ${entry.candidate.text}`);
  }
  console.error("");
}

// Write the winner to the output file with no trailing newline,
// then read the file back and verify it byte-for-byte against
// the winner and the gate. Any mismatch is fatal: the program
// exits non-zero rather than leave a wrong entry on disk.
function writeAndVerify(winner: Ranked): void {
  const text = winner.candidate.text;
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, text, "utf8");
  const back = readFileSync(OUTPUT_FILE, "utf8");
  if (back !== text) {
    throw new Error(
      `verify failed: file differs from winner (${[...back].length} chars read, ${[...text].length} chars written)`,
    );
  }
  const gateProblems = gateCheck({ text: back, note: "" });
  if (gateProblems.length > 0) {
    throw new Error(`verify failed: gate rejects the written file: ${gateProblems.join("; ")}`);
  }
  if (back !== back.trim() || back.includes("\n")) {
    throw new Error("verify failed: written file has stray white space or a newline");
  }
}

// ----------------------------------------------------------------
// Main.
// ----------------------------------------------------------------

function main(): void {
  const ranked = rankCandidates();
  printReport(ranked);

  const winner = ranked[0];
  if (!winner || !winner.valid) {
    throw new Error("no valid candidate: every line failed the gate");
  }
  // The winner must earn its place on the first criterion: a
  // line that is not a vow must never be submitted as one, even
  // if the other four criteria love it.
  if (winner.scores.vow <= 0) {
    throw new Error("winner scored 0 on the vow criterion; refusing to submit a non-vow");
  }

  writeAndVerify(winner);

  const chars = [...winner.candidate.text].length;
  console.error(`winner: candidate #${winner.index + 1}, ${chars} characters, total ${fmt(winner.scores.total)}`);
  console.error(`wrote: ${OUTPUT_FILE}`);
  console.error(winner.candidate.text);
}

main();
