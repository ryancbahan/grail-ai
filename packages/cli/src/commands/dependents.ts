import "../languages";
import path from "path";
import { analyze, collectFiles, dependentsOf } from "@grail-ai/core";
import type { Command } from "../types";
import { fail, output, resolveFile, findFile } from "../utils/util";

export const dependents: Command = {
  name: "dependents",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai dependents --path <dir> --file <file>");
    if (!flags.file) fail("Missing --file argument", "Usage: grail-ai dependents --path <dir> --file <file>");
    const { root } = await analyze(flags.path, { language: flags.language });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    const filePath = resolveFile(root.absolutePath, flags.file);
    const depPaths = dependentsOf(allFiles, filePath);

    const result = depPaths.map((depPath) => {
      const depFile = findFile(allFiles, depPath);
      const consumedImport = depFile?.node.imports.find((i) => i.resolvedPath === filePath);
      const targetFile = findFile(allFiles, filePath);
      const symbols = (consumedImport?.symbols ?? []).map((s) => {
        const targetSym = targetFile?.node.symbols.find((sym) => sym.name === s.originalName);
        return { file: rel(filePath), name: s.originalName, kind: targetSym?.kind, signature: targetSym?.signature };
      });
      return { file: rel(depPath), symbols };
    });

    output({ file: rel(filePath), dependents: result });
  },
};
