import path from "path";
import type { FileEntry, Symbol as GrailSymbol } from "@grail-ai/core";
import type { Flags } from "../types";

export function fail(error: string, suggestion?: string): never {
  console.log(JSON.stringify({ error, ...(suggestion ? { suggestion } : {}) }));
  process.exit(1);
}

export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function resolveFile(rootPath: string, file: string): string {
  if (path.isAbsolute(file)) return file;
  return path.resolve(rootPath, file);
}

export function findFile(files: FileEntry[], filePath: string): FileEntry | undefined {
  return files.find((f) => f.filePath === filePath);
}

export function lookupSymbol(files: FileEntry[], resolvedPath: string, symbolName: string): GrailSymbol | undefined {
  const file = files.find((f) => f.filePath === resolvedPath);
  if (!file) return undefined;
  return file.node.symbols.find((s) => s.name === symbolName);
}

export function parseArgs(argv: string[]): { commandName: string; flags: Flags } {
  let p: string | undefined;
  let file: string | undefined;
  let symbol: string | undefined;
  let parent: string | undefined;
  let line: number | undefined;
  let depth: number | undefined;
  let transitive = false;
  let install = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path" && argv[i + 1]) { p = argv[++i]; }
    else if (argv[i] === "--file" && argv[i + 1]) { file = argv[++i]; }
    else if (argv[i] === "--symbol" && argv[i + 1]) { symbol = argv[++i]; }
    else if (argv[i] === "--parent" && argv[i + 1]) { parent = argv[++i]; }
    else if (argv[i] === "--line" && argv[i + 1]) { line = parseInt(argv[++i], 10); }
    else if (argv[i] === "--depth" && argv[i + 1]) { depth = parseInt(argv[++i], 10); }
    else if (argv[i] === "--transitive") { transitive = true; }
    else if (argv[i] === "--install") { install = true; }
    else { positional.push(argv[i]); }
  }

  const commandName = positional[0] || "help";

  return { commandName, flags: { path: p, file, symbol, parent, line, depth, transitive, install } };
}
