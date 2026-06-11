import { defineConfig } from "oxlint";

import base from "./base.ts";

export default defineConfig({
  extends: [base],
  plugins: ["typescript", "unicorn", "import", "oxc", "react", "jsx-a11y", "nextjs"],
  env: {
    browser: true,
  },
  settings: {
    react: {
      version: "19.2",
    },
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    // jsx-a11y is new vs the old ESLint setup; keep as warnings during migration.
    "jsx-a11y/label-has-associated-control": "warn",
    "jsx-a11y/control-has-associated-label": "warn",
    "jsx-a11y/no-redundant-roles": "warn",
    "jsx-a11y/no-static-element-interactions": "warn",
    "jsx-a11y/prefer-tag-over-role": "warn",
    "jsx-a11y/role-supports-aria-props": "warn",
    "react/no-unstable-nested-components": "warn",
    "nextjs/no-img-element": "warn",
    "nextjs/no-html-link-for-pages": "warn",
    "jsx-a11y/no-autofocus": "warn",
    "jsx-a11y/no-noninteractive-element-to-interactive-role": "warn",
    "jsx-a11y/media-has-caption": "warn",
    "jsx-a11y/iframe-has-title": "warn",
    "jsx-a11y/click-events-have-key-events": "warn",
    "react/iframe-missing-sandbox": "warn",
  },
});
