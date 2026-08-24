import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    storyTbc: {
      setStoryTbc: () => ReturnType;
    };
  }
}

export const StoryTbc = Node.create({
  name: "storyTbc",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "aside[data-tbc]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { "data-tbc": "1" }),
      "To be continued",
    ];
  },

  addCommands() {
    return {
      setStoryTbc:
        () =>
        ({ commands }) =>
          commands.insertContent([
            { type: this.name },
            { type: "paragraph" },
          ]),
    };
  },
});
