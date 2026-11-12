// Word Blocks: CVC words; Dad judges each word. Starts in small caps (his strong track) unless Dad's letter-case
// setting or a stage override says lowercase; Dad's bar has a live switch that re-renders the card. Each word is
// recorded once, with the track of the case showing at Dad's judge tap. A lowercase start gates the word pool by the
// confusable-letter rule once, at the pick (a flip never re-gates).
import { stageLayout } from "../layout.js";
import { runJudged } from "./judged.js";
import { createCaseState, render, readingClass, gateWords } from "../lettercase.js";
import { rewardForWord } from "../rules.js";
import { pickAtLevel, trackerFor } from "../levels.js";
import { getEvents } from "../api.js";
import { playJingle } from "../sounds.js";
import { commitUntilSaved, earnRates } from "../store.js";
import { h, inventoryRow } from "../ui.js";

const WORDS_PER_SESSION = 10; // ~2 minutes

/**
 * The words for a session at `level` (levels.js pickAtLevel): 80% at the level and 20% review from the level below
 * (2 of 10), least-practised first (`practised` = {word: times read on file}), random among equals. When `gate` =
 * {caseName, active} is given, the pool is first passed through the confusable-letter gate (lettercase.js gateWords:
 * a no-op for small caps, whose shapes do not mirror; for lowercase/mixed only words whose confusable letters are all
 * in `active` stay). Returns {picked: [word entries], short}; throws if the list has no word at or below the level.
 */
export function pickBlocksWords(words, practised, level, n = WORDS_PER_SESSION, rng = Math.random, gate = null) {
  const pool = gate ? gateWords(words, gate.caseName, gate.active) : words;
  const items = pool.map((w, index) => ({ ...w, index, count: practised[w.word] ?? 0 }));
  return pickAtLevel(items, level, n, { rng });
}

export async function run(app, opts = {}) {
  const { progress } = app.store;
  const cs = createCaseState(app, "blocks", { override: opts.case, locked: opts.lockCase });
  const caseLabel = () => (cs.current() === "smallcaps" ? "small caps" : "lowercase");
  const hintFor = () => `Charles reads the word in ${caseLabel()}.`;
  const L = stageLayout(app.root, { title: "Word Blocks", dadHint: hintFor(), caseState: cs });
  const events = await getEvents();
  const tracker = await trackerFor(app, "blocks", events);
  const practised = {};
  for (const e of events) if (e.type === "word") practised[e.item] = (practised[e.item] ?? 0) + 1;
  const roundLevel = tracker.level; // fixed for the whole session: a mid-round level-up must not retag the rest of it
  const { picked: words, short } = pickBlocksWords(
    app.words, practised, roundLevel, WORDS_PER_SESSION, Math.random, { caseName: cs.current(), active: progress.active_letters });
  const shortHint = () => `Level ${roundLevel}: there are few words at this level yet, so some are easier ones. ${hintFor()}`;
  const baseHint = () => (short ? shortHint() : hintFor());
  if (short) L.setHint(baseHint());
  L.setLevel(...tracker.lines());
  const entries = words.map((w) => ({ word: w.word, level: w.level }));
  const tray = h("div", { class: "tray" });
  const refreshTray = () => tray.replaceChildren(inventoryRow(app.store.progress.inventory, ["wood", "stone", "emerald"]));
  let rewarded = 0;

  let shownHint = L.hint.textContent; // the base hint last written, to tell it from a transient "try again" hint
  let current = null; // the entry on screen, so a case flip can redraw it
  let bigWord = null; // the .big-word of the card on screen: a flip rewrites it, never replaces the card
  const paint = (entry) => { bigWord.className = `big-word ${readingClass(cs)}`; bigWord.innerHTML = render(entry.word, cs); };
  // Builds the card for a NEW entry. The caller (judged.js) keeps the returned element as the reward-pop anchor.
  const show = (entry) => {
    current = entry;
    bigWord = h("div", { class: "big-word" });
    paint(entry);
    const card = h("div", { class: "card word-card" }, bigWord);
    L.play.replaceChildren(card, tray);
    refreshTray();
    return card;
  };
  // A flip redraws the word in place and updates Dad's hint, unless Dad's bar is showing "try again" text.
  cs.onChange(() => {
    if (current) paint(current);
    if (L.hint.textContent === shownHint) L.setHint(baseHint());
    shownHint = L.hint.textContent;
  });

  const record = async (entry, result) => {
    const block = rewardForWord(result, rewarded);
    const emeralds = earnRates().word_emerald; // a correct or assisted word also earns emeralds for the village
    const level = entry.level; // the word's OWN level: a mixed-in easier word never counts toward the current level
    await commitUntilSaved({ type: "word", track: cs.track(), item: entry.word, result, level }, (p) => {
      if (block) { p.inventory[block] += 1; p.inventory.emerald += emeralds; }
    });
    tracker.record(result, level);
    L.setLevel(...tracker.lines());
    if (block) {
      rewarded += 1;
      playJingle(); // a correct (or assisted) word; a miss earns nothing and makes no sound
    }
    refreshTray();
    return block;
  };

  // No letter cue here, in either case: the cues (lowercase b/d, the bed picture) belong only to Letter Mine and
  // Bridge Match. Dad's bar tells him what to do instead.
  return runJudged(L, { entries, show, cueFor: () => [], record, againHint: "Sound it out together, then tap." });
}
