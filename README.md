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
npx grail-ai summary --path .          # no install needed
```

Or clone and develop:

```bash
git clone https://github.com/ryancbahan/grail-ai.git
cd grail-ai
npm install
npm run build
npx grail-ai summary --path .
```

## Commands

All commands use named flags. `--path` is required for all analysis commands.

```bash
npx grail-ai tree --path <dir>                                  # file tree
npx grail-ai summary --path <dir> [--file <file>]               # symbols + deps per file
npx grail-ai dependencies --path <dir> --file <file>             # imports with resolved signatures
npx grail-ai dependents --path <dir> --file <file>               # consumers with consumed symbols
npx grail-ai calls --path <dir> --file <file> --symbol <sym>     # what does this function call
npx grail-ai callers --path <dir> --file <file> --symbol <sym>   # what calls this function
npx grail-ai read --path <dir> --file <file> --symbol <sym>      # one symbol's source code
npx grail-ai read --path <dir> --file <file> --line <n>          # find enclosing symbol at line
npx grail-ai externals --path <dir> [--file <file>]              # external packages
npx grail-ai entry-points --path <dir>                           # files nothing imports
npx grail-ai cycles --path <dir>                                 # circular dependencies
npx grail-ai files --path <dir>                                  # all file paths
npx grail-ai json --path <dir>                                   # full AST as JSON
```

### Flags

| Flag | Description |
|------|-------------|
| `--path <dir>` | Project directory (required) |
| `--file <file>` | Target file (relative to project root) |
| `--symbol <name>` | Target symbol name |
| `--parent <name>` | Parent container (class/object) for methods |
| `--line <n>` | Line number (for `read`: find enclosing symbol) |
| `--depth <n>` | Limit traversal depth |
| `--transitive` | Follow calls/callers transitively |

### Object literal methods

The call graph resolves functions inside object literals (command patterns, config objects, route handlers):

```ts
export const cmd: Command = {
  run: async () => { /* calls are tracked here */ },
};
```

These are represented as child symbols with a `parent` field. Query them with `--parent`:

```bash
npx grail-ai calls --path . --file src/cmd.ts --symbol run --parent cmd
```

### Read by line number

When you have a line number (e.g., from grep), use `--line` instead of `--symbol` to find and read the enclosing symbol:

```bash
npx grail-ai read --path . --file src/cmd.ts --line 18
```

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

Install the skill for Claude Code:

```bash
npx grail-ai skill --install
```

Or copy `packages/skill/SKILL.md` to `~/.claude/skills/grail/SKILL.md`.

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

Create a package that exports a `LanguageDescriptor` and registers it:

```ts
import { registerLanguage } from "@grail-ai/core";
import { python } from "@grail-ai/lang-python";

registerLanguage(python);
```

See [LanguageDescriptor interface](packages/core/src/languages/types.ts) for the full contract.

## Tests

```bash
npm test                        # all packages
npm test -w packages/core       # single package
```

## Releasing

See [docs/releasing.md](docs/releasing.md).
