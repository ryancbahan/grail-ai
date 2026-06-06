import { locateRubySymbol } from "./locator";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { ruby } from "./index";

beforeAll(async () => {
  registerLanguage(ruby);
  await loadLanguage(ruby);
});

function locate(content: string, symbolName: string, parentName?: string) {
  const tree = parseFile("test.rb", content);
  const result = locateRubySymbol("test.rb", content, tree, symbolName, parentName);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

describe("locateRubySymbol", () => {
  it("locates a method", () => {
    const content = "def greet(name)\n  puts name\nend";
    const result = locate(content, "greet");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("greet");
    expect(result!.kind).toBe("method");
    expect(result!.range!.start.line).toBe(1);
    expect(result!.range!.end.line).toBe(3);
    expect(result!.source).toContain("def greet");
  });

  it("locates a class", () => {
    const content = "class User\n  def name\n    @name\n  end\nend";
    const result = locate(content, "User");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("class");
    expect(result!.source).toContain("class User");
  });

  it("locates a method with parent class", () => {
    const content = "class User\n  def name\n    @name\n  end\nend";
    const result = locate(content, "name", "User");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("method");
    expect(result!.source).toContain("def name");
    expect(result!.source).not.toContain("class User");
  });

  it("locates a module", () => {
    const content = "module Auth\n  def check\n    true\n  end\nend";
    const result = locate(content, "Auth");
    expect(result!.kind).toBe("module");
  });

  it("returns null for nonexistent symbol", () => {
    expect(locate("def foo\nend", "bar")).toBeNull();
  });

  it("returns null for wrong parent", () => {
    const content = "class User\n  def name\n  end\nend";
    expect(locate(content, "name", "Admin")).toBeNull();
  });

  it("returns null for empty file", () => {
    expect(locate("", "anything")).toBeNull();
  });
});
