import fs from "fs";
import path from "path";
import os from "os";
import { buildTree, DEFAULT_IGNORE } from "./builder";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function touch(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, "");
}

describe("buildTree", () => {
  describe("RootNode shape", () => {
    it("returns a RootNode with type, absolutePath, and tree", () => {
      touch(path.join(tmpDir, "file.txt"));
      const root = buildTree(tmpDir);

      expect(root.type).toBe("root");
      expect(root.absolutePath).toBe(tmpDir);
      expect(root.tree.type).toBe("directory");
    });

    it("absolutePath is always absolute even when given a relative path", () => {
      touch(path.join(tmpDir, "file.txt"));
      const relative = path.relative(process.cwd(), tmpDir);
      const root = buildTree(relative);

      expect(path.isAbsolute(root.absolutePath)).toBe(true);
      expect(root.absolutePath).toBe(tmpDir);
    });
  });

  describe("DirectoryNode", () => {
    it("has type 'directory' and a children array", () => {
      touch(path.join(tmpDir, "a.txt"));
      const root = buildTree(tmpDir);

      expect(root.tree.type).toBe("directory");
      expect(Array.isArray(root.tree.children)).toBe(true);
    });

    it("does not have an extension property", () => {
      const root = buildTree(tmpDir);
      expect("extension" in root.tree).toBe(false);
    });

    it("sorts children alphabetically", () => {
      touch(path.join(tmpDir, "c.txt"));
      touch(path.join(tmpDir, "a.txt"));
      touch(path.join(tmpDir, "b.txt"));
      const root = buildTree(tmpDir);

      const names = root.tree.children.map((c) => c.name);
      expect(names).toEqual(["a.txt", "b.txt", "c.txt"]);
    });
  });

  describe("FileNode", () => {
    it("has type 'file' and an extension", () => {
      touch(path.join(tmpDir, "hello.ts"));
      const root = buildTree(tmpDir);
      const file = root.tree.children[0];

      expect(file.type).toBe("file");
      if (file.type === "file") {
        expect(file.extension).toBe(".ts");
      }
    });

    it("does not have a children property", () => {
      touch(path.join(tmpDir, "hello.ts"));
      const root = buildTree(tmpDir);
      const file = root.tree.children[0];

      expect("children" in file).toBe(false);
    });

    it("extracts common extensions correctly", () => {
      const cases = ["app.tsx", "style.css", "data.json", "readme.md", "Makefile"];
      for (const name of cases) {
        touch(path.join(tmpDir, name));
      }
      const root = buildTree(tmpDir);
      const byName = new Map(root.tree.children.map((c) => [c.name, c]));

      const get = (n: string) => {
        const node = byName.get(n);
        return node?.type === "file" ? node.extension : undefined;
      };

      expect(get("app.tsx")).toBe(".tsx");
      expect(get("style.css")).toBe(".css");
      expect(get("data.json")).toBe(".json");
      expect(get("readme.md")).toBe(".md");
      expect(get("Makefile")).toBeNull();
    });

    it("returns null extension for dotfiles", () => {
      touch(path.join(tmpDir, ".gitignore"));
      const root = buildTree(tmpDir);
      const file = root.tree.children[0];

      if (file.type === "file") {
        expect(file.extension).toBeNull();
      }
    });
  });

  describe("nested structure", () => {
    it("builds a nested tree", () => {
      touch(path.join(tmpDir, "src", "index.ts"));
      touch(path.join(tmpDir, "src", "utils", "helper.ts"));
      touch(path.join(tmpDir, "readme.md"));

      const root = buildTree(tmpDir);
      const names = root.tree.children.map((c) => c.name);
      expect(names).toContain("src");
      expect(names).toContain("readme.md");

      const src = root.tree.children.find((c) => c.name === "src");
      expect(src?.type).toBe("directory");
      if (src?.type === "directory") {
        const srcNames = src.children.map((c) => c.name);
        expect(srcNames).toContain("index.ts");
        expect(srcNames).toContain("utils");
      }
    });

    it("handles empty directories", () => {
      fs.mkdirSync(path.join(tmpDir, "empty"));
      const root = buildTree(tmpDir);
      const empty = root.tree.children.find((c) => c.name === "empty");

      expect(empty?.type).toBe("directory");
      if (empty?.type === "directory") {
        expect(empty.children).toEqual([]);
      }
    });
  });

  describe("ignore paths", () => {
    it("ignores DEFAULT_IGNORE entries", () => {
      touch(path.join(tmpDir, "node_modules", "pkg", "index.js"));
      touch(path.join(tmpDir, ".git", "HEAD"));
      touch(path.join(tmpDir, "dist", "bundle.js"));
      touch(path.join(tmpDir, ".DS_Store"));
      touch(path.join(tmpDir, "src", "index.ts"));

      const root = buildTree(tmpDir);
      const names = root.tree.children.map((c) => c.name);

      for (const ignored of DEFAULT_IGNORE) {
        expect(names).not.toContain(ignored);
      }
      expect(names).toContain("src");
    });

    it("uses custom ignorePaths when provided", () => {
      touch(path.join(tmpDir, "keep.ts"));
      touch(path.join(tmpDir, "vendor", "lib.js"));
      touch(path.join(tmpDir, "node_modules", "pkg", "index.js"));

      const root = buildTree(tmpDir, { ignorePaths: ["vendor"] });
      const names = root.tree.children.map((c) => c.name);

      expect(names).not.toContain("vendor");
      // custom list replaces defaults, so node_modules is NOT ignored
      expect(names).toContain("node_modules");
      expect(names).toContain("keep.ts");
    });

    it("ignores nothing when given an empty array", () => {
      touch(path.join(tmpDir, "node_modules", "pkg", "index.js"));
      touch(path.join(tmpDir, ".git", "HEAD"));

      const root = buildTree(tmpDir, { ignorePaths: [] });
      const names = root.tree.children.map((c) => c.name);

      expect(names).toContain("node_modules");
      expect(names).toContain(".git");
    });
  });
});
