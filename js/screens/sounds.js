// Witch's Sound Potions (docs/fundations.md "Sound cards"): a cumulative sound-card drill. Fundations Level 1 teaches r-controlled
// vowels and vowel teams as sounds only and drills every taught card daily; this is that drill.
// A witch (a ghast in the Nether) holds a potion sign showing ONE sound card (a grapheme such as "sh", "ow" or "a-e").
//  "Read it": Charles says the sound; Dad judges (Got it! / Let's try again). Dad's bar shows "Say: <hint>" (every accepted sound).
//  "Find it": Dad says the sound (bar "Say: <card> - <hint>", optional speaker as in Word Duel); three witches hold signs with
//    different cards; Charles taps the right one. A wrong tap blocks with the shield (gentle, silent).
// Right = a potion splashes the witch and she poofs. Both modes follow the Confidence rules (no lives, no timers, no red,
// success-only sounds) and end on a victory card. Pure logic: soundlogic.js.
import { stageLayout } from "../layout.js";
import { fundHelp } from "../fundhelp.js";
import { h } from "../ui.js";
import { gameParams, recordFundTry } from "../fundgame.js";
import { presenterFor, deriveFundationsProgress } from "../fundations.js";
import { createMobStage, gentleMiss, vanquish, mobElement, prefersReducedMotion } from "../mobstage.js";
import { runJudged } from "./judged.js";
import { runTapped } from "./tapped.js";
import { dadSay, sayHint } from "../fundationsui.js";
import { getEvents } from "../api.js";
import { playPop } from "../sounds.js";
import { nextIsGolden } from "../battlelogic.js";
import { pickSoundItems, soundPool, soundChoices } from "../soundlogic.js";

const TITLE = "Witch's Sound Potions";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Throw the potion: a flask flies to the mob and splashes, then the mob poofs (the shared vanquish effect). Everything is added
 * to the stage element and removed again; under reduced motion the flight is skipped and only the short fade plays.
 */
async function potionSplash(stage) {
  const flask = document.createElement("span");
  flask.className = "potion-flask";
  const splash = document.createElement("span");
  splash.className = "potion-splash";
  stage.el.append(flask);
  await pause(prefersReducedMotion() ? 0 : 450);
  flask.remove();
  stage.el.append(splash);
  const gone = vanquish(stage);
  await pause(prefersReducedMotion() ? 0 : 350);
  splash.remove();
  return gone;
}

/** Dad's mode picker. Resolves "read" | "find" | "quit". */
function pickMode(app, world) {
  const L = stageLayout(app.root, { title: TITLE, help: fundHelp("sounds"), dadHint: "Pick a game: Read it (Charles says the sound on each potion sign) or Find it (you say the sound, he taps the witch)." });
  L.disableButtons();
  L.play.className = "play sounds-pick";
  const chosen = new Promise((resolve) => {
    const choice = (mode, title, sub) => h("button", { class: "btn big", id: `sounds-${mode}`, "data-mode": mode, onclick: () => resolve(mode) },
      mobElement(presenterFor("sound", world)), h("span", { kid: title }), h("span", { class: "pick-sub", kid: sub }));
    L.play.append(choice("read", "Read it", "Say the sound"), choice("find", "Find it", "Find the potion"));
  });
  return Promise.race([chosen, L.quitted]);
}

/** @returns "done" or "quit" (the hub redraws itself). */
export async function run(app, opts) {
  const { unit, world, data } = gameParams(app, opts);
  const mode = await pickMode(app, world);
  if (mode === "quit") return "quit";
  const items = pickSoundItems(data, unit, Math.random);
  const prog = deriveFundationsProgress(await getEvents(), app.store.progress.settings, data);
  const mob = presenterFor("sound", world);
  const count = { ...prog.vanquished }; // vanquishes of this mob so far, bumped locally after each success
  const every = data.rules.golden_every;
  const save = (entry, result) => recordFundTry(app, { unit, world, game: "sounds", mode, item: entry.card, kind: "sound", mob, result });
  const ctx = { world, items, count, every, save, mob };
  if (mode === "read") return runRead(app, ctx);
  return runFind(app, { ...ctx, pool: soundPool(data, unit) });
}

/** Read it: one witch with a potion sign, judged by Dad. */
function runRead(app, { world, items, count, every, save, mob }) {
  const L = stageLayout(app.root, { title: TITLE, help: fundHelp("sounds"), dadHint: "Charles says the sound on the potion sign." });
  const say = dadSay(L);
  let stage = null;
  return runJudged(L, {
    entries: items,
    cueFor: () => [],
    // No againHint: runJudged would replace Dad's "Say: <hint>" with it, and Dad still needs the hint while helping.
    show(entry) {
      say(entry.say);
      stage = createMobStage({ mob, text: entry.card, world });
      L.play.className = "play sounds-one";
      L.play.replaceChildren(stage.el);
      return stage.el;
    },
    onAgain: () => gentleMiss(stage),
    async record(entry, result) {
      L.setHint(sayHint(entry.say)); // runJudged restores its opening hint after "Let's try again"
      const emeralds = await save(entry, result);
      if (result === "miss") return null;
      stage.setGolden(nextIsGolden(count, mob, every));
      count[mob] = (count[mob] ?? 0) + 1;
      playPop();
      await potionSplash(stage);
      return emeralds ? "emerald" : null;
    },
  });
}

/** Find it: three witches, Dad says the sound, Charles taps one. */
function runFind(app, { world, items, pool, count, every, save, mob }) {
  const L = stageLayout(app.root, { title: TITLE, help: fundHelp("sounds"), dadHint: "Say the sound, then Charles taps the witch holding it." });
  L.disableButtons();
  const say = dadSay(L);
  let stages = [];
  let targetStage = null;
  let lastTapped = null;
  let onTap = null; // resolver of the current ask(); null between asks, so taps during an animation do nothing
  const choicesOf = new Map(); // entry -> its three choices, so a re-shown card keeps the same line-up

  return runTapped(L, {
    entries: items,
    show(entry) {
      if (!choicesOf.has(entry)) choicesOf.set(entry, soundChoices(entry, pool, world, Math.random));
      stages = choicesOf.get(entry).map((choice) => {
        const stage = createMobStage({ mob: choice.mob, text: choice.card, world, size: "small" });
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
      say(`${entry.card} — ${entry.say}`);
      L.play.className = "play sounds-row";
      L.play.replaceChildren(...stages.map((s) => s.stage.el));
      return targetStage.el;
    },
    ask: () => new Promise((resolve) => { onTap = resolve; }),
    async onWrong() {
      // gentleMiss alternates step/clank by missCount; an odd count first makes this call always clank, never step closer.
      if (lastTapped.missCount % 2 === 0) lastTapped.missCount += 1;
      await gentleMiss(lastTapped);
    },
    async record(entry, result) {
      const emeralds = await save(entry, result);
      if (result === "miss") return null;
      for (const s of stages) if (s.stage !== targetStage) s.stage.el.classList.add("shuffle-off");
      targetStage.setGolden(nextIsGolden(count, mob, every));
      count[mob] = (count[mob] ?? 0) + 1;
      playPop();
      await potionSplash(targetStage);
      return emeralds ? "emerald" : null;
    },
  });
}
