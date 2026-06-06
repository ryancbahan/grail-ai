import "../languages";
import path from "path";
import { analyze, collectFiles, allExternals } from "@grail-ai/core";
import type { Command } from "../types";
import { fail, output, resolveFile, findFile } from "../utils/util";

export const externals: Command = {
  name: "externals",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai externals --path <dir> [--file <file>]");
    const { root } = await analyze(flags.path, { depth: flags.depth, language: flags.language });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);

    if (flags.file) {
      const filePath = resolveFile(root.absolutePath, flags.file);
      const file = findFile(allFiles, filePath);
      if (!file) fail(`File not found: ${flags.file}`, "Check the file path is relative to the project root");
      const exts = [...new Set(file.node.imports.filter((i) => i.isExternal).map((i) => i.specifier))];
      output({ file: rel(filePath), externals: exts });
    } else {
      output({ externals: allExternals(root) });
    }
  },
};
