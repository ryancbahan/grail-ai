export interface Flags {
  path?: string;
  file?: string;
  symbol?: string;
  parent?: string;
  line?: number;
  depth?: number;
  language?: string;
  transitive: boolean;
  install?: boolean;
}

export interface Command {
  name: string;
  run: (flags: Flags) => Promise<void>;
}
