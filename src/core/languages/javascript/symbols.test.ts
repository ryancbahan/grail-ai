import { parseJavaScriptSymbols } from "./symbols";
import { initLanguages } from "../index";
import { parseFile } from "../grammar-loader";

function parse(content: string) {
  const tree = parseFile("test.ts", content);
  const result = parseJavaScriptSymbols("test.ts", content, tree);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

beforeAll(async () => {
  await initLanguages();
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
    it("extracts export { a, b }", () => {
      const result = parse("const a = 1;\nconst b = 2;\nexport { a, b };");
      expect(result).toHaveLength(2);
      expect(result.map((s) => s.name).sort()).toEqual(["a", "b"]);
      expect(result.every((s) => s.kind === "unknown")).toBe(true);
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

  describe("edge cases", () => {
    it("returns empty for file with no exports", () => {
      expect(parse("const x = 1;")).toEqual([]);
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
