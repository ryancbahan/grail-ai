import "../languages";
import path from "path";
import { analyze, collectFiles } from "@grail-ai/core";
import type { Command } from "../types";
import { fail, output, resolveFile, findFile, lookupSymbol } from "../utils/util";

export const dependencies: Command = {
  name: "dependencies",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai dependencies --path <dir> --file <file>");
    if (!flags.file) fail("Missing --file argument", "Usage: grail-ai dependencies --path <dir> --file <file>");
    const { root } = await analyze(flags.path, { language: flags.language });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    const filePath = resolveFile(root.absolutePath, flags.file);
    const file = findFile(allFiles, filePath);
    if (!file) fail(`File not found: ${flags.file}`, "Check the file path is relative to the project root");

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
