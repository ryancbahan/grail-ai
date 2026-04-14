import path from "path";
import { analyze, registerLanguage, collectFiles, dependentsOf } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output, resolveFile, findFile } from "../utils/util";

registerLanguage(javascript);

export const dependents: Command = {
  name: "dependents",
  run: async (args) => {
    if (!args[1]) fail("Missing file argument", "Usage: grail <path> dependents <file>");
    const { root } = await analyze(args[0]);
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    const filePath = resolveFile(root.absolutePath, args[1]);
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
