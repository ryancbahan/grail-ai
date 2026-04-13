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

function depthFlag(depth?: number): string {
  return depth !== undefined ? ` --depth ${depth}` : "";
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
  file ? `${p} summary ${file}${depthFlag(depth)}` : `${p} summary${depthFlag(depth)}`
)));

server.registerTool("grail_dependencies", {
  description: "Show what a file imports, with resolved function signatures from the target files.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().describe("Relative path to the file"),
  },
}, async ({ path: p, file }) => text(grail(`${p} dependencies ${file}`)));

server.registerTool("grail_dependents", {
  description: "Show what files import a given file and which symbols each consumer uses.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().describe("Relative path to the file"),
  },
}, async ({ path: p, file }) => text(grail(`${p} dependents ${file}`)));

server.registerTool("grail_read", {
  description: "Read the source code of a specific symbol (function, class, type, variable) from a file. Returns just that symbol's implementation with line numbers.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().describe("Relative path to the file"),
    symbol: z.string().describe("Name of the symbol to read"),
    parent: z.string().optional().describe("Parent class/module name for methods"),
  },
}, async ({ path: p, file, symbol, parent }) => text(grail(
  parent ? `${p} read ${file} ${symbol} ${parent}` : `${p} read ${file} ${symbol}`
)));

server.registerTool("grail_externals", {
  description: "Show external packages used across the project, or for a specific file. Use depth to limit traversal.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    file: z.string().optional().describe("Optional: relative path to a specific file"),
    depth: z.number().optional().describe("Optional: limit directory traversal depth"),
  },
}, async ({ path: p, file, depth }) => text(grail(
  file ? `${p} externals ${file}${depthFlag(depth)}` : `${p} externals${depthFlag(depth)}`
)));

server.registerTool("grail_entry_points", {
  description: "Show files that nothing imports — likely entry points or unused files. Use depth to limit traversal.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    depth: z.number().optional().describe("Optional: limit directory traversal depth"),
  },
}, async ({ path: p, depth }) => text(grail(`${p} entry-points${depthFlag(depth)}`)));

server.registerTool("grail_cycles", {
  description: "Show circular dependency chains in the project. Use depth to limit traversal.",
  inputSchema: {
    path: z.string().describe("Path to the project directory"),
    depth: z.number().optional().describe("Optional: limit directory traversal depth"),
  },
}, async ({ path: p, depth }) => text(grail(`${p} cycles${depthFlag(depth)}`)));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Grail MCP server running");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
