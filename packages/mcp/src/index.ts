#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";

function grail(args: string): string {
  try {
    return execSync(`npx grail ${args}`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

const server = new McpServer({
  name: "grail",
  version: "1.0.0",
});

server.registerTool(
  "grail_overview",
  {
    description:
      "Scan a codebase and return its structure: every file with its exported symbols (with signatures), dependency counts, external packages, entry points, and circular dependencies. Use this first to understand what's in a project before drilling into specific files.",
    inputSchema: {
      path: z.string().describe("Path to the project directory"),
    },
  },
  async ({ path: dirPath }) => ({
    content: [{ type: "text" as const, text: grail(`${dirPath} summary`) }],
  })
);

server.registerTool(
  "grail_inspect",
  {
    description:
      "Inspect a specific file in the codebase. Three query modes: 'dependencies' shows what the file imports with resolved function signatures from the target files. 'dependents' shows what files import this one and which symbols they consume. 'symbols' shows the file's full symbol list with signatures. Use this after grail_overview to understand a specific file's relationships.",
    inputSchema: {
      path: z.string().describe("Path to the project directory"),
      file: z.string().describe("Relative path to the file within the project"),
      query: z.enum(["dependencies", "dependents", "symbols"]).describe("What to inspect"),
    },
  },
  async ({ path: dirPath, file, query }) => {
    const cmd = query === "symbols"
      ? `${dirPath} summary ${file}`
      : `${dirPath} ${query} ${file}`;
    return { content: [{ type: "text" as const, text: grail(cmd) }] };
  }
);

server.registerTool(
  "grail_read",
  {
    description:
      "Read the source code of a specific symbol (function, class, type, variable) from a file. Returns the implementation with line numbers. Use this as the last step — only after you've used grail_inspect to understand what the symbol does and who depends on it.",
    inputSchema: {
      path: z.string().describe("Path to the project directory"),
      file: z.string().describe("Relative path to the file within the project"),
      symbol: z.string().describe("Name of the symbol to read"),
      parent: z.string().optional().describe("Parent class/module name for methods"),
    },
  },
  async ({ path: dirPath, file, symbol, parent }) => {
    const args = parent
      ? `${dirPath} read ${file} ${symbol} ${parent}`
      : `${dirPath} read ${file} ${symbol}`;
    return { content: [{ type: "text" as const, text: grail(args) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Grail MCP server running");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
