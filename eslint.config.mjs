import js from '@eslint/js'
import globals from 'globals'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Add project-specific rules here as needed
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', 'photos/'],
  },
  // Disable ESLint rules that would conflict with Prettier
  eslintConfigPrettier,
]
