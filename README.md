# grail-ai

Runtime codebase AST with dependency graphs, symbol extraction, and function signatures. Built for LLM progressive disclosure — start broad, narrow to relevant, read only what you need.

```
summary        → what does every file expose?
dependencies   → what does this file depend on? (with resolved signatures)
dependents     → what breaks if I change this? (with consumed symbols)
calls          → what does this function call? (with resolved signatures)
callers        → what calls this function? (function-level blast radius)
read           → show me just this one function's implementation
```

## Install

```bash
npx grail-ai <path> summary          # no install needed
```

Or clone and develop:

```bash
git clone https://github.com/ryancbahan/grail-ai.git
cd grail-ai
npm install
npm run grail-ai -- <path> summary
```

## Commands

```bash
npx grail-ai <path> tree                       # file tree
npx grail-ai <path> summary [file]             # symbols + deps per file
npx grail-ai <path> dependencies <file>        # imports with resolved signatures
npx grail-ai <path> dependents <file>          # consumers with consumed symbols
npx grail-ai <path> calls <file> <symbol>       # what does this function call
npx grail-ai <path> callers <file> <symbol>    # what calls this function
npx grail-ai <path> read <file> <symbol>       # one symbol's source code
npx grail-ai <path> externals [file]           # external packages
npx grail-ai <path> entry-points               # files nothing imports
npx grail-ai <path> cycles                     # circular dependencies
npx grail-ai <path> files                      # all file paths
npx grail-ai <path> json                       # full AST as JSON
```

All data commands output JSON. Use `--depth <n>` on any command to limit directory traversal.

## MCP Server

Grail ships an MCP server for AI agent integration. Each CLI command has a matching MCP tool.

Add to your MCP config:

```json
{
  "mcpServers": {
    "grail": {
      "command": "node",
      "args": ["/path/to/grail-ai/packages/mcp/dist/index.js"]
    }
  }
}
```

Tools: `grail_summary`, `grail_dependencies`, `grail_dependents`, `grail_calls`, `grail_callers`, `grail_read`, `grail_externals`, `grail_entry_points`, `grail_cycles`.

## Claude Code Skill

Copy `packages/skill/SKILL.md` to `~/.claude/skills/grail/SKILL.md` to give Claude the progressive disclosure workflow. Works with MCP tools or CLI fallback.

## Monorepo

```
packages/
├── core/              @grail-ai/core              — AST engine, types, queries, grammar loader
├── lang-javascript/   @grail-ai/lang-javascript   — JS/TS via tree-sitter
├── cli/               grail-ai                    — CLI
├── mcp/               @grail-ai/mcp               — MCP server
├── web/               @grail-ai/web               — Preact + D3 visualization
└── skill/                                         — Claude Code skill
```

## Adding a Language

Create a package that exports a `LanguageConfig` and registers it:

```ts
import { registerLanguage } from "@grail-ai/core";
import { python } from "@grail-ai/lang-python";

registerLanguage(python);
```

See [LanguageConfig interface](packages/core/src/languages/types.ts) for the full contract.

## Tests

```bash
npm test                        # all packages
npm test -w packages/core       # single package
```

## Releasing

See [docs/releasing.md](docs/releasing.md).
