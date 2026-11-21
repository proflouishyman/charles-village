// Sword Forge (docs/fundations.md "Games"): Dad says a word (Dad bar "Say: <word>", optional speaker), the word shows on
// the anvil with its blank as an empty slot ("hi__"), and Charles taps the tile that fills it. A wrong tap bounces the tile
// off the anvil (gentle, no sound, no red) and he taps again; the right tap drops the letters in and the sword glows one
// notch brighter (GLOW_STEPS notches). Rules follow the Confidence rules via runTapped: a retry success is "assisted" and
// still vanquishes and pays, a second wrong tap is a "miss" (the item returns once), and the round ends on a victory card.
// The glow lives only on this screen: the Screen API has no shared place to carry it into the next Battle, so that
// visual is skipped (see the build report).
import { stageLayout } from "../layout.js";
import { fundHelp } from "../fundhelp.js";
import { gameParams, recordFundTry } from "../fundgame.js";
import { pickForgeItems, presenterFor, deriveFundationsProgress, worldCase } from "../fundations.js";
import { createMobStage, vanquish, prefersReducedMotion } from "../mobstage.js";
import { render } from "../lettercase.js";
import { runTapped } from "./tapped.js";
import { dadSay } from "../fundationsui.js";
import { getEvents } from "../api.js";
import { playPop } from "../sounds.js";
import { shuffle } from "../util.js";
import { h } from "../ui.js";

/** Notches on the sword: the glow after k successes is min(k, GLOW_STEPS). */
export const GLOW_STEPS = 10;
const BOUNCE_MS = 500;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The glow level (0..GLOW_STEPS) after `successes` correct-or-assisted cards. Throws on a bad count. */
export function glowFor(successes) {
  if (!Number.isInteger(successes) || successes < 0) throw new Error(`glowFor: bad success count ${JSON.stringify(successes)}`);
  return Math.min(successes, GLOW_STEPS);
}

/**
 * Split a forge word around its blank: {before, after}. The FIRST occurrence of `blank` is the slot (the data contract,
 * docs/fundations.md). Throws when the blank is not in the word (a data error must be loud, never a skipped item).
 */
export function splitWord(word, blank) {
  const i = word.indexOf(blank);
  if (!blank || i < 0) throw new Error(`forge: blank ${JSON.stringify(blank)} is not in word ${JSON.stringify(word)}`);
  return { before: word.slice(0, i), after: word.slice(i + blank.length) };
}

/**
 * The entries of one round, `n` of them: [{word, blank, choices, unit, kind}]. Mostly the current unit's forge entries;
 * round(n * rules.review_share) come from earlier units (none in Unit 1), never repeating a current-unit word. `unit` is
 * where the entry was taught; `kind` is "letter" for Unit 1 entries (first letter of a CVC word), else "skill".
 * Deterministic for a given rng. Throws when an earlier pool is too small for the review share.
 */
export function pickForgeRound(data, u, rng, n = data.rules.session_items) {
  const tag = (src) => (e) => ({ word: e.word, blank: e.blank, choices: e.choices.slice(), unit: src, kind: src === 1 ? "letter" : "skill" });
  const here = data.units[u - 1].forge;
  const hereWords = new Set(here.map((e) => e.word));
  const earlier = [];
  for (const src of data.units.slice(0, u - 1)) for (const e of src.forge) if (!hereWords.has(e.word)) earlier.push(tag(src.unit)(e));
  const nReview = earlier.length ? Math.round(n * data.rules.review_share) : 0;
  if (earlier.length < nReview) throw new Error(`pickForgeRound: only ${earlier.length} earlier forge words for ${nReview} review slots`);
  const fresh = pickForgeItems(data, u, rng, n - nReview).map(tag(u));
  return shuffle([...fresh, ...shuffle(earlier, rng).slice(0, nReview)], rng);
}

/** Make sure css/forge.css is loaded (index.html may already link it; then this does nothing). */
function ensureForgeStyles() {
  if (document.querySelector('link[href$="css/forge.css"]')) return;
  document.head.append(h("link", { rel: "stylesheet", href: "css/forge.css" }));
}

/** The sword: GLOW_STEPS notches along a blade; `setGlow(k)` lights the first k and sets data-glow on the element. */
export function createSword() {
  const notches = Array.from({ length: GLOW_STEPS }, (_, i) => h("span", { class: "notch", "data-i": String(i + 1) }));
  const el = h("div", { class: "sword", "data-glow": "0", style: "--glow:0" },
    h("div", { class: "blade" }, ...notches), h("div", { class: "guard" }), h("div", { class: "hilt" }));
  const setGlow = (k) => {
    if (!Number.isInteger(k) || k < 0 || k > GLOW_STEPS) throw new Error(`setGlow: bad glow ${JSON.stringify(k)}`);
    el.dataset.glow = String(k);
    el.style.setProperty("--glow", String(k));
    notches.forEach((n, i) => n.classList.toggle("lit", i < k));
  };
  return { el, setGlow };
}

