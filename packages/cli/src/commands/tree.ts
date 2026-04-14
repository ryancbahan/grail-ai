import { analyze, registerLanguage, collectFiles } from "@grail-ai/core";
import type { ASTNode } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import type { Command } from "../types";
import { output } from "../utils/util";

registerLanguage(javascript);

function toTreeJson(node: ASTNode): object {
  if (node.type === "file") {
    return { name: node.name, type: "file", extension: node.extension };
  }
  return {
    name: node.name,
    type: "directory",
    children: node.children.map(toTreeJson),
  };
}

export const tree: Command = {
  name: "tree",
  run: async (args, flags) => {
    const { root, language } = await analyze(args[0], { depth: flags.depth });
    output({
      root: root.absolutePath,
      language: language?.descriptor.name ?? null,
      tree: toTreeJson(root.tree),
    });
  },
};
