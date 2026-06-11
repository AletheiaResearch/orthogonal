import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "import", "oxc"],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "warn",
  },
  env: {
    node: true,
  },
  rules: {
    "typescript/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "typescript/no-explicit-any": "warn",
    "typescript/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "separate-type-imports" },
    ],
    "no-console": "off",
    // Type-aware rules enabled globally by options.typeAware; keep only what we opt into per preset.
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/no-unnecessary-type-assertion": "off",
    "typescript/unbound-method": "off",
    "typescript/no-base-to-string": "off",
    "typescript/no-unnecessary-type-parameters": "off",
    "typescript/no-unnecessary-type-conversion": "off",
    "typescript/consistent-return": "off",
    "typescript/restrict-template-expressions": "off",
    "typescript/no-misused-spread": "off",
    "typescript/no-redundant-type-constituents": "off",
    "typescript/no-unnecessary-boolean-literal-compare": "off",
    "typescript/no-floating-promises": "off",
    "typescript/await-thenable": "off",
    "typescript/no-misused-promises": "off",
    "eslint/no-underscore-dangle": "off",
    "eslint/no-shadow": "warn",
    "eslint/preserve-caught-error": "warn",
    "eslint/no-new": "warn",
    "eslint/no-unsafe-optional-chaining": "warn",
    "unicorn/no-array-sort": "warn",
    "unicorn/no-array-reverse": "warn",
    "unicorn/consistent-function-scoping": "warn",
    "unicorn/prefer-add-event-listener": "warn",
    "unicorn/no-useless-fallback-in-spread": "warn",
    "unicorn/no-invalid-fetch-options": "warn",
    "import/no-unassigned-import": "warn",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
      rules: {
        "typescript/no-explicit-any": "off",
        "typescript/no-misused-promises": "off",
        "typescript/no-useless-default-assignment": "off",
      },
    },
  ],
});
