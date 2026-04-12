import path from "path";
import { ASTNode, FileEntry, RootNode } from "./types";

export function collectFiles(root: RootNode): FileEntry[] {
  const files: FileEntry[] = [];
  walk(root.tree, root.absolutePath, files);
  return files;
}

function walk(node: ASTNode, currentPath: string, out: FileEntry[]): void {
  if (node.type === "file") {
    out.push({ filePath: currentPath, node });
    return;
  }
  for (const child of node.children) {
    walk(child, path.join(currentPath, child.name), out);
  }
}
