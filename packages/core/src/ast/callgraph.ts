import path from "path";
import { FileEntry, SymbolRef } from "./types";
import { Language } from "../languages/types";

export async function buildCallGraph(files: FileEntry[], rootPath: string, lang: Language): Promise<void> {
  if (!lang.implementation.buildCallGraph) return;
  await lang.implementation.buildCallGraph(rootPath, files);
}

function enrichCall(call: SymbolRef, files: FileEntry[], rootPath: string): SymbolRef {
  const targetFile = files.find((f) =>
    path.relative(rootPath, f.filePath) === call.file
  );
  const targetSym = targetFile?.node.symbols.find(
    (s) => s.name === call.name && s.parent === call.parent
  );
  return {
    ...call,
    kind: targetSym?.kind ?? call.kind,
    signature: targetSym?.signature ?? call.signature,
  };
}

function symKey(ref: SymbolRef): string {
  return ref.parent ? `${ref.file}:${ref.parent}.${ref.name}` : `${ref.file}:${ref.name}`;
}

function sortByDepth(calls: SymbolRef[], files: FileEntry[], rootPath: string): SymbolRef[] {
  return [...calls].sort((a, b) => {
    const aFile = files.find((f) => path.relative(rootPath, f.filePath) === a.file);
    const bFile = files.find((f) => path.relative(rootPath, f.filePath) === b.file);
    const aSym = aFile?.node.symbols.find((s) => s.name === a.name && s.parent === a.parent);
    const bSym = bFile?.node.symbols.find((s) => s.name === b.name && s.parent === b.parent);
    const aCallCount = aSym?.calls?.length ?? 0;
    const bCallCount = bSym?.calls?.length ?? 0;
    return aCallCount - bCallCount;
  });
}

export function callsOf(
  files: FileEntry[],
  rootPath: string,
  filePath: string,
  symbolName: string,
  options: { transitive?: boolean; maxDepth?: number } = {}
): SymbolRef[] {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(rootPath, filePath);
  const file = files.find((f) => f.filePath === absPath);
  if (!file) return [];

  const symbol = file.node.symbols.find((s) => s.name === symbolName);
  if (!symbol || !symbol.calls) return [];

  if (!options.transitive) {
    const enriched = symbol.calls.map((c) => enrichCall(c, files, rootPath));
    return sortByDepth(enriched, files, rootPath);
  }

  const maxDepth = options.maxDepth ?? Infinity;
  const visited = new Set<string>();
  const result: SymbolRef[] = [];
  const startKey = symKey({ file: path.relative(rootPath, absPath), name: symbolName });
  visited.add(startKey);

  let frontier = symbol.calls.map((c) => ({ ref: c, depth: 1 }));

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { ref, depth } of frontier) {
      const key = symKey(ref);
      if (visited.has(key)) continue;
      visited.add(key);

      const enriched = enrichCall(ref, files, rootPath);
      result.push(enriched);

      if (depth < maxDepth) {
        const targetFile = files.find((f) =>
          path.relative(rootPath, f.filePath) === ref.file
        );
        const targetSym = targetFile?.node.symbols.find(
          (s) => s.name === ref.name && s.parent === ref.parent
        );
        if (targetSym?.calls) {
          for (const subcall of targetSym.calls) {
            next.push({ ref: subcall, depth: depth + 1 });
          }
        }
      }
    }
    frontier = next;
  }

  return sortByDepth(result, files, rootPath);
}

export function callersOf(
  files: FileEntry[],
  rootPath: string,
  filePath: string,
  symbolName: string,
  options: { transitive?: boolean; maxDepth?: number } = {}
): SymbolRef[] {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(rootPath, filePath);
  const rel = path.relative(rootPath, absPath);

  function directCallers(targetFile: string, targetName: string): SymbolRef[] {
    const callers: SymbolRef[] = [];
    for (const { filePath: fPath, node } of files) {
      const fRel = path.relative(rootPath, fPath);
      for (const sym of node.symbols) {
        if (!sym.calls) continue;
        for (const call of sym.calls) {
          if (call.file === targetFile && call.name === targetName) {
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

  if (!options.transitive) {
    return directCallers(rel, symbolName);
  }

  const maxDepth = options.maxDepth ?? Infinity;
  const visited = new Set<string>();
  const result: SymbolRef[] = [];
  visited.add(`${rel}:${symbolName}`);

  let frontier = directCallers(rel, symbolName).map((c) => ({ ref: c, depth: 1 }));

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { ref, depth } of frontier) {
      const key = symKey(ref);
      if (visited.has(key)) continue;
      visited.add(key);
      result.push(ref);

      if (depth < maxDepth) {
        const upstreamCallers = directCallers(ref.file, ref.name);
        for (const caller of upstreamCallers) {
          next.push({ ref: caller, depth: depth + 1 });
        }
      }
    }
    frontier = next;
  }

  return result;
}
