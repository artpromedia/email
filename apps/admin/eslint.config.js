const baseConfig = require("../../packages/config/eslint.config.js");

module.exports = [
  ...baseConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Enforce strict rules for admin UI to prevent static buttons/links
      "custom/no-hash-href": "error",
      "custom/no-static-button": "error",
    },
  },
];
