import fs from "fs";
import path from "path";
import { ASTNode, RootNode, TreeOptions } from "./types";

export const DEFAULT_IGNORE = [
  ".git",
  ".DS_Store",
];

export function buildTree(dirPath: string, options: TreeOptions = {}): RootNode {
  const ignored = new Set(options.ignorePaths ?? DEFAULT_IGNORE);
  const maxDepth = options.depth ?? Infinity;
  const resolved = path.resolve(dirPath);
  const tree = buildNode(resolved, ignored, 0, maxDepth);
  return { type: "root", absolutePath: resolved, tree: tree as any, externals: [] };
}

function buildNode(dirPath: string, ignored: Set<string>, currentDepth: number, maxDepth: number): ASTNode {
  const name = path.basename(dirPath);
  const stat = fs.statSync(dirPath);

  if (!stat.isDirectory()) {
    const ext = path.extname(name);
    return { name, type: "file", extension: ext || null, imports: [], symbols: [] };
  }

  if (currentDepth >= maxDepth) {
    return { name, type: "directory", children: [] };
  }

  const entries = fs.readdirSync(dirPath).sort();
  const children: ASTNode[] = [];

  for (const entry of entries) {
    if (ignored.has(entry)) continue;
    children.push(buildNode(path.join(dirPath, entry), ignored, currentDepth + 1, maxDepth));
  }

  return { name, type: "directory", children };
}
