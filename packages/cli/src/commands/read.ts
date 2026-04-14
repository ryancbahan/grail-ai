import path from "path";
import { analyze, registerLanguage, collectFiles, readSymbol } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output, resolveFile, findFile } from "../utils/util";

registerLanguage(javascript);

export const read: Command = {
  name: "read",
  run: async (args) => {
    if (!args[1]) fail("Missing file argument", "Usage: grail <path> read <file> <symbol> [parent]");
    if (!args[2]) fail("Missing symbol argument", "Usage: grail <path> read <file> <symbol> [parent]");
    const symbolName = args[2];
    const parentName = args[3];
    const { root, language } = await analyze(args[0]);
    if (!language) fail("No language detected", "Ensure the project has recognizable marker files or source files");
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    const filePath = resolveFile(root.absolutePath, args[1]);
    const location = readSymbol(allFiles, root.absolutePath, language, filePath, symbolName, parentName);
    if (!location) fail(`Symbol not found: ${symbolName} in ${args[1]}`, "Check the symbol name and file path");
    const fileNode = findFile(allFiles, filePath);
    const symData = fileNode?.node.symbols.find((s) => s.name === symbolName && s.parent === parentName);
    output({
      file: rel(location.file),
      name: location.name,
      kind: location.kind,
      parent: location.parent,
      signature: symData?.signature,
      visibility: symData?.visibility,
      line: location.line,
      endLine: location.endLine,
      source: location.source,
    });
  },
};
