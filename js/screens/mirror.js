// Mirror Letters: a word with one mirror-prone letter blanked ("_ed"); pick the right one of {letter, mirror partner}.
// Always lowercase (that is the point of the game), never gated by the lowercase track or the letter-introduction rule,
// and not part of the letter-case switch. A wrong tap wiggles gently and shows that letter's cue; the item is recorded
// once, when the right tile is tapped: "correct" on the first try, else "assisted" (never a miss).
// Not registered in main.js yet: the integrator adds the STAGES entry and Home tile (see the build report).
import { stageLayout } from "../layout.js";
import { confusablesIn, applyResult, rewardForGem, PARTNER } from "../rules.js";
import { GEMS_ROW } from "../constants.js";
import { earnRates } from "../store.js";
import { trackerFor, reviewCount } from "../levels.js";
import { commitUntilSaved } from "../store.js";
import { shuffle } from "../util.js";
import { SPRITE_NAMES, spriteElement } from "../sprites.js";
import { playJingle, playPop } from "../sounds.js";
import { h, cueBox, inventoryRow, popReward } from "../ui.js";

const ROUNDS = 10;
/** Letter pairs that join at each level (index = level - 1); level L drills every pair up to and including L. */
export const MIRROR_PAIRS = [["b", "d"], ["p", "q"], ["n", "u"], ["m", "w"]];
export const MIRROR_MAX_LEVEL = MIRROR_PAIRS.length;

/** Letters drilled at `level` (all pairs up to it); throws on a level outside 1..4. */
export function mirrorLetters(level) {
  if (!Number.isInteger(level) || level < 1 || level > MIRROR_MAX_LEVEL) throw new Error(`mirrorLetters: no design for level ${level}`);
  return MIRROR_PAIRS.slice(0, level).flat();
}

/**
 * Positions in `word` holding a mirror letter from `letters`. The "u" of "qu" is skipped (rules.js confusablesIn counts
 * "qu" as q only), so a blank never turns "qu" into a lone "q_".
 */
export function blankPositions(word, letters) {
  const out = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] === "u" && word[i - 1] === "q") continue;
    if (letters.includes(word[i])) out.push(i);
  }
  return out;
}

/**
 * The items for a round at `level`: `n` distinct words, [{word, letter (the blanked one), index (its position)}].
 * 80% come from the level's newest pair, 20% review from the earlier pairs (levels.js reviewCount; none at level 1).
 * Each word contains a mirror letter of its pool; one such occurrence is blanked at random. The review item (if any)
 * opens the round. Throws when the word list cannot supply enough distinct words for a pool. `rng` is injectable.
 */
export function pickMirrorItems(words, level, n = ROUNDS, rng = Math.random) {
  const all = mirrorLetters(level);
  const newest = MIRROR_PAIRS[level - 1];
  const older = all.filter((l) => !newest.includes(l));
  const nReview = reviewCount(level, n);
  const used = new Set();
  const take = (letters, count) => {
    const pool = shuffle(words.filter((w) => !used.has(w.word) && confusablesIn(w.word).some((c) => letters.includes(c))), rng);
    if (pool.length < count) throw new Error(`pickMirrorItems: only ${pool.length} words contain ${letters.join("/")} (need ${count}) at level ${level}`);
    return pool.slice(0, count).map((w) => {
      used.add(w.word);
      const spots = blankPositions(w.word, letters);
      const index = spots[Math.floor(rng() * spots.length)];
      return { word: w.word, letter: w.word[index], index };
    });
  };
  const review = nReview > 0 ? take(older, nReview) : [];
  const fresh = take(newest, n - nReview);
  return [...review.slice(0, 1), ...shuffle([...review.slice(1), ...fresh], rng)];
}

/** The two choice letters for an item, in random order: the blanked letter and its mirror partner. */
export function mirrorChoices(letter, rng = Math.random) {
  if (!PARTNER[letter]) throw new Error(`mirrorChoices: ${JSON.stringify(letter)} is not a mirror letter`);
  return shuffle([letter, PARTNER[letter]], rng);
}

