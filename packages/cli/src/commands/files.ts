import "../languages";
import path from "path";
import { analyze, collectFiles } from "@grail-ai/core";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

export const files: Command = {
  name: "files",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai files --path <dir>");
    const { root } = await analyze(flags.path, { depth: flags.depth, language: flags.language });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    output({ files: collectFiles(root).map((f) => rel(f.filePath)) });
  },
};
