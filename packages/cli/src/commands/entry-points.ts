import path from "path";
import { analyze, registerLanguage, collectFiles, findEntryPoints } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { output } from "../utils/util";

registerLanguage(javascript);

export const entryPoints: Command = {
  name: "entry-points",
  run: async (args, flags) => {
    const { root } = await analyze(args[0], { depth: flags.depth });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    output({ entryPoints: findEntryPoints(allFiles).map(rel) });
  },
};
