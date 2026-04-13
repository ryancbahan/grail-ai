---
name: grail
description: Codebase analysis with progressive disclosure. Use when navigating, understanding, modifying, or debugging code. Provides structural understanding of files, dependencies, symbols, and function signatures without reading full files.
allowed-tools:
  - mcp: grail
  - Bash
---

# Grail — Progressive Codebase Disclosure

Grail analyzes codebases at runtime and provides structural understanding — dependency graphs, exported symbols with function signatures, and surgical source reads. Use it to navigate code without reading entire files.

Available via MCP or CLI. Both return identical JSON.

| Command | MCP tool | CLI |
|---------|----------|-----|
| Summary | `grail_summary { path, file? }` | `npx grail <path> summary [file]` |
| Dependencies | `grail_dependencies { path, file }` | `npx grail <path> dependencies <file>` |
| Dependents | `grail_dependents { path, file }` | `npx grail <path> dependents <file>` |
| Read symbol | `grail_read { path, file, symbol, parent? }` | `npx grail <path> read <file> <symbol>` |
| Externals | `grail_externals { path, file? }` | `npx grail <path> externals [file]` |
| Entry points | `grail_entry_points { path }` | `npx grail <path> entry-points` |
| Cycles | `grail_cycles { path }` | `npx grail <path> cycles` |

## Workflow

### 1. Overview (broad)
Start with `grail_summary` to get every file's exported symbols with signatures, dependency counts, and externals. Scan this to identify which files are relevant. Don't read any files yet.

### 2. Inspect (narrow)
For relevant files:
- `grail_dependencies` — see what it imports, with resolved function signatures from those files. Understand the API contracts without reading the dependency.
- `grail_dependents` — see what imports this file and which symbols they consume. Check this before making changes.

### 3. Read (surgical)
Only when signatures aren't enough, use `grail_read` to get a specific symbol's source code. Not the whole file — just the function or type.

## Rules

- **Start with summary** before reading any files
- **Prefer signatures over source** — if summary or dependencies gives you enough, don't read the source
- **Check dependents before editing** — always check what would break
- **Never read a full file** when grail can give you just the symbol you need