export async function run(app, opts) {
  const { unit, world, data } = gameParams(app, opts);
  ensureForgeStyles();
  const wc = worldCase(world);
  const L = stageLayout(app.root, { title: "Sword Forge", help: fundHelp("forge"), dadHint: "Say the word for Charles. He taps the letters that fit; no judging needed.", reserveCue: false });
  L.disableButtons();
  const say = dadSay(L);
  const entries = pickForgeRound(data, unit, Math.random);
  const prog = deriveFundationsProgress(await getEvents(), app.store.progress.settings, data);
  const count = { ...prog.vanquished };
  const sword = createSword();
  let successes = 0;
  let cur = null; // the card on screen: {entry, stage, slot, tiles, resolve, lastWrong}

  /** Tap handler shared by every tile of the current card. Ignored unless a tap is awaited (between taps tiles are disabled). */
  function onTile(tile) {
    if (!cur || !cur.resolve) return;
    const r = cur.resolve;
    cur.resolve = null;
    cur.tiles.forEach((t) => (t.disabled = true));
    if (tile.dataset.choice === cur.entry.blank) { r(true); return; }
    tile.classList.add("tried");
    cur.lastWrong = tile;
    r(false);
  }

  /** Build the card: sword, mob, the word with its empty slot, the choice tiles. Returns the reward-pop anchor (the mob stage). */
  function show(entry, { victory }) {
    const mob = presenterFor(entry.kind, world);
    const golden = ((count[mob] ?? 0) + 1) % data.rules.golden_every === 0;
    const stage = createMobStage({ mob, text: null, world, golden, size: "small" });
    const { before, after } = splitWord(entry.word, entry.blank);
    const slot = h("span", { class: "anvil-slot", "data-blank": entry.blank });
    const part = (t) => h("span", { class: "forge-part", html: render(t, wc) });
    const word = h("div", { class: `forge-word reading ${wc.case}`, "data-word": entry.word }, part(before), slot, part(after));
    const tiles = shuffle(entry.choices, Math.random).map((c) => {
      const t = h("button", { class: `btn choice forge-tile reading ${wc.case}`, "data-choice": c, html: render(c, wc), disabled: "" });
      t.addEventListener("click", () => onTile(t));
      return t;
    });
    cur = { entry, stage, slot, tiles, resolve: null, lastWrong: null };
    say(entry.word);
    L.play.replaceChildren(h("div", { class: `forge${victory ? " victory" : ""}`, "data-world": world },
      h("div", { class: "forge-top" }, sword.el, stage.el),
      h("div", { class: "anvil" }, word),
      h("div", { class: "choices forge-tiles" }, tiles)));
    return stage.el;
  }

  /** Wait for the next tap: true when it is the right tile. Tiles already tried stay out. */
  function ask() {
    return new Promise((resolve) => {
      cur.resolve = resolve;
      cur.tiles.forEach((t) => (t.disabled = t.classList.contains("tried")));
    });
  }

  /** Wrong tap: the tile bounces off the anvil. No sound, nothing red, nothing lost. */
  async function onWrong() {
    const t = cur.lastWrong;
    t.classList.add("bounce");
    await wait(prefersReducedMotion() ? 120 : BOUNCE_MS);
    t.classList.remove("bounce");
  }

  /** Letters drop into the slot (also on a miss, so the answer is seen); a success also lights one more notch. */
  async function record(entry, result) {
    const emeralds = await recordFundTry(app, { unit, world, game: "forge", mode: "spell", item: entry.word, kind: entry.kind, mob: presenterFor(entry.kind, world), result });
    const { slot, stage } = cur;
    slot.innerHTML = render(entry.blank, wc);
    slot.classList.add("filled", "drop");
    if (result === "miss") return null;
    successes += 1;
    sword.setGlow(glowFor(successes));
    const mob = stage.el.dataset.mob;
    count[mob] = (count[mob] ?? 0) + 1;
    playPop();
    await vanquish(stage);
    return emeralds ? "emerald" : null;
  }

  const r = await runTapped(L, { entries, show, ask, onWrong, record });
  return r === "quit" ? "quit" : "done";
}
