// Tap-to-answer round for the Fundations games where Charles picks an answer himself (Find it, Sword Forge): the app knows
// which tap is right, so Dad's Got it!/Let's try again buttons are not used (L.disableButtons()). Same shape and rules as
// judged.js runJudged (docs/design.md Confidence rules): no lives, no red, no "wrong" sound; a wrong tap is a gentle miss
// and he taps again; a right tap on the retry is "assisted" (still pays and vanquishes); a second wrong tap records a
// "miss" and the item comes back once later; the round always ends on a victory card (a mastered item he cannot get wrong).
import { victoryItem } from "../rules.js";
import { popReward } from "../ui.js";

const REQUEUE_GAP = 3; // a missed item comes back this many cards later
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `entries` as tap-to-answer cards. Returns "done" or "quit" (Dad tapped Home, via L.quitted).
 *  entries: items for the round (any objects)
 *  show(entry, {victory}): render the card into L.play (e.g. the mob choices) and return the element the reward pop anchors
 *    to. INVARIANT as judged.js: that element stays in the page until the pop has played.
 *  ask(entry): called once per attempt after show(); returns a Promise<boolean> that resolves on Charles's next tap: true
 *    when it is the right answer. The screen wires its own tap handlers (fresh each call) and may ignore taps in between.
 *  onWrong(entry): async, awaited after a wrong tap (play gentleMiss(stage) here; no sound).
 *  record(entry, result, {victory}): async; saves the fund_try, plays the vanquish, returns the reward kind (or null).
 * On the victory card wrong taps only call onWrong and ask again; the result is "correct" if he got anything right on his
 * own this round, else "assisted".
 */
export async function runTapped(L, { entries, show, ask, onWrong, record }) {
  const queue = entries.slice();
  const requeued = new Set();
  const history = [];
  let done = 0;
  const showProgress = (extra) => L.setProgress(done, done + 1 + queue.length + extra);
  const tap = (p) => Promise.race([p, L.quitted.then(() => "quit")]);

  async function one(entry, { allowRequeue, victory = false, victoryResult = "correct" }) {
    const anchor = show(entry, { victory });
    showProgress(victory ? 0 : 1);
    let result;
    let right = await tap(ask(entry));
    if (right === "quit") return "quit";
    if (victory) {
      while (!right) { await onWrong(entry); right = await tap(ask(entry)); if (right === "quit") return "quit"; }
      result = victoryResult;
    } else if (right) {
      result = "correct";
    } else {
      await onWrong(entry);
      right = await tap(ask(entry));
      if (right === "quit") return "quit";
      result = right ? "assisted" : "miss";
      if (!right) await onWrong(entry);
    }
    const reward = await record(entry, result, { victory });
    history.push({ item: entry, result });
    done += 1;
    if (reward) popReward(anchor, reward);
    if (result === "miss" && allowRequeue && !requeued.has(entry)) {
      requeued.add(entry);
      queue.splice(Math.min(REQUEUE_GAP, queue.length), 0, entry);
    }
    await pause(result === "miss" ? 250 : 1100);
    return "ok";
  }

  while (queue.length) {
    if ((await one(queue.shift(), { allowRequeue: true })) === "quit") return "quit";
  }
  const again = victoryItem(history, entries[0]);
  if (again === null) L.setProgress(done, done);
  else {
    const independent = history.some((x) => x.result === "correct");
    if ((await one(again, { allowRequeue: false, victory: true, victoryResult: independent ? "correct" : "assisted" })) === "quit") return "quit";
    L.setProgress(done, done);
  }
  return "done";
}
