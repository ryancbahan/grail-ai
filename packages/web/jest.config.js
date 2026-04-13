const base = require("../../jest.config.base");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
};
