import path from "path";
import { analyze, registerLanguage, collectFiles } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output, resolveFile, findFile } from "../utils/util";

registerLanguage(javascript);

export const summary: Command = {
  name: "summary",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai summary --path <dir> [--file <file>]");
    const { root } = await analyze(flags.path, { depth: flags.depth });
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);

    if (flags.file) {
      const filePath = resolveFile(root.absolutePath, flags.file);
      const file = findFile(allFiles, filePath);
      if (!file) fail(`File not found: ${flags.file}`, "Check the file path is relative to the project root");
      output({
        file: rel(filePath),
        symbols: file.node.symbols,
        imports: file.node.imports.map((imp) => ({
          specifier: imp.specifier,
          kind: imp.kind,
          resolvedPath: imp.resolvedPath ? rel(imp.resolvedPath) : null,
          isExternal: imp.isExternal,
          symbols: imp.symbols,
        })),
      });
    } else {
      output(allFiles.map(({ filePath, node }) => ({
        file: rel(filePath),
        symbols: node.symbols
          .filter((s) => !s.parent)
          .map((s) => ({ file: rel(filePath), name: s.name, kind: s.kind, signature: s.signature, visibility: s.visibility })),
        dependencies: node.imports.filter((i) => !i.isExternal).length,
        externals: [...new Set(node.imports.filter((i) => i.isExternal).map((i) => i.specifier))],
      })));
    }
  },
};
