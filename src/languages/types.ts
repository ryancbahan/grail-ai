import { TreeOptions } from "../tree";

export interface LanguageConfig {
  name: string;
  extensions: string[];
  markers: string[];
  treeOptions: TreeOptions;
}
