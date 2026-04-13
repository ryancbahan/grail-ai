import fs from "fs";
import path from "path";
import { SymbolLocation, RootNode } from "./types";
import { collectFiles } from "./walker";
import { parseFile } from "../languages/grammar-loader";
import { LanguageConfig } from "../languages/types";

export function readSymbol(
  root: RootNode,
  lang: LanguageConfig,
  targetFile: string,
  symbolName: string,
  parentName?: string
): SymbolLocation | null {
  const filePath = path.isAbsolute(targetFile)
    ? targetFile
    : path.resolve(root.absolutePath, targetFile);

  const file = collectFiles(root).find((f) => f.filePath === filePath);
  if (!file) return null;

  if (!file.node.extension || !new Set(lang.extensions).has(file.node.extension)) {
    return null;
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const tree = parseFile(filePath, content);
  const result = lang.locateSymbol(filePath, content, tree, symbolName, parentName);

  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }

  return result;
}
