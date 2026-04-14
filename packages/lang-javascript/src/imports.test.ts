import { parseJavaScriptImports } from "./imports";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { javascript } from "./index";

function parse(content: string) {
  const tree = parseFile("test.ts", content);
  const result = parseJavaScriptImports("test.ts", content, tree);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

beforeAll(async () => {
  registerLanguage(javascript);
  await loadLanguage(javascript);
});

describe("parseJavaScriptImports", () => {
  describe("ES static imports", () => {
    it("parses default import", () => {
      const result = parse('import foo from "bar"');
      expect(result).toHaveLength(1);
      expect(result[0].specifier).toBe("bar");
      expect(result[0].kind).toBe("static");
      expect(result[0].symbols).toEqual([{ name: "foo", originalName: "default" }]);
    });

    it("parses named imports", () => {
      const result = parse('import { a, b } from "./lib"');
      expect(result[0].specifier).toBe("./lib");
      expect(result[0].symbols).toEqual([
        { name: "a", originalName: "a" },
        { name: "b", originalName: "b" },
      ]);
    });

    it("parses aliased named imports", () => {
      const result = parse('import { foo as bar } from "./lib"');
      expect(result[0].symbols).toEqual([{ name: "bar", originalName: "foo" }]);
    });

    it("parses namespace import", () => {
      const result = parse('import * as d3 from "d3"');
      expect(result[0].symbols).toEqual([{ name: "d3", originalName: "*" }]);
    });

    it("parses side-effect import", () => {
      const result = parse('import "./styles.css"');
      expect(result[0].specifier).toBe("./styles.css");
      expect(result[0].symbols).toEqual([]);
    });

    it("parses single-quoted imports", () => {
      const result = parse("import foo from './bar'");
      expect(result[0].specifier).toBe("./bar");
    });

    it("parses multiline import", () => {
      const result = parse(`import {
        a,
        b,
        c
      } from "./utils"`);
      expect(result[0].specifier).toBe("./utils");
      expect(result[0].symbols).toHaveLength(3);
    });
  });

  describe("ES re-exports", () => {
    it("parses export from", () => {
      const result = parse('export { foo } from "./mod"');
      expect(result).toMatchObject([{ specifier: "./mod", kind: "static", symbols: [] }]);
      expect(result[0].range).toBeDefined();
    });

    it("parses export all", () => {
      const result = parse('export * from "./types"');
      expect(result).toMatchObject([{ specifier: "./types", kind: "static", symbols: [] }]);
      expect(result[0].range).toBeDefined();
    });
  });

  describe("CommonJS require", () => {
    it("parses require", () => {
      const result = parse('const x = require("foo")');
      expect(result).toMatchObject([{ specifier: "foo", kind: "require", symbols: [] }]);
      expect(result[0].range).toBeDefined();
    });

    it("parses require with single quotes", () => {
      const result = parse("const x = require('./local')");
      expect(result[0].specifier).toBe("./local");
    });
  });

  describe("dynamic import", () => {
    it("parses dynamic import expression", () => {
      const result = parse('const mod = import("./lazy")');
      expect(result).toMatchObject([{ specifier: "./lazy", kind: "dynamic", symbols: [] }]);
      expect(result[0].range).toBeDefined();
    });
  });

  describe("comment stripping", () => {
    it("ignores single-line commented imports", () => {
      const result = parse('// import foo from "bar"');
      expect(result).toEqual([]);
    });

    it("ignores multi-line commented imports", () => {
      const result = parse('/* import foo from "bar" */');
      expect(result).toEqual([]);
    });

    it("parses real import but ignores commented one", () => {
      const result = parse(`
        // import fake from "fake"
        import real from "real"
      `);
      expect(result).toHaveLength(1);
      expect(result[0].specifier).toBe("real");
    });
  });

  describe("mixed and multiple imports", () => {
    it("parses multiple import styles in one file", () => {
      const result = parse(`
        import fs from "fs";
        import { join } from "path";
        const lodash = require("lodash");
        const lazy = import("./lazy-mod");
      `);
      expect(result).toHaveLength(4);
      expect(result.map((r) => r.specifier).sort()).toEqual(
        ["./lazy-mod", "fs", "lodash", "path"]
      );
    });

    it("deduplicates identical imports", () => {
      const result = parse(`
        import foo from "bar";
        import baz from "bar";
      `);
      expect(result).toHaveLength(1);
    });

    it("keeps different kinds of same specifier", () => {
      const result = parse(`
        import foo from "bar";
        const bar = require("bar");
      `);
      expect(result).toHaveLength(2);
    });
  });

  describe("range positions", () => {
    it("includes range on static import", () => {
      const result = parse('import foo from "bar"');
      expect(result[0].range).toBeDefined();
      expect(result[0].range!.start.line).toBe(1);
      expect(result[0].range!.start.column).toBe(0);
      expect(result[0].range!.end.line).toBe(1);
    });

    it("includes range on multi-line import", () => {
      const result = parse(`import {\n  a,\n  b\n} from "./utils"`);
      expect(result[0].range!.start.line).toBe(1);
      expect(result[0].range!.end.line).toBe(4);
    });

    it("includes range on require call expression", () => {
      const result = parse('const x = require("foo")');
      // Range should cover the call expression, not the full statement
      expect(result[0].range!.start.column).toBeGreaterThan(0);
      expect(result[0].range!.start.line).toBe(1);
    });

    it("includes range on dynamic import", () => {
      const result = parse('const m = import("./lazy")');
      expect(result[0].range!.start.line).toBe(1);
      expect(result[0].range!.start.column).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for file with no imports", () => {
      const result = parse("const x = 1;\nconsole.log(x);");
      expect(result).toEqual([]);
    });

    it("returns empty array for empty file", () => {
      const result = parse("");
      expect(result).toEqual([]);
    });
  });
});
