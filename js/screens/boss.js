// Unit Boss (docs/fundations.md "Games"): a big boss with 6 hearts. Each turn shows one sentence (Unit 1: one letter, read as
// its sound) in the world's case; Dad judges with Got it! / Let's try again. Got it = a heart breaks; Let's try again = the
// boss blocks (gentle) and he tries again; a retry success is "assisted" and still breaks a heart. No lives, no timer, no red.
// When the last heart goes: defeat animation + loot shower, fund_boss_won (only the first time for this unit+world), and a
// card saying what opened next. The hub (quest.js) owns the boss lock and "Let him try the boss"; this screen is only launched
// once the hub has allowed it, so it does not re-check the lock (it cannot tell the early-open button from a woken boss).
import { stageLayout } from "../layout.js";
import { fundHelp } from "../fundhelp.js";
import { h } from "../ui.js";
import { gameParams, recordFundTry, recordBossWon } from "../fundgame.js";
import { pickBossItems, deriveFundationsProgress, worldCase, BOSS_HEARTS, UNITS } from "../fundations.js";
import { createMobStage, gentleMiss, vanquish } from "../mobstage.js";
import { render } from "../lettercase.js";
import { runJudged } from "./judged.js";
import { getEvents } from "../api.js";
import { playPop } from "../sounds.js";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const mobName = (id) => id.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/**
 * What the win opens next, as plain text for the victory card. Overworld win -> this unit's Nether; Nether win -> the next
 * unit (Unit 14 has none). Independent of settings: it is the progress rule of docs/fundations.md, not a lookup.
 */
export function openedNext(unit, world) {
  if (world === "overworld") return `The Nether of Unit ${unit} is open!`;
  if (unit < UNITS) return `Unit ${unit + 1} is open!`;
  return "You finished every unit!";
}

/** Hearts left after a result: a correct or assisted turn breaks one (never below 0); a miss breaks none. */
export function heartsAfter(hearts, result) {
  if (!["correct", "assisted", "miss"].includes(result)) throw new Error(`heartsAfter: bad result ${JSON.stringify(result)}`);
  return result === "miss" ? hearts : Math.max(0, hearts - 1);
}

/** The row of hearts: one span per heart; broken ones get the class `broken`. */
function heartsRow(total) {
  return h("div", { class: "boss-hearts", id: "boss-hearts" }, ...Array.from({ length: total }, (_, i) => h("span", { class: "boss-heart", "data-i": String(i), text: "♥" })));
}

/** @returns "done" after the boss is beaten, or "quit" when Dad leaves. A thrown error is shown loudly by app.runGame. */
export async function run(app, opts) {
  const { unit, world, data, unitData } = gameParams(app, opts);
  const bossMob = unitData.boss[world];
  const L = stageLayout(app.root, { title: `Unit ${unit} Boss`, help: fundHelp("boss"), dadHint: unit === 1 ? "Charles says the sound of each letter. Got it! breaks a heart." : "Charles reads the sentence. Got it! breaks a heart." });
  const cs = worldCase(world);
  const progress = deriveFundationsProgress(await getEvents(), app.store.progress.settings, data);
  const alreadyWon = progress.units[unit - 1].worlds[world].boss_won;

  const stage = createMobStage({ mob: bossMob, text: null, world, size: "big" });
  const hearts = heartsRow(BOSS_HEARTS);
  const sentenceEl = h("div", { class: `boss-sentence reading ${cs.case}`, id: "boss-sentence" });
  const arena = h("div", { class: "boss-arena", "data-boss": bossMob, "data-world": world }, hearts, stage.el, sentenceEl);
  L.play.replaceChildren(arena);
  let left = BOSS_HEARTS;
  hearts.dataset.left = String(left);

  /** Break the next heart with a hit effect (CSS .hit on the boss; the heart greys out). */
  async function breakHeart() {
    left = heartsAfter(left, "correct");
    hearts.children[left].classList.add("broken");
    hearts.dataset.left = String(left);
    stage.el.classList.add("hit");
    playPop();
    await pause(450);
    stage.el.classList.remove("hit");
  }

  const show = (entry) => {
    sentenceEl.innerHTML = render(entry.text, cs); // keeps punctuation and the capital; true capitals stay full size in small caps
    return sentenceEl; // stays in the page for the whole round (reward-pop anchor invariant)
  };
  // "The boss blocks": the shield clank. gentleMiss alternates step/clank by its miss count, so make the next one a clank.
  const onAgain = async () => { stage.missCount = Math.max(1, stage.missCount | 1); await gentleMiss(stage); };
  const record = async (entry, result, { victory } = {}) => {
    await recordFundTry(app, { unit, world, game: "boss", mode: "sentence", item: entry.text, kind: entry.kind, mob: bossMob, result });
    if (result !== "miss" && left > 0 && !victory) await breakHeart(); // the victory card is a re-shown sentence, never a heart
    return null; // the boss game pays no emeralds; the loot comes with the win
  };

  // Rounds repeat until every heart is gone: a miss breaks none and a second miss on a requeued card would leave a heart
  // standing, so another short round is played. Each round ends on a victory card, so it ends on a success.
  for (;;) {
    const entries = pickBossItems(data, unit, Math.random, left);
    if ((await runJudged(L, { entries, show, cueFor: () => [], onAgain, record })) === "quit") return "quit";
    if (left === 0) break;
  }

  // Defeat: big shake + loot shower, then the card.
  // Save the win BEFORE the 1.5 s animation so closing the tab mid-animation cannot lose it.
  if (!alreadyWon) await recordBossWon(app, { unit, world }); // a replay records nothing, so nothing can be granted twice
  await vanquish(stage, { asBoss: true });
  L.disableButtons();
  L.setHint(alreadyWon ? "He beat it again. Nothing new is granted." : "The boss is beaten: the loot is in the Treasure Pile.");
  sentenceEl.replaceChildren();
  sentenceEl.className = "boss-sentence";
  const card = h("div", { class: "boss-win", id: "boss-win", "data-replay": alreadyWon ? "1" : "0" },
    h("h1", { kid: alreadyWon ? "You beat it again!" : `You beat the ${mobName(bossMob)}!` }),
    h("p", { class: "boss-opened", kid: openedNext(unit, world) }),
    h("button", { class: "btn big", id: "boss-continue", kid: "Keep going" }));
  arena.append(card);
  await Promise.race([new Promise((r) => card.querySelector("#boss-continue").addEventListener("click", r)), L.quitted]);
  return "done";
}
