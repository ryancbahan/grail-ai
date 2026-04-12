#!/usr/bin/env node

import path from "path";
import { buildTree } from "../core/ast/builder";
import { detectLanguage } from "../core/languages";
import { buildDependencyGraph } from "../core/ast/dependencies";
import { formatTree, formatDependencyGraph } from "./formatter";

const args = process.argv.slice(2);
const showDeps = args.includes("--deps");
const targetPath = args.find((a) => !a.startsWith("--"));

if (!targetPath) {
  console.error("Usage: grail <path> [--deps]");
  process.exit(1);
}

const resolved = path.resolve(targetPath);
const lang = detectLanguage(resolved);

if (lang) {
  console.log(`Detected language: ${lang.name}\n`);
}

const root = buildTree(resolved, lang?.treeOptions);

if (lang?.parseImports) {
  buildDependencyGraph(root, lang);
}

console.log(formatTree(root.tree));

if (showDeps) {
  console.log("\n" + formatDependencyGraph(root));
}
