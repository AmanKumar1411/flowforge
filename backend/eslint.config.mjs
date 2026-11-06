import eslint from "@eslint/js";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierRecommended,
  {
    ignores: ["dist/**", "src/generated/**"],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Dependencies point inward: only presentation may import presentation.
    files: [
      "src/**/application/**/*.ts",
      "src/**/domain/**/*.ts",
      "src/**/infrastructure/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/presentation", "**/presentation/**"],
              message:
                "application, domain and infrastructure never import presentation: pass plain commands and views instead.",
            },
          ],
        },
      ],
    },
  },
);
