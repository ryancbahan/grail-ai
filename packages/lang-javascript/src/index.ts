import type { LanguageDescriptor } from "@grail-ai/core";

export { clearResolverCache } from "./resolver";

export const javascript: LanguageDescriptor = {
  name: "javascript",
  extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
  markers: ["package.json"],
  grammars: [
    { extensions: [".js", ".jsx", ".mjs", ".cjs"], grammarPackage: "tree-sitter-javascript", wasmFile: "tree-sitter-javascript.wasm" },
    { extensions: [".ts", ".mts", ".cts"], grammarPackage: "tree-sitter-typescript", wasmFile: "tree-sitter-typescript.wasm" },
    { extensions: [".tsx"], grammarPackage: "tree-sitter-typescript", wasmFile: "tree-sitter-tsx.wasm" },
  ],
  treeOptions: {
    ignorePaths: [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".DS_Store",
      ".next",
      ".nuxt",
    ],
  },
  load: async () => {
    const [imports, symbols, resolver, locator] = await Promise.all([
      import("./imports"),
      import("./symbols"),
      import("./resolver"),
      import("./locator"),
    ]);
    return {
      parseImports: imports.parseJavaScriptImports,
      parseSymbols: symbols.parseJavaScriptSymbols,
      resolveImport: resolver.resolveJavaScriptImport,
      locateSymbol: locator.locateJavaScriptSymbol,
    };
  },
};
