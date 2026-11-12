// Story: one sentence per page with a scene; resumes where left. Case comes from the letter-case layer (lettercase.js):
// a starting case (Dad's setting or a stage override) plus a live switch in Dad's bar that re-renders the page. Each page
// and each finished story is recorded in the case showing when Next was tapped (see run()).
import { createCaseState, render, readingClass, trackOf } from "../lettercase.js";
import { loadIndex, loadStory } from "../stories.js";
import { drawScene, SCENE_W, SCENE_H } from "../scenes.js";
import { commitUntilSaved, earnRates } from "../store.js";
import { spriteElement, itemSprite } from "../sprites.js";
import { stageLayout, interlude } from "../layout.js";
import { playFanfare, playSparkle } from "../sounds.js";
import { h, popReward, setKid } from "../ui.js";

/** Stories whose small-caps pass is done (the only ones offered in lowercase or swap-in); may be empty. */
function progressEligible(ids, progress) {
  return ids.filter((i) => progress.stories[i]?.smallcaps_done);
}

/** Lowercase pass: the first eligible story whose lowercase is not done (else re-read the first eligible one). */
function lowercasePass(eligible, progress) {
  return eligible.find((i) => !progress.stories[i].lowercase_done) ?? eligible[0];
}

/**
 * The lowercase track with no finished small-caps story is a legitimate state, not an error: Charles sees a
 * calm small-caps message and goes Home; Dad's bar says why. Resolves "quit" (the stage was not run).
 */
async function nothingToReadYet(app) {
  await interlude(app.root, {
    title: "Read a story in small caps first!", buttonText: "OK", sprite: "pig",
    dadNote: "The lowercase track only offers stories Charles has already finished in small caps. Finish one in Story (small caps), then come back.",
  });
  return "quit";
}

/** Let Dad/Charles pick any story to read or re-read; resolves to a story id, or "quit". */
async function pickStory(app, ids, swap) {
  const stories = await Promise.all(ids.map(loadStory));
  const L = stageLayout(app.root, { title: "Pick a story", dadHint: "Re-reading a story in small caps is good practice." });
  L.disableButtons();
  return new Promise((resolve) => {
    L.quitted.then(() => resolve("quit"));
    const firstNew = stories.find((s) => !app.store.progress.stories[s.id]?.smallcaps_done)?.id;
    L.play.replaceChildren(h("div", { class: "story-pick" }, stories.map((s) => {
      const done = app.store.progress.stories[s.id]?.smallcaps_done;
      return h("button", { class: "btn big", onclick: () => resolve(s.id),
        kid: `${s.title}${swap ? "" : done ? " (read again)" : s.id === firstNew ? " (next)" : ""}` });
    })));
  });
}

/**
 * opts = {case, lockCase, pick} (main.js runStage). `case` overrides the starting case ("smallcaps" | "lowercase" |
 * "mixed" = letter swap-in); without it Dad's settings.letter_case.story applies. `lockCase` hides the switch (adventure).
 * `pick` offers every story (standalone Home tile and the small-caps adventure; mixed ignores it). Without `pick`: smallcaps reads the next unread story; lowercase and
 * mixed offer only stories whose small-caps pass is done (calm message if none).
 *
 * Recording: at Next, the page is logged once (story_page smallcaps|lowercase, or swap_page while "mixed") and that case
 * joins the stage-local `used` set. At the end one done event per case in `used` is logged (story_done, or swap_done for
 * mixed) and each pays: first emerald + sets `<track>_done` if that flag was false, else the replay rate (mixed is always
 * replay). Reading in both cases therefore pays twice. A story whose STARTING case is already done is a replay start:
 * re-read from page 0 and resume_page is left alone.
 */
