# @grail-ai/lang-rust

Rust language support for Grail. Provides module parsing, symbol extraction,
module resolution, symbol location, and call graph analysis using tree-sitter.

## Install

```bash
npm install @grail-ai/lang-rust
```

## Usage

```ts
import { registerLanguage } from "@grail-ai/core";
import { rust } from "@grail-ai/lang-rust";

registerLanguage(rust);
```
