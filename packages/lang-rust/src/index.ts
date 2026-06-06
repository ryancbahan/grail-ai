import type { LanguageDescriptor } from "@grail-ai/core";

export const rust: LanguageDescriptor = {
  name: "rust",
  extensions: [".rs"],
  markers: ["Cargo.toml"],
  grammars: [
    {
      extensions: [".rs"],
      grammarPackage: "tree-sitter-rust",
      wasmFile: "tree-sitter-rust.wasm",
    },
  ],
  treeOptions: {
    ignorePaths: [
      "target",
      ".git",
      ".DS_Store",
      "node_modules",
      "vendor",
    ],
  },
  load: async () => {
    const [imports, symbols, resolver, locator, callgraph] = await Promise.all([
      import("./imports"),
      import("./symbols"),
      import("./resolver"),
      import("./locator"),
      import("./callgraph"),
    ]);
    return {
      parseImports: imports.parseRustImports,
      parseSymbols: symbols.parseRustSymbols,
      resolveImport: resolver.resolveRustImport,
      locateSymbol: locator.locateRustSymbol,
      buildCallGraph: callgraph.buildRustCallGraph,
    };
  },
};
