const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const typescript = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const path = require('path');

// Load custom rules
const noHashHref = require('./eslint-rules/no-hash-href');
const noStaticButton = require('./eslint-rules/no-static-button');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  js.configs.recommended,
  ...compat.extends('@typescript-eslint/recommended'),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      custom: {
        'no-hash-href': noHashHref,
        'no-static-button': noStaticButton,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      // Custom rules to prevent static buttons and anchors
      'custom/no-hash-href': 'error',
      'custom/no-static-button': 'error',
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'build/', '.turbo/'],
  },
];
