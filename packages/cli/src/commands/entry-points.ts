import "../languages";
import path from "path";
import { analyze, collectFiles, findEntryPoints } from "@grail-ai/core";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

export const entryPoints: Command = {
  name: "entry-points",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai entry-points --path <dir>");
    const { root } = await analyze(flags.path, { depth: flags.depth, language: flags.language });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    output({ entryPoints: findEntryPoints(allFiles).map(rel) });
  },
};
