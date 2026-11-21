// Word Duel (docs/fundations.md "Screen API"). Dad picks a mode, then plays one round:
//  "Read it": one mob at a time walks in holding a sign; Charles reads it; Dad judges (Got it! / Let's try again).
//  "Find it": Dad says the word (Dad bar "Say: <word>"); three mobs hold signs; Charles taps one. A wrong tap makes that mob
//    block with its shield (gentle, silent) and he taps again (right on the retry = assisted); the right mob is vanquished and
//    the others shuffle off.
// Both end on a victory card and follow the Confidence rules (no lives, no timers, no red, success-only sounds).
import { stageLayout } from "../layout.js";
import { fundHelp } from "../fundhelp.js";
import { h } from "../ui.js";
import { gameParams, recordFundTry } from "../fundgame.js";
import { pickRoundItems, presenterFor, deriveFundationsProgress } from "../fundations.js";
import { createMobStage, gentleMiss, vanquish, mobElement } from "../mobstage.js";
import { runJudged } from "./judged.js";
import { runTapped } from "./tapped.js";
import { dadSay } from "../fundationsui.js";
import { getEvents } from "../api.js";
import { playPop } from "../sounds.js";
import { distractorPool, findChoices, nextIsGolden } from "../battlelogic.js";

/** Load css/battle.css once (index.html is not edited for it). */
function ensureCss() {
  if (document.getElementById("battle-css")) return;
  document.head.append(h("link", { id: "battle-css", rel: "stylesheet", href: "css/battle.css" }));
}

/** Dad's mode picker. Resolves "read" | "find" | "quit". The buttons are Charles's chrome (small caps). */
function pickMode(app, world) {
  const L = stageLayout(app.root, { title: "Word Duel", help: fundHelp("battle"), dadHint: "Pick a game: Read it (Charles reads each sign out loud) or Find it (you say the word, he taps the mob)." });
  L.disableButtons();
  L.play.className = "play battle-pick";
  const chosen = new Promise((resolve) => {
    const choice = (mode, mob, title, sub) => h("button", { class: "btn big", id: `battle-${mode}`, "data-mode": mode, onclick: () => resolve(mode) },
      mobElement(mob), h("span", { kid: title }), h("span", { class: "pick-sub", kid: sub }));
    L.play.append(choice("read", presenterFor("regular", world), "Read it", "Read the sign"), choice("find", presenterFor("skill", world), "Find it", "Find the mob"));
  });
  return Promise.race([chosen, L.quitted]);
}

/** @returns "done" or "quit" (the hub redraws itself). */
export async function run(app, opts) {
  const { unit, world, data } = gameParams(app, opts);
  ensureCss();
  const mode = await pickMode(app, world);
  if (mode === "quit") return "quit";

  const items = pickRoundItems(data, unit, "battle", Math.random);
  const pool = distractorPool(data, unit);
  const prog = deriveFundationsProgress(await getEvents(), app.store.progress.settings, data);
  const count = { ...prog.vanquished }; // vanquishes per mob so far; bumped locally after each success
  const every = data.rules.golden_every;
  const save = (entry, result, mob) => recordFundTry(app, { unit, world, game: "battle", mode, item: entry.text, kind: entry.kind, mob, result });
  const bump = (mob) => { count[mob] = (count[mob] ?? 0) + 1; };

  if (mode === "read") return runRead(app, { world, items, count, every, save, bump });
  return runFind(app, { world, items, pool, count, every, save, bump });
}

/** Read it: one mob with a sign, judged by Dad. */
function runRead(app, { world, items, count, every, save, bump }) {
  const L = stageLayout(app.root, { title: "Word Duel", help: fundHelp("battle"), dadHint: "Charles reads the sign out loud." });
  let stage = null; // the current card's mob stage
  return runJudged(L, {
    entries: items,
    cueFor: () => [],
    againHint: "Help him sound it out, then Got it! or Come back to it later.",
    show(entry) {
      stage = createMobStage({ mob: presenterFor(entry.kind, world), text: entry.text, world });
      L.play.className = "play battle-one";
      L.play.replaceChildren(stage.el);
      return stage.el;
    },
    onAgain: () => gentleMiss(stage),
    async record(entry, result) {
      const mob = stage.el.dataset.mob;
      const emeralds = await save(entry, result, mob);
      if (result === "miss") return null;
      stage.setGolden(nextIsGolden(count, mob, every)); // a golden one shows as it falls
      bump(mob);
      playPop();
      await vanquish(stage);
      return emeralds ? "emerald" : null;
    },
  });
}

/** Find it: three signed mobs, Dad says the word, Charles taps one. */
function runFind(app, { world, items, pool, count, every, save, bump }) {
  const L = stageLayout(app.root, { title: "Word Duel", help: fundHelp("battle"), dadHint: "Say the word, then Charles taps the mob holding it." });
  L.disableButtons();
  const say = dadSay(L);
  let stages = []; // [{stage, choice}] of the current card
  let targetStage = null;
  let lastTapped = null;
  let onTap = null; // resolver of the current ask(); null between asks, so taps during an animation do nothing
  const choicesOf = new Map(); // item -> its three choices, so a re-shown card keeps the same line-up

  return runTapped(L, {
    entries: items,
    show(entry) {
      if (!choicesOf.has(entry)) choicesOf.set(entry, findChoices(entry, pool, world, Math.random));
      stages = choicesOf.get(entry).map((choice) => {
        const stage = createMobStage({ mob: choice.mob, text: choice.text, world, size: "small" });
        stage.el.addEventListener("click", () => {
          if (!onTap) return;
          const resolve = onTap;
          onTap = null;
          lastTapped = stage;
          resolve(choice.target);
        });
        return { stage, choice };
      });
      targetStage = stages.find((s) => s.choice.target).stage;
      say(entry.text);
      L.play.className = "play battle-row";
      L.play.replaceChildren(...stages.map((s) => s.stage.el));
      return targetStage.el;
    },
    ask: () => new Promise((resolve) => { onTap = resolve; }),
    async onWrong() {
      // gentleMiss alternates step/clank by missCount; making it odd first means this call always clanks the shield,
      // so a wrong tap blocks and never moves the mob closer.
      if (lastTapped.missCount % 2 === 0) lastTapped.missCount += 1;
      await gentleMiss(lastTapped);
    },
    async record(entry, result) {
      const mob = targetStage.el.dataset.mob;
      const emeralds = await save(entry, result, mob);
      if (result === "miss") return null;
      for (const s of stages) if (s.stage !== targetStage) s.stage.el.classList.add("shuffle-off");
      targetStage.setGolden(nextIsGolden(count, mob, every));
      bump(mob);
      playPop();
      await vanquish(targetStage);
      return emeralds ? "emerald" : null;
    },
  });
}
