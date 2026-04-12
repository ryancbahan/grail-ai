import { parseJavaScriptImports } from "./imports";
import { initJavaScriptParsers } from "./parser";

const parse = (content: string) => parseJavaScriptImports("test.ts", content);

beforeAll(async () => {
  await initJavaScriptParsers();
});

describe("parseJavaScriptImports", () => {
  describe("ES static imports", () => {
    it("parses default import", () => {
      const result = parse('import foo from "bar"');
      expect(result).toEqual([{ specifier: "bar", kind: "static" }]);
    });

    it("parses named imports", () => {
      const result = parse('import { a, b } from "./lib"');
      expect(result).toEqual([{ specifier: "./lib", kind: "static" }]);
    });

    it("parses namespace import", () => {
      const result = parse('import * as d3 from "d3"');
      expect(result).toEqual([{ specifier: "d3", kind: "static" }]);
    });

    it("parses side-effect import", () => {
      const result = parse('import "./styles.css"');
      expect(result).toEqual([{ specifier: "./styles.css", kind: "static" }]);
    });

    it("parses single-quoted imports", () => {
      const result = parse("import foo from './bar'");
      expect(result).toEqual([{ specifier: "./bar", kind: "static" }]);
    });

    it("parses multiline import", () => {
      const result = parse(`import {
        a,
        b,
        c
      } from "./utils"`);
      expect(result).toEqual([{ specifier: "./utils", kind: "static" }]);
    });
  });

  describe("ES re-exports", () => {
    it("parses export from", () => {
      const result = parse('export { foo } from "./mod"');
      expect(result).toEqual([{ specifier: "./mod", kind: "static" }]);
    });

    it("parses export all", () => {
      const result = parse('export * from "./types"');
      expect(result).toEqual([{ specifier: "./types", kind: "static" }]);
    });
  });

  describe("CommonJS require", () => {
    it("parses require", () => {
      const result = parse('const x = require("foo")');
      expect(result).toEqual([{ specifier: "foo", kind: "require" }]);
    });

    it("parses require with single quotes", () => {
      const result = parse("const x = require('./local')");
      expect(result).toEqual([{ specifier: "./local", kind: "require" }]);
    });

    it("parses inline require", () => {
      const result = parse('const a = require("foo").bar');
      expect(result).toEqual([{ specifier: "foo", kind: "require" }]);
    });
  });

  describe("dynamic import", () => {
    it("parses dynamic import expression", () => {
      const result = parse('const mod = import("./lazy")');
      expect(result).toEqual([{ specifier: "./lazy", kind: "dynamic" }]);
    });

    it("parses dynamic import in then chain", () => {
      const result = parse('import("./chunk").then(m => m.default)');
      expect(result).toEqual([{ specifier: "./chunk", kind: "dynamic" }]);
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
      expect(result).toEqual([{ specifier: "real", kind: "static" }]);
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
      expect(result).toContainEqual({ specifier: "fs", kind: "static" });
      expect(result).toContainEqual({ specifier: "path", kind: "static" });
      expect(result).toContainEqual({ specifier: "lodash", kind: "require" });
      expect(result).toContainEqual({ specifier: "./lazy-mod", kind: "dynamic" });
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
