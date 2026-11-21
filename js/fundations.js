// Fundations path engine (docs/fundations.md): data validation and loading, presenter mobs, item pickers and the
// progress derivation. Pure logic plus one fetch: no DOM, so node can test it. The OG phonics ladder (words.json,
// craft_words.json, levels.json) is separate and untouched.
//
// Loud failure: every validator throws an Error naming the unit/item/field; nothing is defaulted, coerced or skipped.
// The Python mirror of the progress derivation is server.py derive_fundations_progress (tests/test_fundations_engine.py
// checks that the two agree); the event field rules are mirrored in server.py validate_event and offline.js.
import { MOB_IDS } from "./mobsprites.js";

export const UNITS = 14;
export const WORLDS = ["overworld", "nether"];
export const GAMES = ["battle", "ambush", "forge", "boss", "sounds"];
/** Game -> the modes it may record (fund_try.mode). Boss tries are always mode "sentence" (Unit 1: letters, kind "letter"). */
export const GAME_MODES = { battle: ["read", "find"], ambush: ["read"], forge: ["spell"], boss: ["sentence"], sounds: ["read", "find"] };
export const ITEM_KINDS = ["letter", "regular", "skill", "trick"];
/** fund_try kinds: the item kinds, "sentence" (game boss only) and "sound" (game sounds only: a sound card, not a reading item). */
export const TRY_KINDS = [...ITEM_KINDS, "sentence", "sound"];
/** Games whose vanquishes count toward waking the unit boss. */
export const PRACTICE_GAMES = ["battle", "ambush", "forge", "sounds"];
export const BOSS_HEARTS = 6;
export const OVERWORLD_MOBS = MOB_IDS.slice(0, 14);
export const NETHER_MOBS = MOB_IDS.slice(14);
/** Armor tier n (1..6) is ARMOR_NAMES[n-1]; units beaten needed for each tier (docs/fundations.md "Rewards"). */
export const ARMOR_NAMES = ["leather", "chainmail", "iron", "golden", "diamond", "netherite"];
export const ARMOR_AT = [1, 3, 6, 9, 12, 14];

/** graphemes_new vocabulary, identical to tools/fundations_check.py: tag words, "-suffix"/"multi+..." tags, v-e patterns, or letters. */
export const TAG_WORDS = ["blend", "cvc", "multisyllable", "review", "closed", "5sound"];
const UNIT1_GRAPHEMES = [..."abcdefghijklmnopqrstuvwxyz".replace("q", ""), "qu"];
/** True when `g` is a legal graphemes_new entry (the checker's is_tag, v-e pattern or plain grapheme token). */
export const isGraphemeEntry = (g) => isStr(g) && (g.startsWith("-") || g.startsWith("multi+") || TAG_WORDS.includes(g) || /^[aeiou]_e$/.test(g) || /^[a-z]+$/.test(g));
/** A sound card: 1-3 lowercase letters, or a split pattern such as "a-e". Mirrors tools/fundations_check.py SOUND_CARD_RE. */
const SOUND_CARD_RE = /^[a-z]{1,3}(-[a-z]{1,3})?$/;
const RULE_KEYS = ["boss_unlock_vanquished", "review_share", "golden_every", "session_items"];
const UNIT_KEYS = ["unit", "title", "skills", "graphemes_new", "trick_words_new", "regular_hfw", "sample_words", "items", "forge", "sentences", "boss", "sounds_new"];
const isInt = (x) => Number.isInteger(x);
const isStr = (x) => typeof x === "string" && x.length > 0;
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const strList = (x) => Array.isArray(x) && x.every(isStr);

/** The mob that holds the sign for an item of this kind in this world (docs/fundations.md "Mobs"). */
export function presenterFor(kind, world) {
  const table = {
    letter: ["slime", "magma_cube"], regular: ["zombie", "zombified_piglin"],
    skill: ["creeper", "blaze"], trick: ["skeleton", "wither_skeleton"], sound: ["witch", "ghast"],
  };
  if (!Object.hasOwn(table, kind)) throw new Error(`presenterFor: unknown item kind ${JSON.stringify(kind)} (one of ${[...ITEM_KINDS, "sound"].join(", ")})`);
  const i = WORLDS.indexOf(world);
  if (i < 0) throw new Error(`presenterFor: unknown world ${JSON.stringify(world)} (one of ${WORLDS.join(", ")})`);
  return table[kind][i];
}