/** The word as tiles, the blank (or, once filled, the right letter) shown at item.index. */
function wordNode(item, filled) {
  const tiles = [...item.word].map((c, i) =>
    h("span", { class: i === item.index ? `mirror-blank${filled ? " filled" : ""}` : "mirror-ch", text: i === item.index && !filled ? "_" : c }));
  return h("div", { class: "big-letter sc-letter reading lowercase mirror-word" }, tiles);
}

export async function run(app) {
  const L = stageLayout(app.root, { title: "Mirror Letters", dadHint: "Charles taps the letter that fits. A wrong tap is logged quietly — no judging needed.", reserveCue: true });
  L.disableButtons();
  const tracker = await trackerFor(app, "mirror");
  L.setLevel(...tracker.lines());
  const roundLevel = tracker.level; // fixed for the whole round: a mid-round level-up must not retag the rest of it
  const items = pickMirrorItems(app.words, roundLevel);
  let done = 0;
  let streak = 0; // independent-correct items in a row: climbs the gem ladder (rules.js rewardForGem); assisted resets it
  const tray = h("div", { class: "tray" });
  const refreshTray = () => tray.replaceChildren(inventoryRow(app.store.progress.inventory, [...GEMS_ROW, "emerald"]));

  /** One item; resolves "correct"/"assisted" once the right tile is tapped, or "quit". */
  async function round(item) {
    const hasPicture = SPRITE_NAMES.includes(item.word);
    L.setHint(hasPicture ? "Charles taps the letter that fits. A wrong tap is logged quietly — no judging needed." : "Say the word for Charles.");
    const word = h("div", { class: "card sc-card" }, wordNode(item, false));
    const buttons = mirrorChoices(item.letter).map((c) => h("button", { class: "btn choice reading lowercase", text: c, "data-letter": c }));
    L.cue.replaceChildren();
    L.setProgress(done, items.length);
    refreshTray();
    L.play.replaceChildren(...(hasPicture ? [h("div", { class: "mirror-picture" }, spriteElement(item.word, 6))] : []), word, h("div", { class: "choices" }, buttons), tray);
    let firstChosen = null;
    let missed = false;
    return new Promise((resolve) => {
      L.quitted.then(() => resolve("quit"));
      buttons.forEach((b) => b.addEventListener("click", async () => {
        const chosen = b.dataset.letter;
        firstChosen ??= chosen;
        buttons.forEach((x) => (x.disabled = true));
        if (chosen === item.letter) {
          const result = missed ? "assisted" : "correct";
          streak = result === "correct" ? streak + 1 : 0;
          const gem = rewardForGem(result, streak); // never null here: a mirror item is correct or assisted, never a miss
          const emeralds = earnRates().mirror_emerald;
          await commitUntilSaved({ type: "mirror", track: "lowercase", item: item.letter, word: item.word, result, chosen: firstChosen, level: roundLevel }, (p) => {
            p.letter_stats[item.letter] = applyResult(p.letter_stats[item.letter], result);
            p.inventory[gem] += 1;
            p.inventory.emerald += emeralds;
          });
          refreshTray();
          playPop();
          tracker.record(result, roundLevel);
          L.setLevel(...tracker.lines());
          word.replaceChildren(wordNode(item, true));
          word.classList.add("shine");
          popReward(word, gem);
          playJingle();
          setTimeout(() => resolve(result), 1200);
        } else {
          missed = true;
          b.classList.add("wiggle");
          L.cue.replaceChildren(cueBox(app.cues[item.letter]));
          setTimeout(() => {
            b.classList.remove("wiggle");
            buttons.forEach((x) => (x.disabled = x === b));
          }, 500);
        }
      }));
    });
  }

  for (const item of items) {
    if ((await round(item)) === "quit") return "quit";
    done += 1;
  }
  L.setProgress(items.length, items.length);
  return "done";
}
