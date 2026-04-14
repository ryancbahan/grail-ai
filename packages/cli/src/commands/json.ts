import { analyze, registerLanguage } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { output } from "../utils/util";

registerLanguage(javascript);

export const jsonCmd: Command = {
  name: "json",
  run: async (args, flags) => {
    const { root } = await analyze(args[0], { depth: flags.depth });
    output(root);
  },
};
