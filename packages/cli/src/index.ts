#!/usr/bin/env node

import path from "path";
import {
  analyze,
  initAnalyzer,
  registerLanguage,
  dependenciesOf,
  dependentsOf,
  allExternals,
  findEntryPoints,
  findCircularDependencies,
  collectFiles,
  readSymbol,
} from "@grail-ai/core";
import type { FileNode, Symbol as GrailSymbol } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";
import { formatTree } from "./formatter";

registerLanguage(javascript);

const HELP = `
grail - codebase analyzer

Usage:
  grail <path>                          Show file tree
  grail <path> summary [file]           File summaries with symbols + deps
  grail <path> dependencies <file>      What a file imports (with signatures)
  grail <path> dependents <file>        What imports a file (with consumed symbols)
  grail <path> externals [file]         External packages
  grail <path> entry-points             Files nothing imports
  grail <path> cycles                   Circular dependencies
  grail <path> files                    List all file paths
  grail <path> read <file> <symbol>      Read a symbol's source code
  grail <path> json                     Full AST as JSON
`.trim();

function resolveFile(rootPath: string, file: string): string {
  if (path.isAbsolute(file)) return file;
  return path.resolve(rootPath, file);
}

function findFileNode(
  allFiles: ReturnType<typeof collectFiles>,
  filePath: string
): { filePath: string; node: FileNode } | undefined {
  return allFiles.find((f) => f.filePath === filePath);
}

function lookupSymbol(
  allFiles: ReturnType<typeof collectFiles>,
  resolvedPath: string,
  symbolName: string
): GrailSymbol | undefined {
  const file = allFiles.find((f) => f.filePath === resolvedPath);
  if (!file) return undefined;
  return file.node.symbols.find((s) => s.name === symbolName);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const targetPath = args[0];
  const command = args[1] || "tree";
  const commandArg = args[2];

  await initAnalyzer();

  const { root, language } = analyze(targetPath);
  const rel = (p: string) => path.relative(root.absolutePath, p);
  const allFiles = collectFiles(root);

  switch (command) {
    case "tree": {
      if (language) console.log(`Detected language: ${language.name}\n`);
      console.log(formatTree(root.tree));
      break;
    }

    case "summary": {
      if (commandArg) {
        const filePath = resolveFile(root.absolutePath, commandArg);
        const file = findFileNode(allFiles, filePath);
        if (!file) {
          console.error(`File not found: ${commandArg}`);
          process.exit(1);
        }
        console.log(JSON.stringify({
          file: rel(filePath),
          symbols: file.node.symbols.filter((s) => s.visibility === "public"),
          imports: file.node.imports.map((imp) => ({
            specifier: imp.specifier,
            kind: imp.kind,
            resolvedPath: imp.resolvedPath ? rel(imp.resolvedPath) : null,
            isExternal: imp.isExternal,
            symbols: imp.symbols,
          })),
        }, null, 2));
      } else {
        const result = allFiles.map(({ filePath, node }) => ({
          file: rel(filePath),
          symbols: node.symbols
            .filter((s) => s.visibility === "public" && !s.parent)
            .map((s) => ({ name: s.name, kind: s.kind, signature: s.signature })),
          dependencies: node.imports.filter((i) => !i.isExternal).length,
          externals: [...new Set(node.imports.filter((i) => i.isExternal).map((i) => i.specifier))],
        }));
        console.log(JSON.stringify(result, null, 2));
      }
      break;
    }

    case "dependencies": {
      if (!commandArg) {
        console.error("Usage: grail <path> dependencies <file>");
        process.exit(1);
      }
      const filePath = resolveFile(root.absolutePath, commandArg);
      const file = findFileNode(allFiles, filePath);
      if (!file) {
        console.error(`File not found: ${commandArg}`);
        process.exit(1);
      }

      const result = file.node.imports.map((imp) => {
        const resolvedSymbols = imp.symbols.map((s) => {
          const resolved = imp.resolvedPath
            ? lookupSymbol(allFiles, imp.resolvedPath, s.originalName)
            : undefined;
          return {
            name: s.name,
            originalName: s.originalName,
            signature: resolved?.signature ?? null,
          };
        });

        return {
          specifier: imp.specifier,
          kind: imp.kind,
          resolvedPath: imp.resolvedPath ? rel(imp.resolvedPath) : null,
          isExternal: imp.isExternal,
          symbols: resolvedSymbols,
        };
      });

      console.log(JSON.stringify({
        file: rel(filePath),
        dependencies: result,
      }, null, 2));
      break;
    }

    case "dependents": {
      if (!commandArg) {
        console.error("Usage: grail <path> dependents <file>");
        process.exit(1);
      }
      const filePath = resolveFile(root.absolutePath, commandArg);
      const depPaths = dependentsOf(root, filePath);

      const result = depPaths.map((depPath) => {
        const depFile = findFileNode(allFiles, depPath);
        const consumedImport = depFile?.node.imports.find((i) => i.resolvedPath === filePath);
        return {
          file: rel(depPath),
          consumedSymbols: consumedImport?.symbols.map((s) => s.originalName) ?? [],
        };
      });

      console.log(JSON.stringify({
        file: rel(filePath),
        dependents: result,
      }, null, 2));
      break;
    }

    case "externals": {
      if (commandArg) {
        const filePath = resolveFile(root.absolutePath, commandArg);
        const file = findFileNode(allFiles, filePath);
        if (!file) {
          console.error(`File not found: ${commandArg}`);
          process.exit(1);
        }
        const exts = [...new Set(file.node.imports.filter((i) => i.isExternal).map((i) => i.specifier))];
        console.log(JSON.stringify({ file: rel(filePath), externals: exts }, null, 2));
      } else {
        console.log(JSON.stringify({ externals: allExternals(root) }, null, 2));
      }
      break;
    }

    case "entry-points": {
      const entries = findEntryPoints(root).map(rel);
      console.log(JSON.stringify({ entryPoints: entries }, null, 2));
      break;
    }

    case "cycles": {
      const cycles = findCircularDependencies(root).map((c) => c.map(rel));
      console.log(JSON.stringify({ cycles }, null, 2));
      break;
    }

    case "files": {
      const files = allFiles.map((f) => rel(f.filePath));
      console.log(JSON.stringify({ files }, null, 2));
      break;
    }

    case "read": {
      if (!commandArg) {
        console.error("Usage: grail <path> read <file> <symbol> [parent]");
        process.exit(1);
      }
      const symbolName = args[3];
      const parentName = args[4];
      if (!symbolName) {
        console.error("Usage: grail <path> read <file> <symbol> [parent]");
        process.exit(1);
      }
      if (!language) {
        console.error("No language detected");
        process.exit(1);
      }
      const filePath = resolveFile(root.absolutePath, commandArg);
      const location = readSymbol(root, language, filePath, symbolName, parentName);
      if (!location) {
        console.error(`Symbol not found: ${symbolName} in ${commandArg}`);
        process.exit(1);
      }
      console.log(JSON.stringify({
        file: rel(location.file),
        symbol: location.symbol,
        kind: location.kind,
        lines: `${location.startLine}-${location.endLine}`,
        source: location.source,
      }, null, 2));
      break;
    }

    case "json": {
      console.log(JSON.stringify(root, null, 2));
      break;
    }

    default: {
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
