import { LanguageConfig } from "./types";

export const javascript: LanguageConfig = {
  name: "javascript",
  extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
  markers: ["package.json"],
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
