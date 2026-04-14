# grail-ai

CLI for runtime codebase analysis — dependency graphs, symbol extraction, call graphs, and function signatures. Built for LLM progressive disclosure.

## Install

```bash
npx grail-ai summary --path .          # no install needed
npm install -g grail-ai                # or install globally
```

## Commands

```bash
grail-ai tree --path <dir>                                  # file tree
grail-ai summary --path <dir> [--file <file>]               # symbols + deps per file
grail-ai dependencies --path <dir> --file <file>             # imports with resolved signatures
grail-ai dependents --path <dir> --file <file>               # consumers with consumed symbols
grail-ai calls --path <dir> --file <file> --symbol <sym>     # what does this function call
grail-ai callers --path <dir> --file <file> --symbol <sym>   # what calls this function
grail-ai read --path <dir> --file <file> --symbol <sym>      # one symbol's source code
grail-ai read --path <dir> --file <file> --line <n>          # find enclosing symbol at line
grail-ai externals --path <dir> [--file <file>]              # external packages
grail-ai entry-points --path <dir>                           # files nothing imports
grail-ai cycles --path <dir>                                 # circular dependencies
grail-ai files --path <dir>                                  # all file paths
grail-ai json --path <dir>                                   # full AST as JSON
```

## Flags

| Flag | Description |
|------|-------------|
| `--path <dir>` | Project directory (required) |
| `--file <file>` | Target file (relative to project root) |
| `--symbol <name>` | Target symbol name |
| `--parent <name>` | Parent container (class/object) for methods |
| `--line <n>` | Line number (for `read`: find enclosing symbol) |
| `--depth <n>` | Limit traversal depth |
| `--transitive` | Follow calls/callers transitively |

All commands output JSON.

## Related packages

- [`@grail-ai/core`](https://www.npmjs.com/package/@grail-ai/core) — Analysis engine
- [`@grail-ai/lang-javascript`](https://www.npmjs.com/package/@grail-ai/lang-javascript) — JS/TS language support
- [`@grail-ai/mcp`](https://www.npmjs.com/package/@grail-ai/mcp) — MCP server for AI agents

GitHub: [ryancbahan/grail-ai](https://github.com/ryancbahan/grail-ai)
