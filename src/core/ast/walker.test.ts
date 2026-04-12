import { collectFiles } from "./walker";
import { RootNode, FileNode, DirectoryNode } from "./types";

function file(name: string, ext: string | null = null): FileNode {
  return { type: "file", name, extension: ext, imports: [] };
}

function dir(name: string, children: (FileNode | DirectoryNode)[] = []): DirectoryNode {
  return { type: "directory", name, children };
}

function makeRoot(tree: DirectoryNode): RootNode {
  return { type: "root", absolutePath: "/project", tree, externals: [] };
}

describe("collectFiles", () => {
  it("collects files from a flat directory", () => {
    const root = makeRoot(
      dir("project", [
        file("a.ts", ".ts"),
        file("b.ts", ".ts"),
      ])
    );

    const files = collectFiles(root);
    expect(files).toHaveLength(2);
    expect(files[0].filePath).toBe("/project/a.ts");
    expect(files[0].node.name).toBe("a.ts");
    expect(files[1].filePath).toBe("/project/b.ts");
  });

  it("collects files from nested directories", () => {
    const root = makeRoot(
      dir("project", [
        dir("src", [
          file("index.ts", ".ts"),
          dir("utils", [
            file("helper.ts", ".ts"),
          ]),
        ]),
        file("readme.md", ".md"),
      ])
    );

    const files = collectFiles(root);
    expect(files).toHaveLength(3);

    const paths = files.map((f) => f.filePath);
    expect(paths).toContain("/project/src/index.ts");
    expect(paths).toContain("/project/src/utils/helper.ts");
    expect(paths).toContain("/project/readme.md");
  });

  it("returns empty array for empty directory", () => {
    const root = makeRoot(dir("project"));
    expect(collectFiles(root)).toEqual([]);
  });

  it("skips directories — only returns file nodes", () => {
    const root = makeRoot(
      dir("project", [
        dir("empty"),
        dir("src", [file("app.ts", ".ts")]),
      ])
    );

    const files = collectFiles(root);
    expect(files).toHaveLength(1);
    expect(files[0].node.type).toBe("file");
  });

  it("constructs correct absolute paths from root", () => {
    const root: RootNode = {
      type: "root",
      absolutePath: "/home/user/code",
      tree: dir("code", [
        dir("lib", [file("index.js", ".js")]),
      ]),
      externals: [],
    };

    const files = collectFiles(root);
    expect(files[0].filePath).toBe("/home/user/code/lib/index.js");
  });

  it("returns FileEntry with correct node references", () => {
    const tsFile = file("app.ts", ".ts");
    const root = makeRoot(dir("project", [tsFile]));

    const files = collectFiles(root);
    expect(files[0].node).toBe(tsFile);
  });
});
