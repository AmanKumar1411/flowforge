module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: { "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  transformIgnorePatterns: ["node_modules/(?!@nestjs/)"],
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts", "!src/generated/**"],
  coverageDirectory: "../coverage/backend",
  testEnvironment: "node",
};
