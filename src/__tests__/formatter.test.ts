import { formatTree } from "../cli/formatter";
import type { ASTNode, DirectoryNode, FileNode } from "../core/ast/types";

function file(name: string, extension: string | null = null): FileNode {
  return { type: "file", name, extension, imports: [] };
}

function dir(name: string, children: ASTNode[] = []): DirectoryNode {
  return { type: "directory", name, children };
}

describe("formatTree", () => {
  it("formats a single directory with no children", () => {
    const result = formatTree(dir("project"));
    expect(result).toBe("project/");
  });

  it("formats a flat list of files", () => {
    const tree = dir("src", [
      file("a.ts", ".ts"),
      file("b.ts", ".ts"),
      file("c.ts", ".ts"),
    ]);

    const result = formatTree(tree);
    const lines = result.split("\n");

    expect(lines[0]).toBe("src/");
    expect(lines[1]).toBe("├── a.ts");
    expect(lines[2]).toBe("├── b.ts");
    expect(lines[3]).toBe("└── c.ts");
  });

  it("formats nested directories", () => {
    const tree = dir("root", [
      dir("src", [
        file("index.ts", ".ts"),
      ]),
      file("readme.md", ".md"),
    ]);

    const result = formatTree(tree);
    const lines = result.split("\n");

    expect(lines[0]).toBe("root/");
    expect(lines[1]).toBe("├── src/");
    expect(lines[2]).toBe("│   └── index.ts");
    expect(lines[3]).toBe("└── readme.md");
  });

  it("formats deeply nested structures", () => {
    const tree = dir("a", [
      dir("b", [
        dir("c", [
          file("deep.txt", ".txt"),
        ]),
      ]),
    ]);

    const result = formatTree(tree);
    const lines = result.split("\n");

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("a/");
    expect(lines[3]).toContain("deep.txt");
  });

  it("uses correct connectors for mixed children", () => {
    const tree = dir("project", [
      dir("src", [
        file("app.ts", ".ts"),
        file("util.ts", ".ts"),
      ]),
      dir("test", [
        file("app.test.ts", ".ts"),
      ]),
      file("package.json", ".json"),
    ]);

    const result = formatTree(tree);

    expect(result).toContain("└── package.json");
    expect(result).toContain("├── src/");
    expect(result).toContain("├── test/");
  });

  it("handles a single file", () => {
    const result = formatTree(file("lonely.ts", ".ts"));
    expect(result).toBe("lonely.ts");
  });

  it("handles empty directories correctly", () => {
    const tree = dir("project", [
      dir("empty"),
      file("readme.md", ".md"),
    ]);

    const result = formatTree(tree);
    const lines = result.split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("├── empty/");
    expect(lines[2]).toBe("└── readme.md");
  });
});
