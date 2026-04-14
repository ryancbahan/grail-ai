import path from "path";
import { analyze, registerLanguage, collectFiles } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { output } from "../utils/util";

registerLanguage(javascript);

export const files: Command = {
  name: "files",
  run: async (args, flags) => {
    const { root } = await analyze(args[0], { depth: flags.depth });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    output({ files: collectFiles(root).map((f) => rel(f.filePath)) });
  },
};
