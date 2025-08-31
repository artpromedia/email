// Simple test config for custom rules
const noHashHref = require("../../packages/config/eslint-rules/no-hash-href");
const noStaticButton = require("../../packages/config/eslint-rules/no-static-button");

module.exports = [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
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
      "custom/no-hash-href": "error",
      "custom/no-static-button": "error",
    },
  },
];
