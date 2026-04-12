import fs from "fs";
import path from "path";
import os from "os";
import { buildTree } from "./builder";
import { buildDependencyGraph } from "./dependencies";
import { collectFiles } from "./walker";
import { RootNode } from "./types";
import { javascript } from "../languages/javascript";
import { clearResolverCache } from "../languages/javascript/resolver";
import { initLanguages } from "../languages";

beforeAll(async () => {
  await initLanguages();
});

let tmpDir: string;

function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function findFile(root: RootNode, name: string) {
  return collectFiles(root).find((f) => f.filePath.endsWith(name));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-graph-"));
  clearResolverCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("buildDependencyGraph", () => {
  it("populates imports on file nodes", () => {
    writeFile("src/index.ts", 'import { helper } from "./utils";\n');
    writeFile("src/utils.ts", "export function helper() {}\n");

    const root = buildTree(tmpDir, { ignorePaths: [] });
    buildDependencyGraph(root, javascript);

    const indexFile = findFile(root, "src/index.ts");
    const utilsPath = path.join(tmpDir, "src", "utils.ts");

    expect(indexFile).toBeDefined();
    expect(indexFile!.node.imports).toHaveLength(1);
    expect(indexFile!.node.imports[0].specifier).toBe("./utils");
    expect(indexFile!.node.imports[0].resolvedPath).toBe(utilsPath);
    expect(indexFile!.node.imports[0].isExternal).toBe(false);
    expect(indexFile!.node.imports[0].symbols).toEqual([
      { name: "helper", originalName: "helper" },
    ]);
  });

  it("populates symbols on file nodes", () => {
    writeFile("src/utils.ts", "export function helper() {}\nexport const VERSION = 1;\n");

    const root = buildTree(tmpDir, { ignorePaths: [] });
    buildDependencyGraph(root, javascript);

    const file = findFile(root, "src/utils.ts");
    expect(file).toBeDefined();
    expect(file!.node.symbols).toHaveLength(2);
    expect(file!.node.symbols.map((s) => s.name).sort()).toEqual(["VERSION", "helper"]);
  });

  it("leaves imports empty for files with no imports", () => {
    writeFile("src/standalone.ts", "const x = 1;\n");

    const root = buildTree(tmpDir, { ignorePaths: [] });
    buildDependencyGraph(root, javascript);

    const file = findFile(root, "standalone.ts");
    expect(file).toBeDefined();
    expect(file!.node.imports).toEqual([]);
  });

  it("does not touch non-matching extensions", () => {
    writeFile("styles.css", "body { color: red; }");
    writeFile("index.ts", "const x = 1;\n");

    const root = buildTree(tmpDir, { ignorePaths: [] });
    buildDependencyGraph(root, javascript);

    const cssFile = findFile(root, "styles.css");
    expect(cssFile!.node.imports).toEqual([]);
    expect(cssFile!.node.symbols).toEqual([]);
  });

  it("populates externals on root", () => {
    writeFile("index.ts", `
      import fs from "fs";
      import lodash from "lodash";
      import { join } from "path";
    `);

    const root = buildTree(tmpDir, { ignorePaths: [] });
    buildDependencyGraph(root, javascript);

    expect(root.externals).toContain("fs");
    expect(root.externals).toContain("lodash");
    expect(root.externals).toContain("path");
  });

  it("handles circular dependencies", () => {
    writeFile("a.ts", 'import { b } from "./b";\n');
    writeFile("b.ts", 'import { a } from "./a";\n');

    const root = buildTree(tmpDir, { ignorePaths: [] });
    buildDependencyGraph(root, javascript);

    const aFile = findFile(root, "a.ts");
    const bFile = findFile(root, "b.ts");

    expect(aFile!.node.imports[0].resolvedPath).toBe(path.join(tmpDir, "b.ts"));
    expect(bFile!.node.imports[0].resolvedPath).toBe(path.join(tmpDir, "a.ts"));
  });
});
