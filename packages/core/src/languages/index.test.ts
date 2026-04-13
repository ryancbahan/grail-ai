import fs from "fs";
import path from "path";
import os from "os";
import { detectLanguage, registerLanguage, loadLanguage } from "./index";
import { LanguageDescriptor } from "./types";

const mockLang: LanguageDescriptor = {
  name: "mock",
  extensions: [".mock", ".mk"],
  markers: ["mock.config"],
  treeOptions: {},
  grammars: [],
  load: async () => ({
    parseImports: () => [],
    parseSymbols: () => [],
    resolveImport: () => null,
    locateSymbol: () => null,
  }),
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

describe("loadLanguage", () => {
  it("calls load() and returns Language with descriptor + implementation", async () => {
    const language = await loadLanguage(mockLang);
    expect(language.descriptor).toBe(mockLang);
    expect(language.implementation).toBeDefined();
    expect(typeof language.implementation.parseImports).toBe("function");
    expect(typeof language.implementation.parseSymbols).toBe("function");
    expect(typeof language.implementation.resolveImport).toBe("function");
    expect(typeof language.implementation.locateSymbol).toBe("function");
  });

  it("caches result — load() is only called once", async () => {
    let loadCount = 0;
    const trackingLang: LanguageDescriptor = {
      ...mockLang,
      name: "tracking",
      load: async () => {
        loadCount++;
        return {
          parseImports: () => [],
          parseSymbols: () => [],
          resolveImport: () => null,
          locateSymbol: () => null,
        };
      },
    };
    registerLanguage(trackingLang);

    await loadLanguage(trackingLang);
    await loadLanguage(trackingLang);
    await loadLanguage(trackingLang);

    expect(loadCount).toBe(1);
  });

  it("returns implementation that works", async () => {
    const language = await loadLanguage(mockLang);
    expect(language.implementation.parseImports("test.ts", "", null)).toEqual([]);
    expect(language.implementation.resolveImport("./foo", { containingFile: "", projectRoot: "" })).toBeNull();
  });
});
