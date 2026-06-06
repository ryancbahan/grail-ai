import { parseRubySymbols } from "./symbols";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { ruby } from "./index";

function parse(content: string) {
  const tree = parseFile("test.rb", content);
  const result = parseRubySymbols("test.rb", content, tree);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

beforeAll(async () => {
  registerLanguage(ruby);
  await loadLanguage(ruby);
});

describe("parseRubySymbols", () => {
  describe("methods", () => {
    it("extracts a method definition", () => {
      const result = parse("def greet(name)\n  puts name\nend");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("greet");
      expect(result[0].kind).toBe("method");
      expect(result[0].signature).toBe("def greet(name)");
    });

    it("extracts a method without parameters", () => {
      const result = parse("def run\n  execute\nend");
      expect(result[0].name).toBe("run");
      expect(result[0].signature).toBe("def run");
    });

    it("marks underscore-prefixed methods as private", () => {
      const result = parse("def _internal\n  1\nend");
      expect(result[0].visibility).toBe("private");
    });
  });

  describe("singleton methods", () => {
    it("extracts a self.method", () => {
      const result = parse("def self.create(attrs)\n  new(attrs)\nend");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("create");
      expect(result[0].kind).toBe("function");
      expect(result[0].signature).toBe("def self.create(attrs)");
    });
  });

  describe("classes", () => {
    it("extracts a class", () => {
      const result = parse("class User\nend");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("User");
      expect(result[0].kind).toBe("class");
      expect(result[0].signature).toBe("class User");
    });

    it("extracts a class with superclass", () => {
      const result = parse("class Admin < User\nend");
      const cls = result.find((s) => s.kind === "class");
      expect(cls!.signature).toBe("class Admin < User");
    });

    it("extracts methods inside a class with parent", () => {
      const result = parse("class User\n  def name\n    @name\n  end\nend");
      const method = result.find((s) => s.kind === "method");
      expect(method).toBeDefined();
      expect(method!.name).toBe("name");
      expect(method!.parent).toBe("User");
    });
  });

  describe("modules", () => {
    it("extracts a module", () => {
      const result = parse("module Helpers\nend");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Helpers");
      expect(result[0].kind).toBe("module");
      expect(result[0].signature).toBe("module Helpers");
    });

    it("extracts methods inside a module with parent", () => {
      const result = parse("module Auth\n  def authenticate\n    true\n  end\nend");
      const method = result.find((s) => s.kind === "method");
      expect(method!.parent).toBe("Auth");
    });

    it("adds function symbols for methods after no-arg module_function", () => {
      const result = parse("module ActivityProse\n  module_function\n\n  def render(activity)\n    activity\n  end\nend");
      const renderSymbols = result.filter((s) => s.name === "render");
      expect(renderSymbols.map((s) => s.kind).sort()).toEqual(["function", "method"]);
      const exported = renderSymbols.find((s) => s.kind === "function");
      expect(exported!.parent).toBe("ActivityProse");
      expect(exported!.signature).toBe("def self.render(activity)");
    });
  });

  describe("constants", () => {
    it("extracts constant assignment", () => {
      const result = parse('VERSION = "1.0.0"');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("VERSION");
      expect(result[0].kind).toBe("variable");
      expect(result[0].signature).toContain("VERSION");
    });
  });

  describe("attr_accessor", () => {
    it("extracts attr_reader symbols", () => {
      const result = parse("class User\n  attr_reader :name, :email\nend");
      const attrs = result.filter((s) => s.signature.startsWith("attr_reader"));
      expect(attrs).toHaveLength(2);
      expect(attrs.map((a) => a.name).sort()).toEqual(["email", "name"]);
      expect(attrs[0].parent).toBe("User");
    });

    it("extracts attr_accessor symbols", () => {
      const result = parse("class User\n  attr_accessor :age\nend");
      const attr = result.find((s) => s.name === "age");
      expect(attr).toBeDefined();
      expect(attr!.signature).toBe("attr_accessor :age");
    });
  });

  describe("Rails scopes", () => {
    it("extracts scope macros as class-level function symbols", () => {
      const result = parse("class Issue\n  scope :open_state, -> { where(open: true) }\nend");
      const scope = result.find((s) => s.name === "open_state");
      expect(scope).toBeDefined();
      expect(scope!.kind).toBe("function");
      expect(scope!.parent).toBe("Issue");
      expect(scope!.signature).toBe("scope :open_state");
    });
  });

  describe("range positions", () => {
    it("includes range on method", () => {
      const result = parse("def foo\n  1\nend");
      expect(result[0].range).toBeDefined();
      expect(result[0].range!.start.line).toBe(1);
      expect(result[0].range!.end.line).toBe(3);
    });

    it("includes range on class", () => {
      const result = parse("class Foo\n  def bar\n  end\nend");
      const cls = result.find((s) => s.kind === "class");
      expect(cls!.range!.start.line).toBe(1);
      expect(cls!.range!.end.line).toBe(4);
    });
  });

  describe("edge cases", () => {
    it("returns empty for empty file", () => {
      expect(parse("")).toEqual([]);
    });

    it("deduplicates identical symbols", () => {
      const result = parse("def foo\nend\ndef foo\nend");
      expect(result).toHaveLength(1);
    });
  });
});
