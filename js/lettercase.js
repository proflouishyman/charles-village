// Letter-case layer (plans/2026-11-07_letter-case-design.md section A). Pure: no DOM, no network.
// Each screen has a STARTING case (Dad's setting, or a stage override) and a live CaseState that a switch can flip;
// every text Charles reads is drawn through render() so one function decides how a letter looks.
import { toSmallCaps, toMixedCase, escapeHtml, renderWords } from "./smallcaps.js";
import { swappedLetters } from "./swap.js";
import { eligibleWords } from "./rules.js";

export const CASE_SCREENS = ["story", "blocks", "craft", "mine", "match"];
/** Cases Dad can set as a screen's starting case. ("mixed" exists only as a stage override, see createCaseState.) */
export const CASES = ["smallcaps", "lowercase"];
/** What a screen shows when nothing is set: exactly the behaviour before this layer existed. */
export const CASE_DEFAULTS = { story: "smallcaps", blocks: "smallcaps", craft: "smallcaps", mine: "lowercase", match: "lowercase" };
/** CaseState-shaped constant for chrome (titles, buttons, interludes): always small caps. */
export const CHROME = Object.freeze({ case: "smallcaps" });

const MIXED = "mixed";
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

/** Validate settings.letter_case ({screen: case}, every key optional). Throws an Error naming `field`. Returns v. */
export function validateLetterCase(v, field = "settings.letter_case") {
  if (!isObj(v)) throw new Error(`${field}: must be an object {screen: case}`);
  for (const [k, c] of Object.entries(v)) {
    if (!CASE_SCREENS.includes(k)) throw new Error(`${field}.${k}: screen must be one of ${CASE_SCREENS.join(", ")}`);
    if (!CASES.includes(c)) throw new Error(`${field}.${k}: must be one of ${CASES.join(", ")} (got ${JSON.stringify(c)})`);
  }
  return v;
}

/**
 * The case a screen starts in: stage override, else Dad's setting, else CASE_DEFAULTS. Independent of
 * settings.lowercase_track (that flag only gates Home tiles and the introduction rule). An override may be "mixed".
 */
export function startCaseFor(progress, screen, override) {
  if (!CASE_SCREENS.includes(screen)) throw new Error(`startCaseFor: unknown screen "${screen}"`);
  if (override !== undefined && override !== null) {
    if (!CASES.includes(override) && override !== MIXED) throw new Error(`startCaseFor: bad case override ${JSON.stringify(override)}`);
    return override;
  }
  const lc = progress.settings.letter_case;
  if (lc === undefined) return CASE_DEFAULTS[screen];
  validateLetterCase(lc);
  return lc[screen] ?? CASE_DEFAULTS[screen];
}

/** The event/stats track for a case: smallcaps -> smallcaps; lowercase and mixed -> lowercase. */
export function trackOf(caseName) {
  if (caseName === "smallcaps") return "smallcaps";
  if (caseName === "lowercase" || caseName === MIXED) return "lowercase";
  throw new Error(`trackOf: unknown case "${caseName}"`);
}

/**
 * CaseState for one stage run. `override` replaces the starting case; `locked` means no switch is shown (set()/toggle()
 * then throw). A "mixed" start (swap-in story) cycles mixed -> smallcaps -> lowercase. `lowerSet` (letters shown as
 * plain lowercase in mixed text) comes from the saved swap percent. Flips are not persisted.
 */
export function createCaseState(app, screen, { override, locked = false } = {}) {
  let cur = startCaseFor(app.store.progress, screen, override);
  const options = cur === MIXED ? [MIXED, "smallcaps", "lowercase"] : ["smallcaps", "lowercase"];
  let lowerSet = new Set();
  let percent = 0;
  if (cur === MIXED) {
    if (!Array.isArray(app.swapOrder)) throw new Error("createCaseState: a mixed case needs app.swapOrder (swap_order.json was not loaded)");
    percent = app.store.progress.settings.lowercase_percent ?? 0;
    lowerSet = new Set(swappedLetters(app.swapOrder, percent));
  }
  const listeners = [];
  const cs = {
    screen, options, locked, lowerSet, percent,
    current: () => cur,
    track: () => trackOf(cur),
    /** Switch to `c` (must be one of options) and tell every listener. */
    set(c) {
      if (locked) throw new Error(`CaseState(${screen}): the case is locked`);
      if (!options.includes(c)) throw new Error(`CaseState(${screen}): "${c}" is not one of ${options.join(", ")}`);
      cur = c;
      for (const fn of listeners) fn(cur);
    },
    /** Move to the next option (wraps). */
    toggle() { cs.set(options[(options.indexOf(cur) + 1) % options.length]); },
    /** Register fn(case) to re-render the current item after a flip. */
    onChange(fn) { listeners.push(fn); },
  };
  return cs;
}

/** Confusable gate for words: applied only when the case is lowercase or mixed (small-caps shapes do not mirror). */
export function gateWords(words, caseName, active) {
  return caseName === "smallcaps" ? words : eligibleWords(words, active);
}

/** Confusable gate for single letters (craft distractors): same rule as gateWords. */
export function gateLetters(letters, caseName, active) {
  return caseName === "smallcaps" ? letters : letters.filter((l) => active.includes(l));
}

/**
 * THE case-aware renderer: HTML for `text` in the case `cs` shows. cs is a CaseState or CHROME.
 * as "letters" (default): tiles, words, single letters. as "words": story sentences (clickable word spans).
 */
export function render(text, cs, { as = "letters" } = {}) {
  const c = typeof cs.current === "function" ? cs.current() : cs.case;
  if (as === "words") return renderWords(text, c, cs.lowerSet);
  if (as !== "letters") throw new Error(`render: unknown as "${as}"`);
  if (c === "smallcaps") return toSmallCaps(text);
  if (c === "lowercase") return escapeHtml(String(text).toLowerCase());
  if (c === MIXED) {
    if (!(cs.lowerSet instanceof Set)) throw new Error("render: mixed needs a lowerSet");
    return toMixedCase(String(text).toLowerCase(), cs.lowerSet);
  }
  throw new Error(`render: unknown case "${c}"`);
}

/** CSS class for a reading node: "reading smallcaps|lowercase|mixed" (the small-caps test allows .reading). */
export function readingClass(cs) {
  return `reading ${cs.current()}`;
}
