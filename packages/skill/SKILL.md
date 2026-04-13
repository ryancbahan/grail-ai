---
name: grail
description: Codebase analysis with progressive disclosure. Use when navigating, understanding, modifying, or debugging code. Provides structural understanding of files, dependencies, symbols, and function signatures without reading full files.
allowed-tools:
  - mcp: grail
  - Bash
---

# Grail — Progressive Codebase Disclosure

Grail analyzes codebases at runtime and provides structural understanding — file trees, dependency graphs, exported symbols with function signatures, and surgical source reads. Use it to navigate code without reading entire files.

Available via MCP tools (`grail_overview`, `grail_inspect`, `grail_read`) or CLI (`npx grail <path> <command>`). Both return identical JSON.

## Workflow

### 1. Overview (broad)
Get the full codebase map. Every file's exported symbols with signatures, dependency counts, externals, entry points.

- MCP: `grail_overview { path: "." }`
- CLI: `npx grail . summary`

Scan this to identify which files matter for the task. Don't read any files yet.

### 2. Inspect (narrow)
Drill into specific files:

**Dependencies** — what a file imports, with resolved function signatures from the target files:
- MCP: `grail_inspect { path: ".", file: "src/analyze.ts", query: "dependencies" }`
- CLI: `npx grail . dependencies src/analyze.ts`

**Dependents** — what imports a file, with which symbols each consumer uses:
- MCP: `grail_inspect { path: ".", file: "src/types.ts", query: "dependents" }`
- CLI: `npx grail . dependents src/types.ts`

**Symbols** — a file's full symbol list with signatures:
- MCP: `grail_inspect { path: ".", file: "src/types.ts", query: "symbols" }`
- CLI: `npx grail . summary src/types.ts`

### 3. Read (surgical)
Read one symbol's source code — not the whole file:

- MCP: `grail_read { path: ".", file: "src/builder.ts", symbol: "buildTree" }`
- CLI: `npx grail . read src/builder.ts buildTree`

## Rules

- **Start with overview** before reading any files
- **Prefer signatures over source** — if the overview or inspect gives you enough, don't read source
- **Check dependents before editing** — always inspect dependents of any file you're about to modify
- **Never read a full file** when you can get what you need from grail's symbol-level read
