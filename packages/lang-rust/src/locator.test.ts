import { locateRustSymbol } from "./locator";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { rust } from "./index";

beforeAll(async () => {
  registerLanguage(rust);
  await loadLanguage(rust);
});

function locate(content: string, symbolName: string, parentName?: string) {
  const tree = parseFile("test.rs", content);
  const result = locateRustSymbol("test.rs", content, tree, symbolName, parentName);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

describe("locateRustSymbol", () => {
  it("locates a function", () => {
    const result = locate("fn run() {\n  helper();\n}", "run");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("function");
    expect(result!.range!.end.line).toBe(3);
    expect(result!.source).toContain("fn run");
  });

  it("locates a struct", () => {
    const result = locate("pub struct User { id: u64 }", "User");
    expect(result!.kind).toBe("class");
  });

  it("locates an impl method by parent type", () => {
    const result = locate("impl User { pub fn name(&self) -> &str { \"Ada\" } }", "name", "User");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("method");
    expect(result!.source).toContain("fn name");
  });

  it("returns null for nonexistent symbols", () => {
    expect(locate("fn run() {}", "missing")).toBeNull();
  });
});
