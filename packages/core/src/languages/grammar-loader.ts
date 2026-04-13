import fs from "fs";
import path from "path";
import type { Parser, Language } from "web-tree-sitter";
import { GrammarMapping, LanguageDescriptor } from "./types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TreeSitter: {
  Parser: typeof Parser & { init: (opts?: Record<string, unknown>) => Promise<void> };
  Language: typeof Language;
} = require("web-tree-sitter");

let runtimeInitialized = false;
let runtimeInitPromise: Promise<void> | null = null;

const parsersByExtension = new Map<string, Parser>();
const loadedGrammarKeys = new Set<string>();

function loadWasm(grammarPackage: string, wasmFile: string): Uint8Array {
  const dir = path.dirname(require.resolve(`${grammarPackage}/package.json`));
  return fs.readFileSync(path.join(dir, wasmFile));
}

async function initRuntime(): Promise<void> {
  if (runtimeInitialized) return;
  if (runtimeInitPromise) return runtimeInitPromise;

  runtimeInitPromise = (async () => {
    await TreeSitter.Parser.init({
      locateFile: (scriptName: string) =>
        path.join(
          path.dirname(require.resolve("web-tree-sitter")),
          scriptName
        ),
    });
    runtimeInitialized = true;
  })();

  return runtimeInitPromise;
}

async function loadGrammar(mapping: GrammarMapping): Promise<void> {
  const key = `${mapping.grammarPackage}:${mapping.wasmFile}`;
  if (loadedGrammarKeys.has(key)) return;

  const wasm = loadWasm(mapping.grammarPackage, mapping.wasmFile);
  const lang = await TreeSitter.Language.load(wasm);
  const parser = new TreeSitter.Parser();
  parser.setLanguage(lang);

  for (const ext of mapping.extensions) {
    parsersByExtension.set(ext, parser);
  }

  loadedGrammarKeys.add(key);
}

export async function initGrammars(languages: LanguageDescriptor[]): Promise<void> {
  await initRuntime();

  const grammars = languages.flatMap((lang) => lang.grammars);
  await Promise.all(grammars.map(loadGrammar));
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
