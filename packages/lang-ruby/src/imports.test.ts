import { parseRubyImports } from "./imports";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { ruby } from "./index";

function parse(content: string) {
  const tree = parseFile("test.rb", content);
  const result = parseRubyImports("test.rb", content, tree);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

beforeAll(async () => {
  registerLanguage(ruby);
  await loadLanguage(ruby);
});

describe("parseRubyImports", () => {
  describe("require", () => {
    it("parses require with double quotes", () => {
      const result = parse('require "json"');
      expect(result).toHaveLength(1);
      expect(result[0].specifier).toBe("json");
      expect(result[0].kind).toBe("require");
    });

    it("parses require with single quotes", () => {
      const result = parse("require 'yaml'");
      expect(result[0].specifier).toBe("yaml");
    });

    it("parses require with nested path", () => {
      const result = parse('require "net/http"');
      expect(result[0].specifier).toBe("net/http");
    });
  });

  describe("require_relative", () => {
    it("parses require_relative", () => {
      const result = parse('require_relative "./models/user"');
      expect(result).toHaveLength(1);
      expect(result[0].specifier).toBe("./models/user");
      expect(result[0].kind).toBe("static");
    });

    it("parses require_relative without leading dot", () => {
      const result = parse('require_relative "helpers"');
      expect(result[0].specifier).toBe("helpers");
    });
  });

  describe("range positions", () => {
    it("includes range on require", () => {
      const result = parse('require "json"');
      expect(result[0].range).toBeDefined();
      expect(result[0].range!.start.line).toBe(1);
    });
  });

  describe("multiple imports", () => {
    it("parses multiple require statements", () => {
      const result = parse('require "json"\nrequire "yaml"\nrequire_relative "./lib/utils"');
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.specifier).sort()).toEqual(["./lib/utils", "json", "yaml"]);
    });

    it("deduplicates identical requires", () => {
      const result = parse('require "json"\nrequire "json"');
      expect(result).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("returns empty for file with no requires", () => {
      expect(parse("puts 'hello'")).toEqual([]);
    });

    it("returns empty for empty file", () => {
      expect(parse("")).toEqual([]);
    });

    it("ignores commented requires", () => {
      const result = parse('# require "foo"');
      expect(result).toEqual([]);
    });
  });
});
