import path from "path";
import { RootNode, SymbolRef } from "./types";
import { collectFiles } from "./walker";
import { Language } from "../languages/types";

export async function buildCallGraph(root: RootNode, lang: Language): Promise<void> {
  if (!lang.implementation.buildCallGraph) return;
  const files = collectFiles(root);
  await lang.implementation.buildCallGraph(root.absolutePath, files);
}

export function callsOf(root: RootNode, filePath: string, symbolName: string): SymbolRef[] {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(root.absolutePath, filePath);
  const files = collectFiles(root);
  const file = files.find((f) => f.filePath === absPath);
  if (!file) return [];

  const symbol = file.node.symbols.find((s) => s.name === symbolName);
  if (!symbol || !symbol.calls) return [];

  return symbol.calls;
}

export function callersOf(root: RootNode, filePath: string, symbolName: string): Array<SymbolRef & { line?: number }> {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(root.absolutePath, filePath);
  const rel = path.relative(root.absolutePath, absPath);
  const files = collectFiles(root);
  const callers: Array<SymbolRef & { line?: number }> = [];

  for (const { filePath: fPath, node } of files) {
    const fRel = path.relative(root.absolutePath, fPath);
    for (const sym of node.symbols) {
      if (!sym.calls) continue;
      for (const call of sym.calls) {
        if (call.file === rel && call.name === symbolName) {
          callers.push({ file: fRel, name: sym.name, parent: sym.parent });
        }
      }
    }
  }

  return callers;
}
