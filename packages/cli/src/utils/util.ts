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

export function parseArgs(argv: string[]): { commandName: string; args: string[]; flags: Flags } {
  let depth: number | undefined;
  let transitive = false;
  let install = false;
  const filtered: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--depth" && argv[i + 1]) {
      depth = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === "--transitive") {
      transitive = true;
    } else if (argv[i] === "--install") {
      install = true;
    } else {
      filtered.push(argv[i]);
    }
  }

  let commandName: string;
  let args: string[];

  if (filtered[0] === "skill") {
    commandName = "skill";
    args = filtered.slice(1);
  } else {
    commandName = filtered[1] || "tree";
    args = [filtered[0], ...filtered.slice(2)];
  }

  return { commandName, args, flags: { depth, transitive, install } };
}