/**
 * Case override for render(): Overworld is small caps, Nether is lowercase. Returns a CaseState-shaped object. The Nether one
 * carries `asWritten`: Fundations data is already lowercase except real capitals ("I", "Mr.", names, a sentence's first
 * letter), and render() must keep those instead of flattening them (a trick word "I" must never show as "i").
 */
export function worldCase(world) {
  if (world === "overworld") return { case: "smallcaps" };
  if (world === "nether") return { case: "lowercase", asWritten: true };
  throw new Error(`worldCase: unknown world ${JSON.stringify(world)}`);
}

/** Punctuation allowed in sentences of unit u (period from 2, ? from 3, ! and quotes from 4). */
function sentenceChars(u) {
  let extra = "";
  if (u >= 2) extra += ".";
  if (u >= 3) extra += "?";
  if (u >= 4) extra += "!\"“”";
  return new RegExp(`^[A-Za-z ${extra.replace(/[?.!"]/g, "\\$&")}]+$`);
}

/**
 * Validate app/data/fundations.json (shape in docs/fundations.md "Data"). Throws an Error naming `file`, the unit and the
 * field. Returns `data`. Decodability and whether a "skill" word really uses a new feature (graphemes_new also holds
 * abstract features such as "cvc", "blend", "a_e") cannot be checked mechanically here; tools/fundations_check.py does
 * that. This checks every structural and cross-field rule.
 */
