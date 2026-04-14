import { analyze, registerLanguage, collectFiles, buildCallGraph, callersOf } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

registerLanguage(javascript);

export const callers: Command = {
  name: "callers",
  run: async (args, flags) => {
    if (!args[1] || !args[2]) fail("Missing file or symbol argument", "Usage: grail <path> callers <file> <symbol>");
    const { root, language } = await analyze(args[0]);
    if (!language) fail("No language detected", "Ensure the project has recognizable marker files or source files");
    if (!language.implementation.buildCallGraph) {
      fail("Call graph not available", `The ${language.descriptor.name} language plugin does not support call resolution`);
    }
    const allFiles = collectFiles(root);
    await buildCallGraph(allFiles, root.absolutePath, language);
    output({
      file: args[1],
      name: args[2],
      callers: callersOf(allFiles, root.absolutePath, args[1], args[2], { transitive: flags.transitive, maxDepth: flags.depth }),
    });
  },
};
