import { RootNode } from "./types";
import { collectFiles } from "./walker";

export function dependenciesOf(root: RootNode, filePath: string): string[] {
  const file = collectFiles(root).find((f) => f.filePath === filePath);
  if (!file) return [];
  return file.node.imports
    .filter((i) => i.resolvedPath !== null)
    .map((i) => i.resolvedPath!);
}

export function dependentsOf(root: RootNode, filePath: string): string[] {
  const result: string[] = [];
  for (const file of collectFiles(root)) {
    if (file.node.imports.some((i) => i.resolvedPath === filePath)) {
      result.push(file.filePath);
    }
  }
  return result;
}

export function allExternals(root: RootNode): string[] {
  return [...root.externals];
}

export function externalsOf(root: RootNode, filePath: string): string[] {
  const file = collectFiles(root).find((f) => f.filePath === filePath);
  if (!file) return [];
  return file.node.imports
    .filter((i) => i.isExternal)
    .map((i) => i.specifier);
}

export function findEntryPoints(root: RootNode): string[] {
  const files = collectFiles(root);
  const imported = new Set<string>();
  for (const file of files) {
    for (const imp of file.node.imports) {
      if (imp.resolvedPath) imported.add(imp.resolvedPath);
    }
  }
  return files
    .map((f) => f.filePath)
    .filter((f) => !imported.has(f));
}

export function findCircularDependencies(root: RootNode): string[][] {
  const files = collectFiles(root);
  const fileMap = new Map(files.map((f) => [f.filePath, f]));

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const file = fileMap.get(v);
    if (file) {
      for (const imp of file.node.imports) {
        const w = imp.resolvedPath;
        if (!w || !fileMap.has(w)) continue;

        if (!indices.has(w)) {
          strongconnect(w);
          lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
        } else if (onStack.has(w)) {
          lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
        }
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      if (scc.length > 1) {
        sccs.push(scc.reverse());
      }
    }
  }

  for (const f of files) {
    if (!indices.has(f.filePath)) {
      strongconnect(f.filePath);
    }
  }

  return sccs;
}
