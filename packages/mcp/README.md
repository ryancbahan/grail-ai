# @grail-ai/mcp

MCP (Model Context Protocol) server for grail — exposes codebase analysis tools to AI agents like Claude Code, Cursor, and other MCP-compatible clients.

## Install

Add to your MCP config:

```json
{
  "mcpServers": {
    "grail": {
      "command": "npx",
      "args": ["-y", "@grail-ai/mcp"]
    }
  }
}
```

Or with a local install:

```json
{
  "mcpServers": {
    "grail": {
      "command": "node",
      "args": ["/path/to/node_modules/@grail-ai/mcp/dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `grail_summary` | File summaries with symbols, signatures, and dependency counts |
| `grail_dependencies` | What a file imports, with resolved signatures |
| `grail_dependents` | What imports a file, with consumed symbols |
| `grail_calls` | What a function calls (with signatures) |
| `grail_callers` | What calls a function (blast radius) |
| `grail_read` | Read a symbol's source by name or line number |
| `grail_externals` | External packages used |
| `grail_entry_points` | Files nothing imports |
| `grail_cycles` | Circular dependency chains |

All tools accept a `path` parameter (project directory) and return JSON.

## Related packages

- [`@grail-ai/core`](https://www.npmjs.com/package/@grail-ai/core) — Analysis engine
- [`grail-ai`](https://www.npmjs.com/package/grail-ai) — CLI

GitHub: [ryancbahan/grail-ai](https://github.com/ryancbahan/grail-ai)
