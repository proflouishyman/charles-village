// Help content for the Fundations screens (the "?" button, layout.js helpButton/openHelp). Written for Dad, who reads it and
// explains to Charles, so it is plain text (never small caps).
//
// Contract: HELP is keyed by screen {quest, battle, ambush, forge, sounds, boss}; every entry is
//   { title: string (non-empty), sections: [ { heading: string (non-empty), lines: [string (non-empty), ...] (>= 1) }, ... ] (>= 1) }
// validateHelpEntry throws on any deviation, and fundHelp(key) throws for an unknown key (no silent fallback).

export const HELP_KEYS = ["quest", "battle", "ambush", "forge", "sounds", "boss"];

const nonEmpty = (s) => typeof s === "string" && s.trim() !== "";

/** Throw (naming `key`) unless `e` has the shape above; returns `e`. */
export function validateHelpEntry(e, key = "?") {
  const bad = (why) => { throw new Error(`fundhelp.${key}: ${why}`); };
  if (e === null || typeof e !== "object") bad("entry must be an object");
  if (!nonEmpty(e.title)) bad("title must be a non-empty string");
  if (!Array.isArray(e.sections) || e.sections.length < 1) bad("sections must be a non-empty array");
  e.sections.forEach((s, i) => {
    if (s === null || typeof s !== "object") bad(`sections[${i}] must be an object`);
    if (!nonEmpty(s.heading)) bad(`sections[${i}].heading must be a non-empty string`);
    if (!Array.isArray(s.lines) || s.lines.length < 1 || !s.lines.every(nonEmpty)) bad(`sections[${i}].lines must be a non-empty array of non-empty strings`);
  });
  return e;
}

/** Validate a whole table: exactly the HELP_KEYS, each a valid entry. */
export function validateHelp(table) {
  for (const k of HELP_KEYS) if (!(k in table)) throw new Error(`fundhelp: missing entry "${k}"`);
  for (const k of Object.keys(table)) if (!HELP_KEYS.includes(k)) throw new Error(`fundhelp: unknown entry "${k}"`);
  for (const k of HELP_KEYS) validateHelpEntry(table[k], k);
  return table;
}

export const HELP = validateHelp({
  quest: {
    title: "How Mob Battle works",
    sections: [
      { heading: "What this is", lines: [
        "Practice for the Fundations units Charles is tested on at school.",
        "Each unit only uses letters, word skills and trick words taught up to that unit."] },
      { heading: "Pick where to play", lines: [
        "Tap a unit number at the top. Units open as he beats them (set the starting unit in Settings).",
        "Overworld shows the words in small caps. Nether shows the same unit in lowercase."] },
      { heading: "The games", lines: [
        "Word Duel: read the words on the mobs' signs.",
        "Trick Word Ambush: trick words (from Unit 2 on).",
        "Sword Forge: pick the letters that finish a word.",
        "Sound Potions: say the sounds on the witch's cards.",
        "Unit Boss: read sentences to break the boss's hearts."] },
      { heading: "Waking the boss", lines: [
        "Every right answer vanquishes a mob. 15 vanquishes in a unit wake its boss.",
        "Beat the Overworld boss to open the Nether. Beat the Nether boss to open the next unit."] },
      { heading: "Rewards", lines: [
        "Emeralds for every right answer, a trophy for every kind of mob (a golden one every 20), better armor as units are beaten, and a surprise in his Minecraft chest for each boss."] },
      { heading: "If he gets one wrong", lines: [
        "Nothing is lost. The mob blocks with its shield and he tries again. Getting it after help still counts."] },
    ],
  },
  battle: {
    title: "How Word Duel works",
    sections: [
      { heading: "Pick a game", lines: [
        "Read it: Charles reads the words. Find it: you say a word and he finds it."] },
      { heading: "Read it", lines: [
        "A mob walks in holding a sign with a word on it.",
        "Charles reads the word out loud.",
        "Right? Tap Got it! and the mob is vanquished.",
        "Not yet? Tap Let's try again. The mob blocks with its shield and he has another go. Help him sound it out."] },
      { heading: "Find it", lines: [
        "Three mobs hold signs. Say the word shown in your bar (or tap \u{1F50A}).",
        "Charles taps the mob holding that word. A wrong tap just makes that mob block; he taps again."] },
      { heading: "A round", lines: ["10 words, ending on a win."] },
    ],
  },
  ambush: {
    title: "How Trick Word Ambush works",
    sections: [
      { heading: "What to do", lines: [
        "Skeletons pop up from behind the blocks holding trick words: words that don't follow the rules, so he has to remember them.",
        "Charles reads the word out loud. Tap Got it! or Let's try again.",
        "There is no timer. Take as long as he needs."] },
    ],
  },
  forge: {
    title: "How Sword Forge works",
    sections: [
      { heading: "What to do", lines: [
        "Say the word shown in your bar (or tap \u{1F50A}).",
        "The word on the anvil has a gap. Charles taps the letters that fill it, for example l or ll.",
        "The game checks his answer, so you don't need to judge.",
        "A wrong pick just bounces off the anvil; he taps again. Every right answer makes his sword glow brighter."] },
    ],
  },
  sounds: {
    title: "How Sound Potions works",
    sections: [
      { heading: "Pick a game", lines: [
        "Read it: Charles says the sounds. Find it: you say a sound and he finds it."] },
      { heading: "Read it", lines: [
        "A witch holds a sound card, like sh, ar or ee. Your bar shows the sound to listen for.",
        "Charles says the sound (not the letter names). Tap Got it! or Let's try again."] },
      { heading: "Find it", lines: [
        "Say the sound shown in your bar. Charles taps the witch holding it."] },
    ],
  },
  boss: {
    title: "How the Unit Boss works",
    sections: [
      { heading: "What to do", lines: [
        "The boss has 6 hearts.",
        "Charles reads each sentence out loud (in Unit 1, he says each letter's sound).",
        "Every Got it! breaks a heart. Let's try again means the boss blocks and he tries again.",
        "Break all 6 hearts to win. Beating the boss opens the next world or unit and sends a surprise to his Minecraft chest."] },
    ],
  },
});

/** The help entry for screen `key`; throws for an unknown key so a screen can never silently get no help. */
export function fundHelp(key) {
  if (!HELP_KEYS.includes(key)) throw new Error(`fundHelp: unknown screen "${key}"`);
  return HELP[key];
}
