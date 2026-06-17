import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Suppress react-refresh warnings for shadcn/ui generated files and auth hook
  {
    files: [
      "src/components/ui/**/*.{ts,tsx}",
      "src/hooks/useAuth.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Forbid Math.random() in services — they should be deterministic or
  // load real data. The PRNG utility (src/utils/random.ts) exists for this.
  {
    files: ["src/services/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:
            "Math.random() is forbidden in services. Use src/utils/random.ts (seeded PRNG) or load real data. See AUDIT_AND_ROADMAP.md C3/C4.",
        },
      ],
    },
  },
);
