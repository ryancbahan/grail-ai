import path from "path";
import { analyze, registerLanguage, collectFiles, findCircularDependencies } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { output } from "../utils/util";

registerLanguage(javascript);

export const cycles: Command = {
  name: "cycles",
  run: async (args, flags) => {
    const { root } = await analyze(args[0], { depth: flags.depth });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    output({ cycles: findCircularDependencies(allFiles).map((c) => c.map(rel)) });
  },
};
