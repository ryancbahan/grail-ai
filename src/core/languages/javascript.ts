import { LanguageConfig } from "./types";
import { parseJavaScriptImports } from "./javascript-imports";
import { resolveJavaScriptImport } from "./javascript-resolver";

export const javascript: LanguageConfig = {
  name: "javascript",
  extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
  markers: ["package.json"],
  parseImports: parseJavaScriptImports,
  resolveImport: resolveJavaScriptImport,
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
