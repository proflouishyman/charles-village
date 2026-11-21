// Pure logic for Witch's Sound Potions (screens/sounds.js; docs/fundations.md "Sound cards"): the drill pool, the weighted round
// and the Find it choices. No DOM, so node tests it (tests/js/soundcards.test.mjs). Randomness always comes from the rng argument.
//
// Why a separate drill: Fundations Level 1 teaches r-controlled vowels and vowel teams as SOUNDS ONLY (Units 8-10) and drills
// every sound card taught so far each day, while the reading items stay closed-syllable words.
import { weightedPicks, shuffleWith, presenterFor, unitOf, WORLDS } from "./fundations.js";

export const SOUND_CHOICES = 3; // Find it: one target + two distractors
export const NEW_CARD_WEIGHT = 3; // this unit's new cards are drawn x3 as often as older ones
/** The two modes Dad can pick (fund_try `mode` values for game "sounds"). */
export const SOUND_MODES = ["read", "find"];

/** Every sound card taught in units 1..u, in teaching order: [{card, say, unit}] (`unit` = where it was first taught). */
export function soundPool(data, u) {
  unitOf(data, u);
  const out = [];
  for (const unit of data.units.slice(0, u)) for (const s of unit.sounds_new) out.push({ card: s.card, say: s.say, unit: unit.unit });
  return out;
}

/**
 * The unit whose new cards are weighted x3 in unit u: u itself when it teaches sound cards, else the most recent earlier unit
 * that does. Throws when no unit up to u has any (the validated data always has some: Unit 1 teaches 26).
 */
export function weightedUnit(data, u) {
  unitOf(data, u);
  for (let i = u; i >= 1; i--) if (data.units[i - 1].sounds_new.length) return i;
  throw new Error(`weightedUnit: no unit up to ${u} teaches any sound card`);
}

/**
 * One round of sound cards: `n` (default rules.session_items) entries {card, say, unit, kind: "sound"}, drawn from the whole
 * pool of units <= u with the weighted unit's cards x NEW_CARD_WEIGHT, no card twice while the pool lasts. Deterministic for a
 * rng. Callers (runJudged / runTapped) re-queue missed cards and add the victory card (docs/design.md Confidence rules).
 */
export function pickSoundItems(data, u, rng, n = data.rules.session_items) {
  const wu = weightedUnit(data, u);
  const pool = soundPool(data, u).map((s) => ({ item: { ...s, kind: "sound" }, weight: s.unit === wu ? NEW_CARD_WEIGHT : 1 }));
  return weightedPicks(pool, n, rng);
}

const LONG = { a: "ā", e: "ē", i: "ī", o: "ō", u: "ū" };
/**
 * The set of sounds a card's hint accepts, as normalised keys: every "/x/" in `say` plus "long a" style hints (mapped to the
 * same mark as /ā/). Two cards sharing a key are not told apart by ear ("ai" and "ay", "er" and "ir", "c" and "k"), so Find it
 * never puts them on the same card line-up. Throws when a hint names no sound (a data problem, never guessed).
 */
export function soundKeys(say) {
  const keys = new Set();
  for (const m of say.matchAll(/\/([^/]+)\/|long ([aeiou])\b/g)) keys.add(m[1] ?? LONG[m[2]]);
  if (keys.size === 0) throw new Error(`soundKeys: the hint ${JSON.stringify(say)} names no sound (/x/ or "long a")`);
  return keys;
}

/** True when two cards share an accepted sound. */
export function sameSound(a, b) {
  const kb = soundKeys(b.say);
  return [...soundKeys(a.say)].some((k) => kb.has(k));
}

/**
 * The three signs of one Find it card: [{card, say, mob, target}] shuffled. All three are on THE SAME mob (witch / ghast; the mob
 * must never hint at the answer), carry different cards, and no distractor shares a sound with the target (Dad says one sound;
 * two right signs would be unfair). Throws when the pool cannot supply two such distractors.
 */
export function soundChoices(entry, pool, world, rng) {
  if (!WORLDS.includes(world)) throw new Error(`soundChoices: unknown world ${JSON.stringify(world)}`);
  const mob = presenterFor("sound", world);
  const ok = pool.filter((p) => p.card !== entry.card && !sameSound(p, entry));
  if (ok.length < SOUND_CHOICES - 1) throw new Error(`soundChoices: only ${ok.length} distractors available for "${entry.card}" (need ${SOUND_CHOICES - 1})`);
  const picks = weightedPicks(ok.map((item) => ({ item, weight: 1 })), SOUND_CHOICES - 1, rng);
  const choices = [{ card: entry.card, say: entry.say, mob, target: true }, ...picks.map((p) => ({ card: p.card, say: p.say, mob, target: false }))];
  return shuffleWith(rng, choices);
}
