import { locateJavaScriptSymbol } from "./locator";
import { registerLanguage, loadLanguage, parseFile } from "@grail-ai/core";
import { javascript } from "./index";

beforeAll(async () => {
  registerLanguage(javascript);
  await loadLanguage(javascript);
});

function locate(content: string, symbolName: string, parentName?: string) {
  const tree = parseFile("test.ts", content);
  const result = locateJavaScriptSymbol("test.ts", content, tree, symbolName, parentName);
  if (tree && typeof (tree as { delete?: () => void }).delete === "function") {
    (tree as { delete: () => void }).delete();
  }
  return result;
}

describe("locateJavaScriptSymbol", () => {
  describe("exported functions", () => {
    it("locates an exported function", () => {
      const content = "export function buildTree(dir: string): RootNode {\n  return dir;\n}";
      const result = locate(content, "buildTree");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("buildTree");
      expect(result!.kind).toBe("function");
      expect(result!.range!.start.line).toBe(1);
      expect(result!.range!.end.line).toBe(3);
      expect(result!.source).toContain("export function buildTree");
      expect(result!.source).toContain("return dir;");
    });
  });

  describe("exported variables", () => {
    it("locates an exported const", () => {
      const content = 'export const VERSION = "1.0.0";';
      const result = locate(content, "VERSION");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("VERSION");
      expect(result!.kind).toBe("variable");
      expect(result!.source).toContain("VERSION");
    });
  });

  describe("exported types", () => {
    it("locates an exported interface", () => {
      const content = "export interface FileNode {\n  type: string;\n  name: string;\n}";
      const result = locate(content, "FileNode");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("FileNode");
      expect(result!.kind).toBe("interface");
      expect(result!.source).toContain("type: string");
    });

    it("locates an exported type alias", () => {
      const content = "export type ASTNode = FileNode | DirectoryNode;";
      const result = locate(content, "ASTNode");
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("type");
    });
  });

  describe("exported classes", () => {
    it("locates an exported class", () => {
      const content = "export class Parser {\n  parse() {}\n}";
      const result = locate(content, "Parser");
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("class");
      expect(result!.source).toContain("class Parser");
    });
  });

  describe("class methods", () => {
    it("locates a method with parent", () => {
      const content = "export class Parser {\n  parse(input: string): Tree {\n    return input;\n  }\n}";
      const result = locate(content, "parse", "Parser");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("parse");
      expect(result!.kind).toBe("method");
      expect(result!.source).toContain("parse(input: string)");
      expect(result!.source).not.toContain("class Parser");
    });

    it("returns null for method with wrong parent", () => {
      const content = "export class Parser {\n  parse() {}\n}";
      expect(locate(content, "parse", "NonExistent")).toBeNull();
    });
  });

  describe("non-exported declarations", () => {
    it("locates a non-exported function", () => {
      const content = "function helper() {\n  return 1;\n}";
      const result = locate(content, "helper");
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("function");
    });

    it("locates a non-exported const", () => {
      const content = "const MAX = 100;";
      const result = locate(content, "MAX");
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("variable");
    });
  });

  describe("not found", () => {
    it("returns null for non-existent symbol", () => {
      expect(locate("const x = 1;", "nonexistent")).toBeNull();
    });

    it("returns null for empty file", () => {
      expect(locate("", "anything")).toBeNull();
    });
  });

  describe("range", () => {
    it("returns correct range for multi-line function", () => {
      const content = "const x = 1;\n\nexport function foo() {\n  return x;\n}";
      const result = locate(content, "foo");
      expect(result).not.toBeNull();
      expect(result!.range!.start.line).toBe(3);
      expect(typeof result!.range!.start.column).toBe("number");
      expect(result!.range!.end.line).toBe(5);
    });
  });
});
