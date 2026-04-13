import fs from "fs";
import path from "path";
import { LanguageDescriptor, Language } from "./types";
import { initGrammars } from "./grammar-loader";

const descriptors: LanguageDescriptor[] = [];
const loadedLanguages = new Map<string, Language>();

export function registerLanguage(descriptor: LanguageDescriptor): void {
  if (!descriptors.some((d) => d.name === descriptor.name)) {
    descriptors.push(descriptor);
  }
}

export function detectLanguage(dirPath: string): LanguageDescriptor | undefined {
  const entries = new Set(fs.readdirSync(dirPath));

  for (const desc of descriptors) {
    if (desc.markers.some((m) => entries.has(m))) {
      return desc;
    }
  }

  const counts = new Map<LanguageDescriptor, number>();
  for (const entry of entries) {
    const ext = path.extname(entry);
    for (const desc of descriptors) {
      if (desc.extensions.includes(ext)) {
        counts.set(desc, (counts.get(desc) ?? 0) + 1);
      }
    }
  }

  let best: LanguageDescriptor | undefined;
  let max = 0;
  for (const [desc, count] of counts) {
    if (count > max) {
      max = count;
      best = desc;
    }
  }
  return best;
}

export async function loadLanguage(descriptor: LanguageDescriptor): Promise<Language> {
  const cached = loadedLanguages.get(descriptor.name);
  if (cached) return cached;

  await initGrammars([descriptor]);
  const implementation = await descriptor.load();

  const language: Language = { descriptor, implementation };
  loadedLanguages.set(descriptor.name, language);
  return language;
}

export { LanguageDescriptor, Language } from "./types";
