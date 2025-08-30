// Load custom rules
const noHashHref = require("../../packages/config/eslint-rules/no-hash-href");
const noStaticButton = require("../../packages/config/eslint-rules/no-static-button");

module.exports = [
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/routes/users/tabs/SecurityTab.tsx"], // Exclude problematic file
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      custom: {
        rules: {
          "no-hash-href": noHashHref,
          "no-static-button": noStaticButton,
        },
      },
    },
    rules: {
      // Only enforce our custom rules to prevent static buttons/links
      "custom/no-hash-href": "error",
      "custom/no-static-button": "error",
    },
  },
];
