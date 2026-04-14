import path from "path";
import { analyze, registerLanguage, collectFiles } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

registerLanguage(javascript);

export const files: Command = {
  name: "files",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai files --path <dir>");
    const { root } = await analyze(flags.path, { depth: flags.depth });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    output({ files: collectFiles(root).map((f) => rel(f.filePath)) });
  },
};