export async function run(app, opts) {
  const cs = createCaseState(app, "story", { override: opts?.case, locked: opts?.lockCase ?? false });
  const start = cs.current();
  const ids = await loadIndex();
  const progress = app.store.progress;
  const eligible = progressEligible(ids, progress);
  if ((!opts?.pick || start === "mixed") && start !== "smallcaps" && eligible.length === 0) return nothingToReadYet(app);
  let id;
  if (start === "mixed") id = await pickStory(app, eligible, true); // swap-in is always gated on a finished small-caps pass
  else if (opts?.pick) id = await pickStory(app, ids);
  else if (start === "lowercase") id = lowercasePass(eligible, progress);
  else id = ids.find((i) => !progress.stories[i]?.smallcaps_done) ?? ids[0];
  if (id === "quit") return "quit";
  const replay = start === "mixed" || Boolean(progress.stories[id]?.[`${trackOf(start)}_done`]);
  const story = await loadStory(id);

  // Create the progress entry the first time this story is opened (explicit, matches the contract).
  if (!app.store.progress.stories[story.id]) {
    await commitUntilSaved(null, (p) => {
      p.stories[story.id] = { smallcaps_done: false, lowercase_done: false, resume_page: 0 };
    });
  }

  const L = stageLayout(app.root, {
    title: story.title,
    dadHint: "Tap a word Charles finds tricky: a tiny pickaxe marks it for you.",
    caseState: cs,
  });
  L.disableButtons();
  let page = replay ? 0 : Math.min(app.store.progress.stories[story.id].resume_page, story.pages.length - 1);
  const used = new Set(); // cases a page was completed in; one done event (and payout) each

  return new Promise((resolve) => {
    // Once Dad taps Home the stage is over: a save still in flight must not pop up the story-done screen.
    let active = true;
    L.quitted.then(() => { active = false; resolve("quit"); });
    const canvas = h("canvas", { class: "scene", width: SCENE_W, height: SCENE_H });
    const textEl = h("div", { class: "story-text" });
    const counter = h("div", { class: "page-count dad-only", text: "" });
    const back = h("button", { class: "btn nav", kid: "◀ Back", onclick: () => go(page - 1) });
    const next = h("button", { class: "btn nav primary", onclick: () => advance() });
    L.play.replaceChildren(canvas, textEl, h("div", { class: "nav-row" }, back, counter, next));

    textEl.addEventListener("click", (ev) => {
      const w = ev.target.closest(".w");
      if (!w || w.classList.contains("tricky")) return;
      w.classList.add("tricky");
      w.prepend(h("span", { class: "pick" }, spriteElement("pickaxe", 2)));
      commitUntilSaved({ type: "tricky_word", item: w.dataset.word, story_id: story.id, track: cs.track(), ...(cs.current() === "mixed" ? { percent: cs.percent } : {}) }, null);
    });

    // A flip re-renders the page (tricky marks on it are cleared; the logged tricky_word events stay).
    function draw() {
      const p = story.pages[page];
      drawScene(canvas.getContext("2d"), p.art); // throws loudly on a bad key
      textEl.className = `story-text ${readingClass(cs)}`;
      textEl.innerHTML = render(p.text, cs, { as: "words" });
      counter.textContent = `page ${page + 1} / ${story.pages.length}`;
      back.style.visibility = page === 0 ? "hidden" : "visible";
      setKid(next, page === story.pages.length - 1 ? "The end ▶" : "Next ▶");
    }
    cs.onChange(draw);

    function go(i) {
      page = i;
      draw();
    }

    async function advance() {
      next.disabled = true;
      const last = page === story.pages.length - 1;
      const shown = cs.current(); // the case showing at this tap is the case this page is recorded in
      const pageEvent = shown === "mixed"
        ? { type: "swap_page", track: "lowercase", story_id: story.id, page, percent: cs.percent }
        : { type: "story_page", track: trackOf(shown), story_id: story.id, page };
      await commitUntilSaved(pageEvent, (p) => {
        if (!last && !replay) p.stories[story.id].resume_page = page + 1;
      });
      if (!active) return;
      used.add(shown);
      if (!last) {
        go(page + 1);
        next.disabled = false;
        return;
      }
      const rates = earnRates();
      let total = 0;
      let anyFirst = false;
      for (const c of used) {
        const mixed = c === "mixed";
        const track = trackOf(c);
        let first = false; // set inside the mutator from the state it is applied to (a 409 re-run recomputes it)
        await commitUntilSaved(mixed ? { type: "swap_done", track, story_id: story.id, percent: cs.percent } : { type: "story_done", track, story_id: story.id }, (p) => {
          const s = p.stories[story.id];
          first = !mixed && !s[`${track}_done`];
          p.inventory.emerald += first ? rates.story_first_emerald : rates.story_replay_emerald; // config earn.*
          if (!first) return; // replay: reward only, progress untouched
          s[`${track}_done`] = true;
          s.resume_page = 0;
        });
        if (!active) return;
        total += first ? rates.story_first_emerald : rates.story_replay_emerald;
        anyFirst = anyFirst || first;
      }
      playFanfare();
      if (anyFirst) playSparkle(1.0); // the emerald, sparkling over the end of the fanfare
      const done = interlude(app.root, {
        title: anyFirst ? "You finished the story!" : "Great reading!",
        body: `${total} emeralds for your village!`,
        buttonText: "Continue",
        sprite: itemSprite("emerald"),
      });
      popReward(app.root.querySelector(".interlude"), itemSprite("emerald"));
      await done;
      resolve("done");
    }

    draw();
  });
}
