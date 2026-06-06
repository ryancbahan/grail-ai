import fs from "fs";
import path from "path";
import { ASTNode, DirectoryNode, RootNode, TreeOptions } from "./types";

export const DEFAULT_IGNORE = [
  ".git",
  ".DS_Store",
];

export function buildTree(dirPath: string, options: TreeOptions = {}): RootNode {
  const ignored = new Set(options.ignorePaths ?? DEFAULT_IGNORE);
  const maxDepth = options.depth ?? Infinity;
  const sourceExtensions = new Set(options.sourceExtensions ?? []);
  const sourceFileNames = new Set(options.sourceFileNames ?? []);
  const resolved = path.resolve(dirPath);
  const tree = buildNode(resolved, {
    ignored,
    maxDepth,
    sourceExtensions,
    sourceFileNames,
  }, 0);
  if (!tree || tree.type !== "directory") {
    throw new Error(`Expected directory at ${resolved}, got file`);
  }
  return { type: "root", absolutePath: resolved, tree, externals: [] };
}

interface BuildState {
  ignored: Set<string>;
  maxDepth: number;
  sourceExtensions: Set<string>;
  sourceFileNames: Set<string>;
}

function buildNode(dirPath: string, state: BuildState, currentDepth: number): ASTNode | null {
  const name = path.basename(dirPath);
  const stat = fs.statSync(dirPath);

  if (!stat.isDirectory()) {
    const ext = path.extname(name);
    if (!shouldIncludeFile(name, ext, state)) return null;
    return { name, type: "file", extension: ext || null, imports: [], symbols: [] };
  }

  if (currentDepth >= state.maxDepth && !hasSourceFilter(state)) {
    return { name, type: "directory", children: [] };
  }

  const entries = fs.readdirSync(dirPath).sort();
  const children: ASTNode[] = [];

  for (const entry of entries) {
    if (state.ignored.has(entry)) continue;
    const child = buildNode(path.join(dirPath, entry), state, currentDepth + 1);
    if (child) children.push(child);
  }

  return { name, type: "directory", children };
}

function shouldIncludeFile(name: string, ext: string, state: BuildState): boolean {
  if (!hasSourceFilter(state)) return true;
  return state.sourceExtensions.has(ext) || state.sourceFileNames.has(name);
}

function hasSourceFilter(state: BuildState): boolean {
  return state.sourceExtensions.size > 0 || state.sourceFileNames.size > 0;
}
