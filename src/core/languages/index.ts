import fs from "fs";
import path from "path";
import { LanguageConfig } from "./types";
import { javascript } from "./javascript";

const languages: LanguageConfig[] = [javascript];

export async function initLanguages(): Promise<void> {
  await Promise.all(
    languages.filter((lang) => lang.init).map((lang) => lang.init!())
  );
}

export function detectLanguage(dirPath: string): LanguageConfig | undefined {
  const entries = new Set(fs.readdirSync(dirPath));

  // check for marker files
  for (const lang of languages) {
    if (lang.markers.some((m) => entries.has(m))) {
      return lang;
    }
  }

  // fall back to file extension frequency
  const counts = new Map<LanguageConfig, number>();
  for (const entry of entries) {
    const ext = path.extname(entry);
    for (const lang of languages) {
      if (lang.extensions.includes(ext)) {
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }
  }

  let best: LanguageConfig | undefined;
  let max = 0;
  for (const [lang, count] of counts) {
    if (count > max) {
      max = count;
      best = lang;
    }
  }
  return best;
}

export { LanguageConfig } from "./types";
export { javascript } from "./javascript";
