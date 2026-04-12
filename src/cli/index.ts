#!/usr/bin/env node

import path from "path";
import { analyze, initAnalyzer } from "../core/analyze";
import {
  dependenciesOf,
  dependentsOf,
  allExternals,
  externalsOf,
  findEntryPoints,
  findCircularDependencies,
} from "../core/ast/queries";
import { collectFiles } from "../core/ast/walker";
import { formatTree, formatDependencyGraph } from "./formatter";

const HELP = `
grail - codebase analyzer

Usage:
  grail <path>                          Show file tree
  grail <path> deps                     Show all dependencies
  grail <path> deps <file>              Show dependencies of a specific file
  grail <path> dependents <file>        Show files that import a given file
  grail <path> externals [file]         Show external packages (all or per-file)
  grail <path> entry-points             Show files nothing imports
  grail <path> cycles                   Show circular dependencies
  grail <path> files                    List all files with their paths
  grail <path> json                     Output full AST as JSON
`.trim();

function resolveFile(rootPath: string, file: string): string {
  if (path.isAbsolute(file)) return file;
  return path.resolve(rootPath, file);
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

  switch (command) {
    case "tree": {
      if (language) console.log(`Detected language: ${language.name}\n`);
      console.log(formatTree(root.tree));
      break;
    }

    case "deps": {
      if (commandArg) {
        const filePath = resolveFile(root.absolutePath, commandArg);
        const deps = dependenciesOf(root, filePath);
        const exts = externalsOf(root, filePath);
        if (deps.length === 0 && exts.length === 0) {
          console.log(`${rel(filePath)}: no imports`);
        } else {
          console.log(rel(filePath));
          const all = [
            ...deps.map((d) => `  ${rel(d)}`),
            ...exts.map((e) => `  ${e} (external)`),
          ];
          all.forEach((line, i) => {
            const connector = i === all.length - 1 ? "└── " : "├── ";
            console.log(`  ${connector}${line.trim()}`);
          });
        }
      } else {
        console.log(formatDependencyGraph(root));
      }
      break;
    }

    case "dependents": {
      if (!commandArg) {
        console.error("Usage: grail <path> dependents <file>");
        process.exit(1);
      }
      const filePath = resolveFile(root.absolutePath, commandArg);
      const deps = dependentsOf(root, filePath);
      if (deps.length === 0) {
        console.log(`${rel(filePath)}: no dependents`);
      } else {
        console.log(`${rel(filePath)} is imported by:`);
        deps.forEach((d) => console.log(`  ${rel(d)}`));
      }
      break;
    }

    case "externals": {
      if (commandArg) {
        const filePath = resolveFile(root.absolutePath, commandArg);
        const exts = externalsOf(root, filePath);
        if (exts.length === 0) {
          console.log(`${rel(filePath)}: no external imports`);
        } else {
          console.log(`${rel(filePath)}:`);
          exts.forEach((e) => console.log(`  ${e}`));
        }
      } else {
        const exts = allExternals(root);
        if (exts.length === 0) {
          console.log("No external dependencies");
        } else {
          console.log(`External packages (${exts.length}):`);
          exts.forEach((e) => console.log(`  ${e}`));
        }
      }
      break;
    }

    case "entry-points": {
      const entries = findEntryPoints(root);
      if (entries.length === 0) {
        console.log("No entry points found");
      } else {
        console.log(`Entry points (${entries.length}):`);
        entries.forEach((e) => console.log(`  ${rel(e)}`));
      }
      break;
    }

    case "cycles": {
      const cycles = findCircularDependencies(root);
      if (cycles.length === 0) {
        console.log("No circular dependencies");
      } else {
        console.log(`Circular dependencies (${cycles.length}):`);
        cycles.forEach((cycle) => {
          console.log("  " + cycle.map(rel).join(" -> ") + " -> " + rel(cycle[0]));
        });
      }
      break;
    }

    case "files": {
      const files = collectFiles(root);
      files.forEach((f) => console.log(rel(f.filePath)));
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
