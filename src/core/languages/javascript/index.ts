import { LanguageConfig } from "../types";
import { parseJavaScriptImports } from "./imports";
import { resolveJavaScriptImport } from "./resolver";
import { initJavaScriptParsers } from "./parser";

export { initJavaScriptParsers } from "./parser";

export const javascript: LanguageConfig = {
  name: "javascript",
  extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
  markers: ["package.json"],
  init: initJavaScriptParsers,
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
