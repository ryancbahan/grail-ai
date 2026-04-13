import fs from "fs";
import path from "path";
import type { Parser, Language } from "web-tree-sitter";
import { GrammarMapping, LanguageConfig } from "./types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TreeSitter: {
  Parser: typeof Parser & { init: (opts?: Record<string, unknown>) => Promise<void> };
  Language: typeof Language;
} = require("web-tree-sitter");

let runtimeInitialized = false;
let initPromise: Promise<void> | null = null;

const parsersByExtension = new Map<string, Parser>();

function loadWasm(grammarPackage: string, wasmFile: string): Uint8Array {
  const dir = path.dirname(require.resolve(`${grammarPackage}/package.json`));
  return fs.readFileSync(path.join(dir, wasmFile));
}

async function initRuntime(): Promise<void> {
  if (runtimeInitialized) return;
  await TreeSitter.Parser.init({
    locateFile: (scriptName: string) =>
      path.join(
        path.dirname(require.resolve("web-tree-sitter")),
        scriptName
      ),
  });
  runtimeInitialized = true;
}

async function loadGrammars(grammars: GrammarMapping[]): Promise<void> {
  const loads = grammars.map(async (mapping) => {
    const wasm = loadWasm(mapping.grammarPackage, mapping.wasmFile);
    const lang = await TreeSitter.Language.load(wasm);
    const parser = new TreeSitter.Parser();
    parser.setLanguage(lang);

    for (const ext of mapping.extensions) {
      parsersByExtension.set(ext, parser);
    }
  });

  await Promise.all(loads);
}

export async function initGrammars(languages: LanguageConfig[]): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await initRuntime();

    const allGrammars = languages.flatMap((lang) => lang.grammars);
    await loadGrammars(allGrammars);
  })();

  return initPromise;
}

export function getParser(filePath: string): Parser {
  const ext = path.extname(filePath);
  const parser = parsersByExtension.get(ext);
  if (!parser) {
    throw new Error(`No grammar loaded for extension: ${ext}`);
  }
  return parser;
}

export function parseFile(filePath: string, content: string): unknown {
  const parser = getParser(filePath);
  return parser.parse(content);
}
