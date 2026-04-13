import fs from "fs";
import path from "path";
import { FileEntry, SymbolLocation } from "./types";
import { parseFile } from "../languages/grammar-loader";
import { Language } from "../languages/types";

export function readSymbol(
  files: FileEntry[],
  rootPath: string,
  lang: Language,
  targetFile: string,
  symbolName: string,
  parentName?: string
): SymbolLocation | null {
  const filePath = path.isAbsolute(targetFile)
    ? targetFile
    : path.resolve(rootPath, targetFile);

  const file = files.find((f) => f.filePath === filePath);
  if (!file) return null;

  if (!file.node.extension || !new Set(lang.descriptor.extensions).has(file.node.extension)) {
    return null;
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const tree = parseFile(filePath, content);
  const result = lang.implementation.locateSymbol(filePath, content, tree, symbolName, parentName);

  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }

  return result;
}
