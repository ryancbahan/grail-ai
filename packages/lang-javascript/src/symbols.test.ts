import { parseJavaScriptSymbols } from "./symbols";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { javascript } from "./index";

function parse(content: string) {
  const tree = parseFile("test.ts", content);
  const result = parseJavaScriptSymbols("test.ts", content, tree);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

beforeAll(async () => {
  registerLanguage(javascript);
  await loadLanguage(javascript);
});

describe("parseJavaScriptSymbols", () => {
  describe("function exports", () => {
    it("extracts function with signature", () => {
      const result = parse("export function buildTree(dirPath: string, options?: TreeOptions): RootNode {}");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("buildTree");
      expect(result[0].kind).toBe("function");
      expect(result[0].visibility).toBe("public");
      expect(result[0].signature).toContain("buildTree");
      expect(result[0].signature).toContain("dirPath");
      expect(result[0].signature).not.toContain("{");
    });

    it("extracts async function", () => {
      const result = parse("export async function fetchData(): Promise<void> {}");
      expect(result[0].name).toBe("fetchData");
      expect(result[0].kind).toBe("function");
      expect(result[0].signature).toContain("fetchData");
    });
  });

  describe("class exports", () => {
    it("extracts class with signature", () => {
      const result = parse("export class Parser extends Base {}");
      const cls = result.find((s) => s.kind === "class");
      expect(cls).toBeDefined();
      expect(cls!.name).toBe("Parser");
      expect(cls!.signature).toContain("Parser");
      expect(cls!.signature).toContain("Base");
      expect(cls!.signature).not.toContain("{");
    });

    it("extracts class methods with parent", () => {
      const result = parse(`export class Foo {
        doStuff(x: number): void {}
        private helper(): string {}
      }`);
      const methods = result.filter((s) => s.kind === "method");
      expect(methods.length).toBeGreaterThanOrEqual(1);
      const doStuff = methods.find((m) => m.name === "doStuff");
      expect(doStuff).toBeDefined();
      expect(doStuff!.parent).toBe("Foo");
      expect(doStuff!.visibility).toBe("public");

      const helper = methods.find((m) => m.name === "helper");
      if (helper) {
        expect(helper.visibility).toBe("private");
        expect(helper.parent).toBe("Foo");
      }
    });
  });

  describe("variable exports", () => {
    it("extracts const with signature", () => {
      const result = parse("export const VERSION = 1;");
      expect(result[0].name).toBe("VERSION");
      expect(result[0].kind).toBe("variable");
      expect(result[0].signature).toContain("VERSION");
      expect(result[0].signature).not.toContain("= 1");
    });

    it("extracts multiple declarators", () => {
      const result = parse("export const a = 1, b = 2;");
      expect(result).toHaveLength(2);
      expect(result.map((s) => s.name).sort()).toEqual(["a", "b"]);
    });
  });

  describe("type exports", () => {
    it("extracts type alias with full signature", () => {
      const result = parse("export type ASTNode = FileNode | DirectoryNode;");
      expect(result[0].name).toBe("ASTNode");
      expect(result[0].kind).toBe("type");
      expect(result[0].signature).toContain("FileNode | DirectoryNode");
    });

    it("extracts interface with full signature", () => {
      const result = parse("export interface FileNode { type: string; name: string; }");
      expect(result[0].name).toBe("FileNode");
      expect(result[0].kind).toBe("interface");
      expect(result[0].signature).toContain("type: string");
    });

    it("extracts enum", () => {
      const result = parse("export enum Direction { Up, Down }");
      expect(result[0].name).toBe("Direction");
      expect(result[0].kind).toBe("enum");
    });
  });

  describe("default exports", () => {
    it("extracts export default expression", () => {
      const result = parse("export default 42;");
      expect(result[0].name).toBe("default");
      expect(result[0].kind).toBe("default");
    });
  });

  describe("named export lists", () => {
    it("extracts export { a, b } plus internal declarations", () => {
      const result = parse("const a = 1;\nconst b = 2;\nexport { a, b };");
      // Internal consts + public re-exports (deduped by kind:name key)
      const publicSyms = result.filter((s) => s.visibility === "public");
      expect(publicSyms).toHaveLength(2);
      expect(publicSyms.map((s) => s.name).sort()).toEqual(["a", "b"]);
      const internalSyms = result.filter((s) => s.visibility === "internal");
      expect(internalSyms).toHaveLength(2);
    });

    it("skips re-exports with source", () => {
      expect(parse('export { foo } from "./mod";')).toEqual([]);
    });
  });

  describe("mixed exports", () => {
    it("collects all from one file", () => {
      const result = parse(`
        export function buildTree() {}
        export const VERSION = 1;
        export type ASTNode = string;
        export interface Config {}
      `);
      expect(result).toHaveLength(4);
      expect(result.map((s) => s.name).sort()).toEqual(["ASTNode", "Config", "VERSION", "buildTree"]);
    });
  });

  describe("object literal methods", () => {
    it("emits child symbols for arrow function properties", () => {
      const result = parse(`export const cmd = { run: async () => {} };`);
      const variable = result.find((s) => s.name === "cmd");
      const method = result.find((s) => s.name === "run");

      expect(variable).toBeDefined();
      expect(variable!.kind).toBe("variable");

      expect(method).toBeDefined();
      expect(method!.kind).toBe("method");
      expect(method!.parent).toBe("cmd");
    });

    it("emits child symbols for method shorthand", () => {
      const result = parse(`export const cmd = { run() {} };`);
      const method = result.find((s) => s.name === "run");

      expect(method).toBeDefined();
      expect(method!.kind).toBe("method");
      expect(method!.parent).toBe("cmd");
    });

    it("does not emit child symbols for non-function properties", () => {
      const result = parse(`export const cmd = { name: "test", run: () => {} };`);
      const names = result.map((s) => s.name);

      expect(names).toContain("cmd");
      expect(names).toContain("run");
      expect(names).not.toContain("name");
    });

    it("handles multiple function properties", () => {
      const result = parse(`export const obj = { a: () => {}, b() {}, c: "not a function" };`);
      const methods = result.filter((s) => s.parent === "obj");

      expect(methods).toHaveLength(2);
      expect(methods.map((m) => m.name).sort()).toEqual(["a", "b"]);
    });

    it("works for internal (non-exported) variables", () => {
      const result = parse(`const handler = { process: () => {} };`);
      const method = result.find((s) => s.name === "process");

      expect(method).toBeDefined();
      expect(method!.parent).toBe("handler");
      expect(method!.visibility).toBe("internal");
    });
  });

  describe("range positions", () => {
    it("includes range with line and column on exported function", () => {
      const result = parse("export function foo(x: number): void {}");
      expect(result[0].range).toBeDefined();
      expect(result[0].range!.start.line).toBe(1);
      // column is 7 because rangeOf targets the function_declaration inside export_statement
      expect(result[0].range!.start.column).toBe(7);
      expect(result[0].range!.end.line).toBe(1);
    });

    it("includes correct range on multi-line function", () => {
      const result = parse("const x = 1;\n\nexport function bar() {\n  return x;\n}");
      const bar = result.find((s) => s.name === "bar");
      expect(bar!.range!.start.line).toBe(3);
      expect(bar!.range!.end.line).toBe(5);
    });

    it("includes range on class and its methods", () => {
      const result = parse("export class Svc {\n  handle() {}\n}");
      const cls = result.find((s) => s.name === "Svc");
      const method = result.find((s) => s.name === "handle");
      expect(cls!.range!.start.line).toBe(1);
      expect(cls!.range!.end.line).toBe(3);
      expect(method!.range!.start.line).toBe(2);
      expect(method!.range!.end.line).toBe(2);
    });

    it("includes range on interface", () => {
      const result = parse("export interface Cfg {\n  key: string;\n}");
      expect(result[0].range!.start.line).toBe(1);
      expect(result[0].range!.end.line).toBe(3);
    });

    it("includes range on object literal methods", () => {
      const result = parse("export const cmd = {\n  run() {},\n};");
      const method = result.find((s) => s.name === "run");
      expect(method!.range).toBeDefined();
      expect(method!.range!.start.line).toBe(2);
    });

    it("includes column offset for indented declarations", () => {
      // Column should reflect the actual position in the line
      const result = parse("export class Foo {\n  doStuff() {}\n}");
      const method = result.find((s) => s.name === "doStuff");
      expect(method!.range!.start.column).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("extracts internal symbols from file with no exports", () => {
      const result = parse("const x = 1;");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("x");
      expect(result[0].visibility).toBe("internal");
    });

    it("returns empty for empty file", () => {
      expect(parse("")).toEqual([]);
    });

    it("deduplicates identical exports", () => {
      const result = parse("export function foo() {}\nexport function foo() {}");
      expect(result).toHaveLength(1);
    });
  });
});
