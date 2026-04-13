const base = require("../../jest.config.base");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testTimeout: 30000,
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
};
