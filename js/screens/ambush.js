// Trick Word Ambush (docs/fundations.md "Games"): skeletons (wither skeletons in the Nether) pop out from behind blocks
// (cobblestone / netherrack) one after another, each holding a trick word on its sign. Charles reads it aloud, Dad judges
// with the standard "Got it!" / "Let's try again" (runJudged). There is NO timer of any kind: the lively pace comes from the
// pop-out animation and the short pause between cards. "Let's try again" = the skeleton ducks behind its block and pops back
// up for the retry; a second miss records "miss" and the word pops out again later in the round (runJudged's requeue).
// The round ends on a victory card: a trick word he got right on his own (runJudged's victoryItem rule).
import { h } from "../ui.js";
import { stageLayout } from "../layout.js";
import { fundHelp } from "../fundhelp.js";
import { gameParams, recordFundTry } from "../fundgame.js";
import { pickRoundItems, presenterFor, deriveFundationsProgress } from "../fundations.js";
import { createMobStage, vanquish, prefersReducedMotion } from "../mobstage.js";
import { runJudged } from "./judged.js";
import { getEvents } from "../api.js";
import { playPop } from "../sounds.js";

/** The block a skeleton hides behind in each world. */
export const BLOCK_FOR = { overworld: "cobblestone", nether: "netherrack" };
/** Blocks in the row; a skeleton hides behind one of them (its column). */
export const COLUMNS = 3;
export const DUCK_MS = 450; // ducking down and popping back up, each (shortened under reduced motion)

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** The block name for `world`; throws on an unknown world (never guesses). */
export function blockFor(world) {
  if (!(world in BLOCK_FOR)) throw new Error(`blockFor: unknown world ${JSON.stringify(world)}`);
  return BLOCK_FOR[world];
}

/**
 * The column (0..COLUMNS-1) each card's skeleton hides behind: chosen with `rng`, never the same column twice in a row so the
 * skeletons visibly hop around. Pure, deterministic for a given rng.
 */
export function pickColumns(count, rng) {
  const cols = [];
  for (let i = 0; i < count; i++) {
    let c = Math.floor(rng() * COLUMNS);
    if (i > 0 && c === cols[i - 1]) c = (c + 1 + Math.floor(rng() * (COLUMNS - 1))) % COLUMNS;
    cols.push(c);
  }
  return cols;
}

/** The ambush round's entries: pickRoundItems for "ambush" plus each card's block column. */
export function ambushEntries(data, unit, rng, n) {
  const items = pickRoundItems(data, unit, "ambush", rng, n);
  const cols = pickColumns(items.length, rng);
  return items.map((it, i) => ({ ...it, col: cols[i] }));
}

/** Load css/ambush.css once (the stylesheet is this screen's own file); throws if it cannot be loaded. */
function ensureCss() {
  if (document.querySelector("link[data-ambush-css]")) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = h("link", { rel: "stylesheet", href: "css/ambush.css", "data-ambush-css": "1" });
    link.onload = resolve;
    link.onerror = () => reject(new Error("ambush: css/ambush.css failed to load"));
    document.head.append(link);
  });
}

/** Build one ambush spot: a clip box holding the skeleton (ducked), and the row of blocks in front of it. */
function buildSpot(stage, world, col) {
  const block = blockFor(world);
  const pop = h("div", { class: "ambush-pop", "data-col": String(col), "data-pose": "down" }, stage.el);
  const row = h("div", { class: "ambush-row" },
    ...Array.from({ length: COLUMNS }, (_, i) => h("div", { class: `ambush-block ${block}`, "data-col": String(i) })));
  const spot = h("div", { class: "ambush-spot", "data-world": world, "data-block": block }, pop, row);
  return { spot, pop };
}

/** Play the pop-out: the skeleton rises from behind its block. */
async function popUp(pop) {
  await pause(30); // let the ducked pose paint so the transition runs
  pop.dataset.pose = "up";
  await pause(prefersReducedMotion() ? 100 : DUCK_MS);
}

/** The gentle miss: the skeleton ducks behind its block, then pops back up for another try. No sound, nothing lost. */
async function duckAndReturn(pop) {
  const ms = prefersReducedMotion() ? 100 : DUCK_MS;
  pop.dataset.pose = "down";
  await pause(ms);
  pop.dataset.pose = "up";
  await pause(ms);
}

/** Run one Trick Word Ambush round. `opts` = {unit, world}. Returns "done" or "quit". */
export async function run(app, opts) {
  const { unit, world, data } = gameParams(app, opts);
  await ensureCss();
  const L = stageLayout(app.root, { title: "Trick Word Ambush", help: fundHelp("ambush"), dadHint: "Charles reads the word on the skeleton's sign. Got it! or Let's try again." });
  const entries = ambushEntries(data, unit, Math.random);
  const prog = deriveFundationsProgress(await getEvents(), app.store.progress.settings, data);
  const count = { ...prog.vanquished };
  let current = null; // {stage, pop, mob} of the card on screen

  /** Draw one card: a skeleton behind a block, golden when this vanquish makes it the next golden trophy. */
  function show(entry) {
    const mob = presenterFor("trick", world);
    const golden = ((count[mob] ?? 0) + 1) % data.rules.golden_every === 0;
    const stage = createMobStage({ mob, text: entry.text, world, golden });
    const { spot, pop } = buildSpot(stage, world, entry.col);
    current = { stage, pop, mob };
    L.play.replaceChildren(spot);
    popUp(pop);
    return stage.el;
  }

  /** Save the try, then (for correct or assisted) the success sound and the crumble; a miss only records. */
  async function record(entry, result) {
    const { stage, mob } = current;
    const emeralds = await recordFundTry(app, { unit, world, game: "ambush", mode: "read", item: entry.text, kind: entry.kind, mob, result });
    if (result === "miss") return null;
    count[mob] = (count[mob] ?? 0) + 1;
    playPop();
    await vanquish(stage);
    return emeralds ? "emerald" : null;
  }

  return runJudged(L, { entries, show, cueFor: () => [], onAgain: () => duckAndReturn(current.pop), record });
}
