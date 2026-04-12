import fs from "fs";
import path from "path";

export const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  ".DS_Store",
];

export interface TreeOptions {
  ignorePaths?: string[];
}

export type NodeType = "file" | "directory";

export interface ASTNode {
  name: string;
  type: NodeType;
  extension: string | null;
  children?: ASTNode[];
}

export function buildTree(dirPath: string, options: TreeOptions = {}): ASTNode {
  const ignored = new Set(options.ignorePaths ?? DEFAULT_IGNORE);
  return buildNode(dirPath, ignored);
}

function buildNode(dirPath: string, ignored: Set<string>): ASTNode {
  const name = path.basename(dirPath);
  const stat = fs.statSync(dirPath);

  if (!stat.isDirectory()) {
    const ext = path.extname(name);
    return { name, type: "file", extension: ext || null };
  }

  const entries = fs.readdirSync(dirPath).sort();
  const children: ASTNode[] = [];

  for (const entry of entries) {
    if (ignored.has(entry)) continue;
    children.push(buildNode(path.join(dirPath, entry), ignored));
  }

  return { name, type: "directory", extension: null, children };
}

