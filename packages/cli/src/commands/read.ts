import path from "path";
import { analyze, registerLanguage, collectFiles, readSymbol } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output, resolveFile, findFile } from "../utils/util";

registerLanguage(javascript);

export const read: Command = {
  name: "read",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai read --path <dir> --file <file> --symbol <symbol>");
    if (!flags.file) fail("Missing --file argument", "Usage: grail-ai read --path <dir> --file <file> --symbol <symbol>");
    if (!flags.symbol && flags.line === undefined) fail("Missing --symbol or --line argument", "Usage: grail-ai read --path <dir> --file <file> (--symbol <symbol> | --line <n>)");
    const { root, language } = await analyze(flags.path);
    if (!language) fail("No language detected", "Ensure the project has recognizable marker files or source files");
    const rel = (p: string) => path.relative(root.absolutePath, p);
    const allFiles = collectFiles(root);
    const filePath = resolveFile(root.absolutePath, flags.file);
    const fileEntry = findFile(allFiles, filePath);

    let symbolName = flags.symbol;
    let parentName = flags.parent;

    // --line: find the enclosing symbol for a given line number
    if (flags.line !== undefined && !symbolName) {
      if (!fileEntry) fail(`File not found: ${flags.file}`, "Check the file path is relative to the project root");
      const match = fileEntry.node.symbols.find((s) =>
        s.range !== undefined && s.range.start.line <= flags.line! && flags.line! <= s.range.end.line
      );
      if (!match) fail(`No symbol found at line ${flags.line} in ${flags.file}`, "Check the line number");
      symbolName = match.name;
      parentName = match.parent;
    }

    const location = readSymbol(allFiles, root.absolutePath, language, filePath, symbolName!, parentName);
    if (!location) fail(`Symbol not found: ${symbolName} in ${flags.file}`, "Check the symbol name and file path");
    const symData = fileEntry?.node.symbols.find((s) => s.name === symbolName && s.parent === parentName);
    output({
      file: rel(location.file),
      name: location.name,
      kind: location.kind,
      parent: location.parent,
      signature: symData?.signature,
      visibility: symData?.visibility,
      range: location.range,
      source: location.source,
    });
  },
};
