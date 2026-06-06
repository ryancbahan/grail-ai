import type { LanguageDescriptor } from "@grail-ai/core";

export const ruby: LanguageDescriptor = {
  name: "ruby",
  extensions: [".rb", ".rake", ".gemspec"],
  markers: ["Gemfile", "Rakefile"],
  grammars: [
    {
      extensions: [".rb", ".rake", ".gemspec"],
      grammarPackage: "tree-sitter-ruby",
      wasmFile: "tree-sitter-ruby.wasm",
    },
  ],
  treeOptions: {
    ignorePaths: [
      "vendor",
      ".bundle",
      ".git",
      ".DS_Store",
      "tmp",
      "log",
      "coverage",
      "pkg",
      "node_modules",
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
      parseImports: imports.parseRubyImports,
      parseSymbols: symbols.parseRubySymbols,
      resolveImport: resolver.resolveRubyImport,
      locateSymbol: locator.locateRubySymbol,
      buildCallGraph: callgraph.buildRubyCallGraph,
    };
  },
};
