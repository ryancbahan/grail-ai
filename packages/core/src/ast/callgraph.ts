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

  // Enrich each callee with kind/signature from target file's symbols
  return symbol.calls.map((call) => {
    const targetFile = files.find((f) =>
      path.relative(root.absolutePath, f.filePath) === call.file
    );
    const targetSym = targetFile?.node.symbols.find(
      (s) => s.name === call.name && s.parent === call.parent
    );
    return {
      ...call,
      kind: targetSym?.kind ?? call.kind,
      signature: targetSym?.signature ?? call.signature,
    };
  });
}

export function callersOf(root: RootNode, filePath: string, symbolName: string): SymbolRef[] {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(root.absolutePath, filePath);
  const rel = path.relative(root.absolutePath, absPath);
  const files = collectFiles(root);
  const callers: SymbolRef[] = [];

  for (const { filePath: fPath, node } of files) {
    const fRel = path.relative(root.absolutePath, fPath);
    for (const sym of node.symbols) {
      if (!sym.calls) continue;
      for (const call of sym.calls) {
        if (call.file === rel && call.name === symbolName) {
          callers.push({
            file: fRel,
            name: sym.name,
            kind: sym.kind,
            parent: sym.parent,
            signature: sym.signature,
            visibility: sym.visibility,
            line: call.line,
            context: call.context,
          });
        }
      }
    }
  }

  return callers;
}
