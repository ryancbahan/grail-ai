#!/usr/bin/env node

import path from "path";
import { buildTree } from "../tree";
import { detectLanguage } from "../languages";
import { formatTree } from "./formatter";

const targetPath = process.argv[2];

if (!targetPath) {
  console.error("Usage: grail <path>");
  process.exit(1);
}

const resolved = path.resolve(targetPath);
const lang = detectLanguage(resolved);

if (lang) {
  console.log(`Detected language: ${lang.name}\n`);
}

const tree = buildTree(resolved, lang?.treeOptions);
console.log(formatTree(tree));
