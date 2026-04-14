# @grail-ai/lang-javascript

JavaScript and TypeScript language support for grail. Provides import parsing, symbol extraction, module resolution, and call graph analysis using tree-sitter and ts-morph.

## Install

```bash
npm install @grail-ai/lang-javascript
```

## Usage

```ts
import { registerLanguage } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";

registerLanguage(javascript);
```

That's it. Once registered, `@grail-ai/core` will automatically use this plugin for JS/TS files.

## What it provides

- **Import parsing** — ES modules (`import`/`export`), CommonJS (`require`), dynamic imports, re-exports
- **Symbol extraction** — Functions, classes, methods, variables, types, interfaces, enums, object literal methods
- **Module resolution** — Relative paths, index files, tsconfig paths, node builtins
- **Call graph** — Function-to-function call resolution via the TypeScript compiler (ts-morph), including object literal methods

## Supported file types

`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`

## Related packages

- [`@grail-ai/core`](https://www.npmjs.com/package/@grail-ai/core) — Core analysis engine
- [`grail-ai`](https://www.npmjs.com/package/grail-ai) — CLI

GitHub: [ryancbahan/grail-ai](https://github.com/ryancbahan/grail-ai)
