import "../languages";
import { analyze } from "@grail-ai/core";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

export const jsonCmd: Command = {
  name: "json",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai json --path <dir>");
    const { root } = await analyze(flags.path, { depth: flags.depth, language: flags.language });
    output(root);
  },
};
