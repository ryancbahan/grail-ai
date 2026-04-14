import { analyze, registerLanguage, collectFiles, buildCallGraph, callersOf } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

registerLanguage(javascript);

export const callers: Command = {
  name: "callers",
  run: async (flags) => {
    if (!flags.path) fail("Missing --path argument", "Usage: grail-ai callers --path <dir> --file <file> --symbol <symbol>");
    if (!flags.file) fail("Missing --file argument", "Usage: grail-ai callers --path <dir> --file <file> --symbol <symbol>");
    if (!flags.symbol) fail("Missing --symbol argument", "Usage: grail-ai callers --path <dir> --file <file> --symbol <symbol>");
    const { root, language } = await analyze(flags.path);
    if (!language) fail("No language detected", "Ensure the project has recognizable marker files or source files");
    if (!language.implementation.buildCallGraph) {
      fail("Call graph not available", `The ${language.descriptor.name} language plugin does not support call resolution`);
    }
    const allFiles = collectFiles(root);
    await buildCallGraph(allFiles, root.absolutePath, language);
    output({
      file: flags.file,
      name: flags.parent ? `${flags.parent}.${flags.symbol}` : flags.symbol,
      callers: callersOf(allFiles, root.absolutePath, flags.file, flags.symbol, { transitive: flags.transitive, maxDepth: flags.depth, parent: flags.parent }),
    });
  },
};
