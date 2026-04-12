import fs from "fs";
import path from "path";
import os from "os";
import { detectLanguage } from "./index";
import { javascript } from "./javascript";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-lang-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function touch(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, "");
}

describe("detectLanguage", () => {
  describe("marker file detection", () => {
    it("detects javascript when package.json is present", () => {
      touch(path.join(tmpDir, "package.json"));
      const lang = detectLanguage(tmpDir);

      expect(lang).toBeDefined();
      expect(lang!.name).toBe("javascript");
    });

    it("prioritizes marker files over extension frequency", () => {
      touch(path.join(tmpDir, "package.json"));
      // even with no .js/.ts files, marker should win
      touch(path.join(tmpDir, "readme.md"));
      touch(path.join(tmpDir, "notes.md"));

      const lang = detectLanguage(tmpDir);
      expect(lang!.name).toBe("javascript");
    });
  });

  describe("extension fallback detection", () => {
    it("detects javascript from .ts files", () => {
      touch(path.join(tmpDir, "index.ts"));
      touch(path.join(tmpDir, "utils.ts"));
      touch(path.join(tmpDir, "app.tsx"));

      const lang = detectLanguage(tmpDir);
      expect(lang).toBeDefined();
      expect(lang!.name).toBe("javascript");
    });

    it("detects javascript from .js files", () => {
      touch(path.join(tmpDir, "index.js"));
      touch(path.join(tmpDir, "helper.mjs"));

      const lang = detectLanguage(tmpDir);
      expect(lang!.name).toBe("javascript");
    });
  });

  describe("no match", () => {
    it("returns undefined for an empty directory", () => {
      const lang = detectLanguage(tmpDir);
      expect(lang).toBeUndefined();
    });

    it("returns undefined when no language matches", () => {
      touch(path.join(tmpDir, "data.csv"));
      touch(path.join(tmpDir, "image.png"));

      const lang = detectLanguage(tmpDir);
      expect(lang).toBeUndefined();
    });
  });
});

describe("javascript config", () => {
  it("has the expected marker", () => {
    expect(javascript.markers).toContain("package.json");
  });

  it("covers common JS/TS extensions", () => {
    const expected = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];
    for (const ext of expected) {
      expect(javascript.extensions).toContain(ext);
    }
  });

  it("ignores node_modules in treeOptions", () => {
    expect(javascript.treeOptions.ignorePaths).toContain("node_modules");
  });
});