export function validateFundations(data, file = "data/fundations.json") {
  const fail = (at, msg) => { throw new Error(`${file}: ${at}: ${msg}`); };
  const need = (ok, at, msg) => { if (!ok) fail(at, msg); };
  need(isObj(data), "root", "must be an object");
  for (const k of Object.keys(data)) need(["v", "source", "rules", "units"].includes(k), k, "unknown field");
  need(data.v === 1, "v", `must be 1 (got ${JSON.stringify(data.v)})`);
  need(isStr(data.source), "source", "must be a non-empty string");
  need(isObj(data.rules), "rules", "must be an object");
  for (const k of Object.keys(data.rules)) need(RULE_KEYS.includes(k), `rules.${k}`, "unknown field");
  for (const k of RULE_KEYS) need(k in data.rules, `rules.${k}`, "is required");
  const r = data.rules;
  for (const k of ["boss_unlock_vanquished", "golden_every", "session_items"]) need(isInt(r[k]) && r[k] >= 1, `rules.${k}`, "must be an integer >= 1");
  need(typeof r.review_share === "number" && r.review_share >= 0 && r.review_share <= 1, "rules.review_share", "must be a number 0..1");
  need(Array.isArray(data.units) && data.units.length === UNITS, "units", `must be an array of ${UNITS} units`);

  const trickSoFar = new Set();
  const cardsSeen = new Set(); // sound cards are unique across all units (a card is taught once)
  data.units.forEach((u, idx) => {
    const at = `unit ${idx + 1}`;
    need(isObj(u), at, "must be an object");
    for (const k of Object.keys(u)) need(UNIT_KEYS.includes(k), `${at}.${k}`, "unknown field");
    for (const k of UNIT_KEYS) need(k in u, `${at}.${k}`, "is required");
    need(u.unit === idx + 1, `${at}.unit`, `must be ${idx + 1} (array order, each exactly once; got ${JSON.stringify(u.unit)})`);
    need(isStr(u.title), `${at}.title`, "must be a non-empty string");
    for (const k of ["skills", "graphemes_new", "trick_words_new", "regular_hfw", "sample_words"]) need(strList(u[k]), `${at}.${k}`, "must be an array of non-empty strings");
    for (const g of u.graphemes_new) need(isGraphemeEntry(g), `${at}.graphemes_new`, `"${g}" is not a grapheme, v-e pattern (a_e) or tag (${TAG_WORDS.join(", ")}, -s, multi+-s ...)`);
    if (idx === 0) need(u.graphemes_new.length === UNIT1_GRAPHEMES.length && UNIT1_GRAPHEMES.every((g) => u.graphemes_new.includes(g)), `${at}.graphemes_new`, "Unit 1 must be exactly the single consonants (q as qu), short vowels and qu");
    for (const w of u.trick_words_new) trickSoFar.add(w);

    // sounds_new: the sound cards first taught in this unit (docs/fundations.md "Sound cards")
    need(Array.isArray(u.sounds_new), `${at}.sounds_new`, "must be an array");
    u.sounds_new.forEach((s, i) => {
      const sa = `${at}.sounds_new[${i}]`;
      need(isObj(s) && Object.keys(s).length === 2 && "card" in s && "say" in s, sa, "must be {card, say}");
      need(isStr(s.card) && SOUND_CARD_RE.test(s.card), `${sa}.card`, `must be lowercase letters, optionally with one hyphen (a-e) (got ${JSON.stringify(s.card)})`);
      need(isStr(s.say), `${sa}.say`, "must be a non-empty string (Dad's hint)");
      need(!cardsSeen.has(s.card), `${sa}.card`, `"${s.card}" is already a sound card of an earlier unit or of this one`);
      cardsSeen.add(s.card);
    });

    // items
    need(Array.isArray(u.items) && u.items.length > 0, `${at}.items`, "must be a non-empty array");
    const texts = new Set();
    u.items.forEach((it, i) => {
      const ia = `${at}.items[${i}]`;
      need(isObj(it) && Object.keys(it).every((k) => k === "text" || k === "kind"), ia, "must be {text, kind}");
      need(isStr(it.text) && /^[A-Za-z.]+$/.test(it.text), `${ia}.text`, `must be letters (got ${JSON.stringify(it.text)})`);
      need(it.text === it.text.toLowerCase() || /^[A-Z][a-z.]*$/.test(it.text), `${ia}.text`, `"${it.text}" must be lowercase (only "I" and names or Mr./Mrs. are capitalised)`);
      need(!texts.has(it.text), `${ia}.text`, `"${it.text}" is repeated in this unit`);
      texts.add(it.text);
      need(ITEM_KINDS.includes(it.kind), `${ia}.kind`, `must be one of ${ITEM_KINDS.join(", ")} (got ${JSON.stringify(it.kind)})`);
      need((it.kind === "letter") === (idx === 0), `${ia}.kind`, it.kind === "letter" ? `"letter" items belong to Unit 1 only` : "Unit 1 items must all be kind letter");
      if (it.kind === "letter") need(/^[a-z]{1,2}$/.test(it.text) && (it.text.length === 1 || it.text === "qu"), `${ia}.text`, "a letter item is one letter (qu may stand for q)");
      if (it.kind === "trick") need(trickSoFar.has(it.text), `${ia}.text`, `"${it.text}" is not a trick word of unit ${idx + 1} or earlier`);
    });
    for (const k of ["regular_hfw", "sample_words", "trick_words_new"]) for (const w of u[k]) need(texts.has(w), `${at}.${k}`, `"${w}" must appear in items`);
    for (const w of u.trick_words_new) need(u.items.find((i) => i.text === w).kind === "trick", `${at}.trick_words_new`, `"${w}" must be an item of kind trick`);
    if (idx === 0) {
      const have = new Set(u.items.map((i) => i.text));
      for (const l of "abcdefghijklmnopqrstuvwxyz") need(have.has(l) || (l === "q" && have.has("qu")), `${at}.items`, `letter "${l}" is missing (all 26, qu may stand for q)`);
    } else {
      const rs = u.items.filter((i) => i.kind === "regular" || i.kind === "skill").length;
      const sk = u.items.filter((i) => i.kind === "skill").length;
      need(rs >= 24, `${at}.items`, `needs >= 24 regular+skill items (has ${rs})`);
      need(sk >= 12, `${at}.items`, `needs >= 12 skill items (has ${sk})`);
    }

    // forge
    need(Array.isArray(u.forge) && u.forge.length >= 8, `${at}.forge`, "needs >= 8 entries");
    u.forge.forEach((f, i) => {
      const fa = `${at}.forge[${i}]`;
      need(isObj(f) && Object.keys(f).every((k) => ["word", "blank", "choices"].includes(k)) && isStr(f.word) && isStr(f.blank), fa, "must be {word, blank, choices}");
      need(f.word.includes(f.blank), `${fa}.blank`, `"${f.blank}" is not a substring of "${f.word}"`);
      need(Array.isArray(f.choices) && f.choices.length >= 2 && f.choices.length <= 3 && f.choices.every(isStr), `${fa}.choices`, "must be 2 or 3 strings");
      need(new Set(f.choices).size === f.choices.length && f.choices.includes(f.blank), `${fa}.choices`, `must be distinct and include the blank "${f.blank}"`);
      if (idx === 0) need(f.word.length === 3 && f.blank === f.word[0], fa, "Unit 1 forge is the first letter of a 3-letter CVC word");
    });

    // sentences
    need(Array.isArray(u.sentences), `${at}.sentences`, "must be an array");
    if (idx === 0) need(u.sentences.length === 0, `${at}.sentences`, "Unit 1 has no sentences (its boss uses letters)");
    else need(u.sentences.length >= 6, `${at}.sentences`, `needs >= 6 sentences (has ${u.sentences.length})`);
    const allowed = sentenceChars(idx + 1);
    u.sentences.forEach((s, i) => {
      const sa = `${at}.sentences[${i}]`;
      need(isObj(s) && Object.keys(s).length === 1 && isStr(s.text), sa, "must be {text}");
      need(allowed.test(s.text), `${sa}.text`, `${JSON.stringify(s.text)} uses punctuation not taught by unit ${idx + 1}`);
      need(/^["“]?[A-Z]/.test(s.text), `${sa}.text`, "first word must be capitalised");
    });

    // boss
    need(isObj(u.boss) && Object.keys(u.boss).every((k) => k === "overworld" || k === "nether"), `${at}.boss`, "must be {overworld, nether}");
    need(OVERWORLD_MOBS.includes(u.boss.overworld), `${at}.boss.overworld`, `must be an overworld mob id (got ${JSON.stringify(u.boss.overworld)})`);
    need(NETHER_MOBS.includes(u.boss.nether), `${at}.boss.nether`, `must be a nether mob id (got ${JSON.stringify(u.boss.nether)})`);
    if (idx === UNITS - 1) need(u.boss.overworld === "ender_dragon" && u.boss.nether === "wither", `${at}.boss`, "Unit 14 bosses are ender_dragon and wither");
  });
  return data;
}

/** Fetch and validate data/fundations.json (throws naming the file). */
export async function loadFundations() {
  const file = "data/fundations.json";
  let res;
  try { res = await fetch(file, { cache: "no-store" }); } catch (e) { throw new Error(`${file}: could not fetch (${e.message})`); }
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  let obj;
  try { obj = await res.json(); } catch (e) { throw new Error(`${file}: not valid JSON (${e.message})`); }
  return validateFundations(obj, file);
}

/** The unit record for unit number u (1..14); throws on anything else. */
export function unitOf(data, u) {
  if (!isInt(u) || u < 1 || u > UNITS) throw new Error(`unit must be an integer 1..${UNITS} (got ${JSON.stringify(u)})`);
  return data.units[u - 1];
}

/** Every trick word taught in units 1..u (cumulative, in teaching order, no repeats). */
export function trickWordsUpTo(data, u) {
  unitOf(data, u);
  const out = [];
  for (const unit of data.units.slice(0, u)) for (const w of unit.trick_words_new) if (!out.includes(w)) out.push(w);
  return out;
}

// --- Deterministic randomness: every picker takes an rng (() => [0,1)), so tests pass a seeded one --------------------
/** mulberry32: a small seeded rng returning floats in [0,1). */
export function seededRng(seed) {
  if (!isInt(seed)) throw new Error(`seededRng: seed must be an integer (got ${JSON.stringify(seed)})`);
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function needRng(rng, who) {
  if (typeof rng !== "function") throw new Error(`${who}: an rng function is required (pass seededRng(seed) or Math.random)`);
}

/** Fisher-Yates shuffle of a copy, using rng. */
export function shuffleWith(rng, arr) {
  needRng(rng, "shuffleWith");
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * n picks from `pool` ({item, weight}), weighted, without repeats until the pool is used up; if n exceeds the pool the
 * draw starts a new cycle (a round may repeat an item only when the pool is smaller than the round).
 */
export function weightedPicks(pool, n, rng) {
  if (pool.length === 0) throw new Error("weightedPicks: nothing to pick from");
  const out = [];
  let left = [];
  while (out.length < n) {
    if (left.length === 0) left = pool.slice();
    const total = left.reduce((s, p) => s + p.weight, 0);
    let x = rng() * total;
    let i = 0;
    while (i < left.length - 1 && x >= left[i].weight) { x -= left[i].weight; i++; }
    out.push(left[i].item);
    left.splice(i, 1);
  }
  return out;
}

const uniform = (items) => items.map((item) => ({ item, weight: 1 }));

/**
 * The items of one Battle or Ambush round: `n` (default rules.session_items) entries {text, kind, unit}; `unit` is where
 * the item was taught.
 *  battle: round(n * review_share) items from units before `unit` (none in Unit 1), the rest from `unit`; no item twice
 *    in a round while the pools last. Order is shuffled.
 *  ambush: trick words of units <= `unit` only (kind "trick"); this unit's new trick words weigh x3. Throws for Unit 1.
 * Deterministic for a given rng; callers add the victory card themselves (docs/design.md Confidence rules).
 */
export function pickRoundItems(data, u, game, rng, n = data.rules.session_items) {
  needRng(rng, "pickRoundItems");
  const unit = unitOf(data, u);
  const tag = (src) => (it) => ({ text: it.text, kind: it.kind, unit: src.unit });
  if (game === "ambush") {
    const pool = [];
    for (const src of data.units.slice(0, u)) {
      for (const w of src.trick_words_new) {
        const it = src.items.find((i) => i.text === w);
        pool.push({ item: tag(src)(it), weight: src === unit ? 3 : 1 });
      }
    }
    if (pool.length === 0) throw new Error(`pickRoundItems: no trick words up to unit ${u} (Trick Word Ambush starts at Unit 2)`);
    return weightedPicks(pool, n, rng);
  }
  if (game !== "battle") throw new Error(`pickRoundItems: game must be "battle" or "ambush" (got ${JSON.stringify(game)})`);
  const here = unit.items.map(tag(unit));
  const seen = new Set(here.map((i) => i.text));
  const earlier = [];
  for (const src of data.units.slice(0, u - 1)) for (const it of src.items) if (!seen.has(it.text)) { seen.add(it.text); earlier.push(tag(src)(it)); }
  const nReview = earlier.length ? Math.round(n * data.rules.review_share) : 0;
  const picks = [...weightedPicks(uniform(here), n - nReview, rng), ...(nReview ? weightedPicks(uniform(earlier), nReview, rng) : [])];
  return shuffleWith(rng, picks);
}

/** `n` (default rules.session_items) Sword Forge entries {word, blank, choices} of `unit`, shuffled, no repeats while the pool lasts. */
export function pickForgeItems(data, u, rng, n = data.rules.session_items) {
  needRng(rng, "pickForgeItems");
  return weightedPicks(uniform(unitOf(data, u).forge), n, rng);
}

/** The boss's BOSS_HEARTS items: sentences {text, kind:"sentence"}, or in Unit 1 letters {text, kind:"letter"}. */
export function pickBossItems(data, u, rng, hearts = BOSS_HEARTS) {
  needRng(rng, "pickBossItems");
  const unit = unitOf(data, u);
  const pool = u === 1
    ? unit.items.filter((i) => i.kind === "letter").map((i) => ({ text: i.text, kind: "letter" }))
    : unit.sentences.map((s) => ({ text: s.text, kind: "sentence" }));
  return weightedPicks(uniform(pool), hearts, rng);
}

/** Armor tier 0..6 for the number of units beaten (0 none, 1-2 leather, 3-5 chainmail, 6-8 iron, 9-11 gold, 12-13 diamond, 14 netherite). */
export function armorTierFor(unitsBeaten) {
  if (!isInt(unitsBeaten) || unitsBeaten < 0 || unitsBeaten > UNITS) throw new Error(`armorTierFor: units beaten must be an integer 0..${UNITS} (got ${JSON.stringify(unitsBeaten)})`);
  return ARMOR_AT.filter((n) => unitsBeaten >= n).length;
}

/**
 * Fundations progress DERIVED from events (never stored). Same rule and same result shape as server.py
 * derive_fundations_progress:
 *   { start_unit, boss_needed, units_beaten, armor_tier,
 *     units: [14 x {unit, beaten, worlds: {overworld|nether: {open, boss_won, vanquished, boss_ready}}}],
 *     vanquished: {mob: count}, golden: {mob: floor(count / golden_every)} }
 * `settings` = progress.settings (fundations_start_unit missing reads as 1); `data` needs data.rules only.
 * vanquished per world counts correct+assisted fund_try in battle/ambush/forge/sounds; per-mob counts (trophy wall) count every game.
 * Overworld u is open if u <= start or the Nether boss of u-1 is won; Nether u is open if u < start or the Overworld
 * boss of u is won. A unit is beaten when its Nether boss is won.
 */
export function deriveFundationsProgress(events, settings, data) {
  const start = settings.fundations_start_unit ?? 1;
  if (!isInt(start) || start < 1 || start > UNITS) throw new Error(`settings.fundations_start_unit must be an integer 1..${UNITS} (got ${JSON.stringify(start)})`);
  const { boss_unlock_vanquished: needed, golden_every: every } = data.rules;
  const won = new Set();
  const count = new Map();
  const mobs = {};
  for (const ev of events) {
    if (ev.type === "fund_boss_won") won.add(`${ev.unit}:${ev.world}`);
    else if (ev.type === "fund_try" && (ev.result === "correct" || ev.result === "assisted")) {
      mobs[ev.mob] = (mobs[ev.mob] ?? 0) + 1;
      if (PRACTICE_GAMES.includes(ev.game)) { const k = `${ev.unit}:${ev.world}`; count.set(k, (count.get(k) ?? 0) + 1); }
    }
  }
  const units = [];
  for (let u = 1; u <= UNITS; u++) {
    const open = { overworld: u <= start || won.has(`${u - 1}:nether`), nether: u < start || won.has(`${u}:overworld`) };
    const worlds = {};
    for (const w of WORLDS) {
      const v = count.get(`${u}:${w}`) ?? 0;
      worlds[w] = { open: open[w], boss_won: won.has(`${u}:${w}`), vanquished: v, boss_ready: v >= needed };
    }
    units.push({ unit: u, beaten: won.has(`${u}:nether`), worlds });
  }
  const beaten = units.filter((x) => x.beaten).length;
  const golden = {};
  for (const [m, n] of Object.entries(mobs)) golden[m] = Math.floor(n / every);
  return { start_unit: start, boss_needed: needed, units_beaten: beaten, armor_tier: armorTierFor(beaten), units, vanquished: mobs, golden };
}

/**
 * Dashboard numbers for one unit+world (docs/fundations.md "Dashboard"): accuracy by kind (tries and independent-correct
 * counts), the trick words missed in the last 10 trick tries ("missed" = not independent: miss or assisted), and the
 * boss tries. Pure; reads fund_try events only.
 */
export function fundationsReport(events, unit, world) {
  const tries = events.filter((e) => e.type === "fund_try" && e.unit === unit && e.world === world);
  const byKind = {};
  for (const k of TRY_KINDS) byKind[k] = { tries: 0, correct: 0 };
  for (const e of tries) { byKind[e.kind].tries += 1; if (e.result === "correct") byKind[e.kind].correct += 1; }
  const lastTrick = tries.filter((e) => e.kind === "trick").slice(-10);
  const missed = [...new Set(lastTrick.filter((e) => e.result !== "correct").map((e) => e.item))];
  return { tries: tries.length, byKind, trickMissed: missed };
}
