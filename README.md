# grail

Runtime codebase AST with dependency graphs, symbol extraction, and function signatures. Built for LLM progressive disclosure — start broad, narrow to relevant, read only what you need.

```
summary        → what does every file expose?
dependencies   → what does this file depend on? (with resolved signatures)
dependents     → what breaks if I change this? (with consumed symbols)
read           → show me just this one function's implementation
```

## Setup

```bash
npm install
```

## Commands

```bash
npm run grail -- <path> tree                    # file tree
npm run grail -- <path> summary [file]          # symbols + deps per file
npm run grail -- <path> dependencies <file>     # imports with resolved signatures
npm run grail -- <path> dependents <file>       # consumers with consumed symbols
npm run grail -- <path> read <file> <symbol>    # one symbol's source code
npm run grail -- <path> externals [file]        # external packages
npm run grail -- <path> entry-points            # files nothing imports
npm run grail -- <path> cycles                  # circular dependencies
npm run grail -- <path> files                   # all file paths
npm run grail -- <path> json                    # full AST as JSON
npm run ui -- --path <directory>                # web visualization
```

All data commands output JSON.

## Monorepo

```
packages/
├── core/              @grail-ai/core              — AST engine, types, queries, grammar loader
├── lang-javascript/   @grail-ai/lang-javascript   — JS/TS via tree-sitter
├── cli/               grail                       — CLI interface
└── web/               @grail-ai/web               — Preact + D3 visualization
```

## Adding a Language

Create a package that exports a `LanguageConfig`:

```ts
import { registerLanguage } from "@grail-ai/core";
import { python } from "@grail-ai/lang-python";

registerLanguage(python);
```

Each language implements:

```ts
interface LanguageConfig {
  name: string;
  extensions: string[];
  markers: string[];
  grammars: GrammarMapping[];         // tree-sitter WASM grammars
  parseImports: (filePath, content, tree) => ParsedImport[];
  parseSymbols: (filePath, content, tree) => Symbol[];
  resolveImport: (specifier, context) => string | null;
  locateSymbol: (filePath, content, tree, symbolName, parentName?) => SymbolLocation | null;
}
```

Core handles tree-sitter WASM loading, file traversal, and the query layer. Language packages provide parsing and resolution.

## Tests

```bash
npm test              # all packages
npm test -w packages/core
```
