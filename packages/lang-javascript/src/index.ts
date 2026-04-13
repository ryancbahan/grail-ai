import { LanguageConfig } from "@grail-ai/core";
import { parseJavaScriptImports } from "./imports";
import { parseJavaScriptSymbols } from "./symbols";
import { resolveJavaScriptImport, clearResolverCache } from "./resolver";

export { clearResolverCache };
import { locateJavaScriptSymbol } from "./locator";

export const javascript: LanguageConfig = {
  name: "javascript",
  extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
  markers: ["package.json"],
  grammars: [
    { extensions: [".js", ".jsx", ".mjs", ".cjs"], grammarPackage: "tree-sitter-javascript", wasmFile: "tree-sitter-javascript.wasm" },
    { extensions: [".ts", ".mts", ".cts"], grammarPackage: "tree-sitter-typescript", wasmFile: "tree-sitter-typescript.wasm" },
    { extensions: [".tsx"], grammarPackage: "tree-sitter-typescript", wasmFile: "tree-sitter-tsx.wasm" },
  ],
  parseImports: parseJavaScriptImports,
  parseSymbols: parseJavaScriptSymbols,
  resolveImport: resolveJavaScriptImport,
  locateSymbol: locateJavaScriptSymbol,
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
};
