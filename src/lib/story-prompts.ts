/** Tagged Claude rewrite prompts available to slave while drafting stories. */

export type StoryRewritePromptId =
  | "clarity"
  | "grammar"
  | "vivid"
  | "shorten"
  | "expand"
  | "dialogue"
  | "emotion"
  | "pacing"
  | "polish"
  | "sensual";

export type StoryRewritePrompt = {
  id: StoryRewritePromptId;
  label: string;
  description: string;
  instruction: string;
};

export const STORY_REWRITE_PROMPTS: StoryRewritePrompt[] = [
  {
    id: "clarity",
    label: "Clarity",
    description: "Cleaner flow and clearer meaning",
    instruction:
      "Improve clarity and logical flow. Keep the author's voice. Resolve ambiguous sentences without inventing new plot.",
  },
  {
    id: "grammar",
    label: "Grammar",
    description: "Fix grammar, spelling, and punctuation",
    instruction:
      "Correct grammar, spelling, punctuation, and awkward phrasing. Do not change meaning, tone, or plot.",
  },
  {
    id: "vivid",
    label: "More vivid",
    description: "Sharper sensory detail",
    instruction:
      "Make descriptions more vivid with concrete sensory detail. Do not pad with purple prose or change the plot.",
  },
  {
    id: "shorten",
    label: "Tighten",
    description: "Cut fluff and tighten prose",
    instruction:
      "Tighten the prose. Cut repetition and filler while preserving essential plot, emotion, and voice.",
  },
  {
    id: "expand",
    label: "Expand",
    description: "Add richer detail where thin",
    instruction:
      "Expand thin passages with richer detail and atmosphere. Stay faithful to the existing plot and characters.",
  },
  {
    id: "dialogue",
    label: "Dialogue",
    description: "Sharper, more natural spoken lines",
    instruction:
      "Improve dialogue so it sounds more natural and distinct per speaker. Keep literary reading prose (quotes and attribution are fine). Keep intent and subtext intact.",
  },
  {
    id: "emotion",
    label: "Emotion",
    description: "Heighten emotional impact",
    instruction:
      "Heighten emotional impact through subtext, interiority, and precise word choice. Avoid melodrama.",
  },
  {
    id: "pacing",
    label: "Pacing",
    description: "Improve structure and pacing",
    instruction:
      "Improve pacing and paragraph structure. Smooth transitions without rearranging the overall story arc.",
  },
  {
    id: "polish",
    label: "Polish",
    description: "Overall publication-ready polish",
    instruction:
      "Apply an overall polish for readability and elegance while preserving the author's voice and story content.",
  },
  {
    id: "sensual",
    label: "Atmosphere",
    description: "Sharpen intimate atmosphere",
    instruction:
      "Sharpen intimate or sensual atmosphere where it already exists. Stay tasteful, keep consent and power dynamics clear, and do not invent new acts or characters.",
  },
];

export const STORY_REWRITE_PROMPT_MAP = Object.fromEntries(
  STORY_REWRITE_PROMPTS.map((p) => [p.id, p])
) as Record<StoryRewritePromptId, StoryRewritePrompt>;

export function isStoryRewritePromptId(
  value: string
): value is StoryRewritePromptId {
  return value in STORY_REWRITE_PROMPT_MAP;
}
