# @grail-ai/core

Core analysis engine for grail — builds file trees, dependency graphs, call graphs, and symbol tables from source code. Language-agnostic; language support is provided by plugins like `@grail-ai/lang-javascript`.

## Install

```bash
npm install @grail-ai/core
```

## Usage

```ts
import { registerLanguage, loadLanguage, analyze, collectFiles } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";

registerLanguage(javascript);

const { root, language } = await analyze("./my-project");
const files = collectFiles(root);

// root.tree — file/directory AST with symbols and imports
// files — flat list of { filePath, node } entries
```

## API

### Analysis

- `analyze(dirPath, options?)` — Parse a project directory, detect language, build dependency graph
- `collectFiles(root)` — Flatten the tree into a list of file entries

### Queries

- `dependenciesOf(files, filePath)` — What does this file import?
- `dependentsOf(files, filePath)` — What imports this file?
- `allExternals(root)` — All external packages used
- `findEntryPoints(files)` — Files nothing imports
- `findCircularDependencies(files)` — Circular dependency chains

### Call graph

- `buildCallGraph(files, rootPath, language)` — Populate `symbol.calls` on all files
- `callsOf(files, rootPath, filePath, symbol, options?)` — What does this function call?
- `callersOf(files, rootPath, filePath, symbol, options?)` — What calls this function?

### Reader

- `readSymbol(files, rootPath, language, filePath, symbol, parent?)` — Read a symbol's source code

## Adding a language

Implement the `LanguageImplementation` interface and register a `LanguageDescriptor`:

```ts
import { registerLanguage } from "@grail-ai/core";

registerLanguage({
  name: "python",
  extensions: [".py"],
  markers: ["requirements.txt", "setup.py", "pyproject.toml"],
  grammars: [{ extensions: [".py"], package: "tree-sitter-python", wasmFile: "tree-sitter-python.wasm" }],
  implementation: { parseImports, parseSymbols, resolveImport, locateSymbol },
});
```

See [`LanguageImplementation`](https://github.com/ryancbahan/grail-ai/blob/main/packages/core/src/languages/types.ts) for the full contract.

## Related packages

- [`grail-ai`](https://www.npmjs.com/package/grail-ai) — CLI
- [`@grail-ai/lang-javascript`](https://www.npmjs.com/package/@grail-ai/lang-javascript) — JS/TS language support
- [`@grail-ai/mcp`](https://www.npmjs.com/package/@grail-ai/mcp) — MCP server

GitHub: [ryancbahan/grail-ai](https://github.com/ryancbahan/grail-ai)
