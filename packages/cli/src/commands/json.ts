import { analyze, registerLanguage } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

registerLanguage(javascript);

export const jsonCmd: Command = {
  name: "json",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai json --path <dir>");
    const { root } = await analyze(flags.path, { depth: flags.depth });
    output(root);
  },
};
