#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

function grail(args: string): string {
  try {
    return execSync(`npx grail-ai ${args}`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

function text(result: string) {
  return { content: [{ type: "text" as const, text: result }] };
}

function flag(name: string, value: string | number | undefined): string {
  return value !== undefined ? ` --${name} ${value}` : "";
}

function boolFlag(name: string, value: boolean | undefined): string {
  return value ? ` --${name}` : "";
}

const server = new McpServer({ name: "grail", version });

server.registerTool("grail_summary", {
  description: "List all files with their exported symbols (with signatures), dependency counts, and external packages. Optionally pass a file for detailed single-file view. Use depth to limit traversal on large codebases.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().optional().describe("Optional: relative path to a specific file"),
    depth: z.number().optional().describe("Optional: limit directory traversal depth"),
  },
}, async ({ path: p, file, depth }) => text(grail(
  `summary --path ${p}${flag("file", file)}${flag("depth", depth)}`
)));

server.registerTool("grail_dependencies", {
  description: "Show what a file imports, with resolved function signatures from the target files.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().describe("Relative path to the file"),
  },
}, async ({ path: p, file }) => text(grail(`dependencies --path ${p} --file ${file}`)));

server.registerTool("grail_dependents", {
  description: "Show what files import a given file and which symbols each consumer uses.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().describe("Relative path to the file"),
  },
}, async ({ path: p, file }) => text(grail(`dependents --path ${p} --file ${file}`)));

server.registerTool("grail_read", {
  description: "Read the source code of a specific symbol (function, class, type, variable) from a file. Returns just that symbol's implementation with line numbers. Use --line to find the enclosing symbol at a given line number.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().describe("Relative path to the file"),
    symbol: z.string().optional().describe("Name of the symbol to read"),
    parent: z.string().optional().describe("Parent class/object name for methods"),
    line: z.number().optional().describe("Line number to find enclosing symbol for"),
  },
}, async ({ path: p, file, symbol, parent, line }) => text(grail(
  `read --path ${p} --file ${file}${flag("symbol", symbol)}${flag("parent", parent)}${flag("line", line)}`
)));

server.registerTool("grail_externals", {
  description: "Show external packages used across the project, or for a specific file. Use depth to limit traversal.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().optional().describe("Optional: relative path to a specific file"),
    depth: z.number().optional().describe("Optional: limit directory traversal depth"),
  },
}, async ({ path: p, file, depth }) => text(grail(
  `externals --path ${p}${flag("file", file)}${flag("depth", depth)}`
)));

server.registerTool("grail_entry_points", {
  description: "Show files that nothing imports — likely entry points or unused files. Use depth to limit traversal.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    depth: z.number().optional().describe("Optional: limit directory traversal depth"),
  },
}, async ({ path: p, depth }) => text(grail(`entry-points --path ${p}${flag("depth", depth)}`)));

server.registerTool("grail_cycles", {
  description: "Show circular dependency chains in the project. Use depth to limit traversal.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    depth: z.number().optional().describe("Optional: limit directory traversal depth"),
  },
}, async ({ path: p, depth }) => text(grail(`cycles --path ${p}${flag("depth", depth)}`)));

server.registerTool("grail_calls", {
  description: "Show what a function calls, with resolved signatures. Use --transitive for the full call chain. Use --depth to limit chain depth.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().describe("Relative path to the file"),
    symbol: z.string().describe("Name of the function/method"),
    parent: z.string().optional().describe("Parent container name for object literal methods"),
    transitive: z.boolean().optional().describe("Follow calls transitively (full chain)"),
    depth: z.number().optional().describe("Limit transitive chain depth"),
  },
}, async ({ path: p, file, symbol, parent, transitive, depth }) => text(grail(
  `calls --path ${p} --file ${file} --symbol ${symbol}${flag("parent", parent)}${boolFlag("transitive", transitive)}${flag("depth", depth)}`
)));

server.registerTool("grail_callers", {
  description: "Show what calls a given function. Use --transitive for the full impact chain (blast radius). Use --depth to limit chain depth.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().describe("Relative path to the file"),
    symbol: z.string().describe("Name of the function/method"),
    parent: z.string().optional().describe("Parent container name for object literal methods"),
    transitive: z.boolean().optional().describe("Follow callers transitively (full impact chain)"),
    depth: z.number().optional().describe("Limit transitive chain depth"),
  },
}, async ({ path: p, file, symbol, parent, transitive, depth }) => text(grail(
  `callers --path ${p} --file ${file} --symbol ${symbol}${flag("parent", parent)}${boolFlag("transitive", transitive)}${flag("depth", depth)}`
)));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Grail MCP server running");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
