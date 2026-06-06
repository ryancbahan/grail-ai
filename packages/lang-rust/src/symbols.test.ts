import { parseRustSymbols } from "./symbols";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { rust } from "./index";

function parse(content: string) {
  const tree = parseFile("test.rs", content);
  const result = parseRustSymbols("test.rs", content, tree);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

beforeAll(async () => {
  registerLanguage(rust);
  await loadLanguage(rust);
});

describe("parseRustSymbols", () => {
  it("extracts functions with signatures and ranges", () => {
    const result = parse("pub fn greet(name: &str) -> String {\n  name.to_string()\n}");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("greet");
    expect(result[0].kind).toBe("function");
    expect(result[0].visibility).toBe("public");
    expect(result[0].signature).toBe("pub fn greet(name: &str) -> String");
    expect(result[0].range!.end.line).toBe(3);
  });

  it("extracts structs, enums, traits, type aliases, and constants", () => {
    const result = parse(`
pub struct User { id: u64 }
pub enum Role { Admin, Member }
pub trait Repository { fn find(&self, id: u64) -> Option<User>; }
type Id = u64;
const LIMIT: usize = 10;
`);
    expect(result.find((s) => s.name === "User")!.kind).toBe("class");
    expect(result.find((s) => s.name === "Role")!.kind).toBe("enum");
    expect(result.find((s) => s.name === "Repository")!.kind).toBe("trait");
    expect(result.find((s) => s.name === "find")!.parent).toBe("Repository");
    expect(result.find((s) => s.name === "Id")!.kind).toBe("type");
    expect(result.find((s) => s.name === "LIMIT")!.kind).toBe("variable");
  });

  it("extracts impl methods with type parent", () => {
    const result = parse("impl User { pub fn name(&self) -> &str { \"Ada\" } }");
    const method = result.find((s) => s.name === "name");
    expect(method).toBeDefined();
    expect(method!.kind).toBe("method");
    expect(method!.parent).toBe("User");
  });

  it("extracts nested module symbols with qualified parents", () => {
    const result = parse("pub mod api { pub fn serve() {} pub struct Request; }");
    expect(result.find((s) => s.name === "api")!.kind).toBe("module");
    expect(result.find((s) => s.name === "serve")!.parent).toBe("api");
    expect(result.find((s) => s.name === "Request")!.parent).toBe("api");
  });
});
