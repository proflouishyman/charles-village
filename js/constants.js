// UI-level constants shared by screens.
export const ORES_ROW = ["coal", "iron", "gold", "diamond"];
export const GEMS_ROW = ["copper", "amethyst", "prismarine", "quartz", "glowstone", "obsidian"]; // mirrors rules.js GEMS
export const ALL_INVENTORY = ["coal", "iron", "gold", "diamond", "wood", "stone", "emerald", ...GEMS_ROW];

// Session sequences. `case` / `lockCase` are runStage opts (lettercase.js): the starting case of the stage, and whether
// the live case switch is hidden. `label` is shown on interludes.
// The small-caps adventure is "Start today's adventure" and never includes lowercase: every step is locked to small caps.
export const SMALLCAPS_ADVENTURE = [
  { stage: "blocks", case: "smallcaps", lockCase: true, label: "Word Blocks" },
  { stage: "story", case: "smallcaps", lockCase: true, pick: true, label: "Story (small caps)" },
  { stage: "build", case: "smallcaps", lockCase: true, label: "Build" },
];
// The separate lowercase track (only when settings.lowercase_track is "on"). Easy to change later.
export const LOWERCASE_TRACK = [
  { stage: "story", case: "mixed", pick: true, label: "Swap-in story" },
  { stage: "match", label: "Bridge Match" },
  { stage: "mine", label: "Letter Mine" },
  { stage: "build", label: "Build" },
];

/** settings.lowercase_track; a progress file without it reads as "off". */
export function lowercaseOn(progress) {
  return progress.settings.lowercase_track === "on";
}

// Crafting Table (docs/design.md "Crafting Table"). Not part of the adventure sequences: Home tile only.
export const CRAFT_WORDS_PER_ROUND = 5;
export const CRAFT_DISTRACTORS = 2; // extra letter blocks in the tray
