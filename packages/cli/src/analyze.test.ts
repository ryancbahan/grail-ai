import fs from "fs";
import path from "path";
import os from "os";
import { analyze, initAnalyzer, registerLanguage } from "@grail-ai/core";
import { javascript } from "@grail-ai/lang-javascript";

let tmpDir: string;

beforeAll(async () => {
  registerLanguage(javascript);
  await initAnalyzer();
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-analyze-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe("analyze", () => {
  it("returns a RootNode with absolutePath", () => {
    writeFile("index.ts", "const x = 1;\n");
    const { root } = analyze(tmpDir);

    expect(root.type).toBe("root");
    expect(root.absolutePath).toBe(tmpDir);
    expect(root.tree.type).toBe("directory");
  });

  it("detects javascript when package.json is present", () => {
    writeFile("package.json", "{}");
    writeFile("index.ts", "const x = 1;\n");
    const { language } = analyze(tmpDir);

    expect(language).toBeDefined();
    expect(language!.name).toBe("javascript");
  });

  it("returns undefined language for unknown projects", () => {
    writeFile("data.csv", "a,b,c\n");
    const { language } = analyze(tmpDir);

    expect(language).toBeUndefined();
  });

  it("populates imports when language supports parsing", () => {
    writeFile("package.json", "{}");
    writeFile("src/index.ts", 'import { helper } from "./utils";\n');
    writeFile("src/utils.ts", "export function helper() {}\n");

    const { root } = analyze(tmpDir);

    const src = root.tree.children.find((c) => c.name === "src");
    expect(src?.type).toBe("directory");
    if (src?.type !== "directory") return;

    const indexFile = src.children.find((c) => c.name === "index.ts");
    expect(indexFile?.type).toBe("file");
    if (indexFile?.type !== "file") return;

    expect(indexFile.imports.length).toBeGreaterThan(0);
    expect(indexFile.imports[0].specifier).toBe("./utils");
  });

  it("populates externals on root", () => {
    writeFile("package.json", "{}");
    writeFile("index.ts", 'import fs from "fs";\nimport lodash from "lodash";\n');

    const { root } = analyze(tmpDir);

    expect(root.externals).toContain("fs");
    expect(root.externals).toContain("lodash");
  });

  it("leaves imports empty when no language detected", () => {
    writeFile("data.csv", "a,b,c\n");

    const { root } = analyze(tmpDir);

    const file = root.tree.children.find((c) => c.name === "data.csv");
    if (file?.type === "file") {
      expect(file.imports).toEqual([]);
    }
  });

  it("applies language-specific ignore paths", () => {
    writeFile("package.json", "{}");
    writeFile("node_modules/pkg/index.js", "module.exports = {};\n");
    writeFile("src/index.ts", "const x = 1;\n");

    const { root } = analyze(tmpDir);
    const names = root.tree.children.map((c) => c.name);

    expect(names).not.toContain("node_modules");
    expect(names).toContain("src");
  });

  it("resolves relative paths to absolute", () => {
    writeFile("index.ts", "const x = 1;\n");
    const relative = path.relative(process.cwd(), tmpDir);
    const { root } = analyze(relative);

    expect(path.isAbsolute(root.absolutePath)).toBe(true);
  });
});

describe("initAnalyzer", () => {
  it("can be called multiple times without error", async () => {
    await initAnalyzer();
    await initAnalyzer();
  });
});
