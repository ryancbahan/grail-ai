export interface Flags {
  depth?: number;
  transitive: boolean;
  install?: boolean;
}

export interface Command {
  name: string;
  run: (args: string[], flags: Flags) => Promise<void>;
}
