import fs from "fs";
import path from "path";
import os from "os";
import { detectLanguage, registerLanguage } from "./index";
import { LanguageConfig } from "./types";

const mockLang: LanguageConfig = {
  name: "mock",
  extensions: [".mock", ".mk"],
  markers: ["mock.config"],
  treeOptions: {},
  grammars: [],
  parseImports: () => [],
  parseSymbols: () => [],
  resolveImport: () => null,
  locateSymbol: () => null,
};

let tmpDir: string;

beforeAll(() => {
  registerLanguage(mockLang);
});

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
  it("detects language by marker file", () => {
    touch(path.join(tmpDir, "mock.config"));
    const lang = detectLanguage(tmpDir);
    expect(lang).toBeDefined();
    expect(lang!.name).toBe("mock");
  });

  it("detects language by extension frequency", () => {
    touch(path.join(tmpDir, "a.mock"));
    touch(path.join(tmpDir, "b.mock"));
    const lang = detectLanguage(tmpDir);
    expect(lang!.name).toBe("mock");
  });

  it("prioritizes marker over extension", () => {
    touch(path.join(tmpDir, "mock.config"));
    touch(path.join(tmpDir, "readme.txt"));
    const lang = detectLanguage(tmpDir);
    expect(lang!.name).toBe("mock");
  });

  it("returns undefined for empty directory", () => {
    expect(detectLanguage(tmpDir)).toBeUndefined();
  });

  it("returns undefined when no language matches", () => {
    touch(path.join(tmpDir, "data.csv"));
    expect(detectLanguage(tmpDir)).toBeUndefined();
  });
});
