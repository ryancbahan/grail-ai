import path from "path";
import { analyze, registerLanguage, collectFiles, findEntryPoints } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

registerLanguage(javascript);

export const entryPoints: Command = {
  name: "entry-points",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai entry-points --path <dir>");
    const { root } = await analyze(flags.path, { depth: flags.depth });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    output({ entryPoints: findEntryPoints(allFiles).map(rel) });
  },
};
