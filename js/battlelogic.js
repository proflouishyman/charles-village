// Pure logic for Mob Battle (screens/battle.js): the Find it choices, the decoy mobs and the golden rule. No DOM, so it is
// unit-tested in node (tests/js/battle.test.mjs). Randomness always comes from the rng argument.
import { presenterFor, shuffleWith, ITEM_KINDS, WORLDS } from "./fundations.js";

export const FIND_CHOICES = 3; // one target + two distractors

/** The two game modes Dad can pick (fund_try `mode` values for game "battle"). */
export const BATTLE_MODES = ["read", "find"];

/**
 * Every distinct item of units 1..u (the pool Find it distractors come from): [{text, kind}] in data order, no text twice.
 * Distinct is case-insensitive, so two signs can never look the same in either world's case.
 */
export function distractorPool(data, u) {
  const seen = new Set();
  const out = [];
  for (const unit of data.units.slice(0, u)) {
    for (const it of unit.items) {
      const key = it.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: it.text, kind: it.kind });
    }
  }
  return out;
}

/** The mobs that can present an item in `world` (one per item kind), in ITEM_KINDS order. */
export function presenterMobs(world) {
  if (!WORLDS.includes(world)) throw new Error(`presenterMobs: unknown world ${JSON.stringify(world)}`);
  return ITEM_KINDS.map((k) => presenterFor(k, world));
}

/**
 * The three mobs of one Find it card: [{text, mob, target}] in shuffled order. The target holds `entry.text` and is the
 * mob that presents its kind (so a vanquish is credited like a Read it one); the two distractors hold other texts from
 * `pool` (same kind preferred) on THE SAME mob: the mob must never hint at the answer (in Unit 1 every item is a letter, so a
 * distinct decoy mob would make the one slime always right). Texts are pairwise different (ignoring case).
 * Throws when the pool cannot supply two distractors (a data problem, never papered over).
 */
export function findChoices(entry, pool, world, rng) {
  const targetMob = presenterFor(entry.kind, world);
  const low = entry.text.toLowerCase();
  const others = pool.filter((p) => p.text.toLowerCase() !== low);
  const same = shuffleWith(rng, others.filter((p) => p.kind === entry.kind));
  const rest = shuffleWith(rng, others.filter((p) => p.kind !== entry.kind));
  const decoyTexts = [...same, ...rest].slice(0, FIND_CHOICES - 1);
  if (decoyTexts.length < FIND_CHOICES - 1) {
    throw new Error(`findChoices: only ${decoyTexts.length} distractors available for "${entry.text}" (need ${FIND_CHOICES - 1})`);
  }
  const choices = [{ text: entry.text, mob: targetMob, target: true }, ...decoyTexts.map((d) => ({ text: d.text, mob: targetMob, target: false }))];
  return shuffleWith(rng, choices);
}

/** True when the next vanquish of `mob` is golden: every `goldenEvery`-th one, given `count` = vanquishes of each mob so far. */
export function nextIsGolden(count, mob, goldenEvery) {
  return (((count[mob] ?? 0) + 1) % goldenEvery) === 0;
}
