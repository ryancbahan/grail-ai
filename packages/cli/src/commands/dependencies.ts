import path from "path";
import { analyze, registerLanguage, collectFiles } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output, resolveFile, findFile, lookupSymbol } from "../utils/util";

registerLanguage(javascript);

export const dependencies: Command = {
  name: "dependencies",
  run: async (args) => {
    if (!args[1]) fail("Missing file argument", "Usage: grail <path> dependencies <file>");
    const { root } = await analyze(args[0]);
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    const filePath = resolveFile(root.absolutePath, args[1]);
    const file = findFile(allFiles, filePath);
    if (!file) fail(`File not found: ${args[1]}`, "Check the file path is relative to the project root");

    const result = file.node.imports.map((imp) => {
      const resolvedSymbols = imp.symbols.map((s) => {
        const resolved = imp.resolvedPath
          ? lookupSymbol(allFiles, imp.resolvedPath, s.originalName)
          : undefined;
        return {
          file: imp.resolvedPath ? rel(imp.resolvedPath) : null,
          name: s.name,
          originalName: s.originalName,
          kind: resolved?.kind ?? undefined,
          signature: resolved?.signature ?? undefined,
        };
      });
      return {
        specifier: imp.specifier,
        kind: imp.kind,
        resolvedPath: imp.resolvedPath ? rel(imp.resolvedPath) : null,
        isExternal: imp.isExternal,
        symbols: resolvedSymbols,
      };
    });

    output({ file: rel(filePath), dependencies: result });
  },
};
