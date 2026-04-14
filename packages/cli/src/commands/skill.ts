import fs from "fs";
import path from "path";
import type { Command } from "../types";
import { fail, output } from "../utils/util";

export const skill: Command = {
  name: "skill",
  run: async (flags) => {
    const skillSource = path.resolve(__dirname, "../../../skill/SKILL.md");
    let skillContent: string;
    try {
      skillContent = fs.readFileSync(skillSource, "utf-8");
    } catch {
      const altPath = path.resolve(__dirname, "../../../../skill/SKILL.md");
      try {
        skillContent = fs.readFileSync(altPath, "utf-8");
      } catch {
        fail("Could not find SKILL.md", "Ensure the grail-ai package is installed correctly");
      }
    }

    if (!flags.install) {
      console.log(skillContent);
      return;
    }

    const targetDir = flags.path
      ? path.resolve(path.dirname(flags.path))
      : path.resolve(process.cwd(), ".claude", "skills", "grail");
    const targetFile = flags.path
      ? path.resolve(flags.path)
      : path.join(targetDir, "SKILL.md");

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, skillContent);
    output({ installed: targetFile });
  },
};
