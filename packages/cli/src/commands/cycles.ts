import "../languages";
import path from "path";
import { analyze, collectFiles, findCircularDependencies } from "@grail-ai/core";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

export const cycles: Command = {
  name: "cycles",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai cycles --path <dir>");
    const { root } = await analyze(flags.path, { depth: flags.depth, language: flags.language });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    output({ cycles: findCircularDependencies(allFiles).map((c) => c.map(rel)) });
  },
};
