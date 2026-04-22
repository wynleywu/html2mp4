import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['electron/**/*.cjs', 'engine/**/*.cjs', 'scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // engine files embed browser callbacks via page.evaluate — browser globals needed
        ...globals.browser,
      },
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'dist_app/**', 'release/**', 'release_old/**'],
  },
]
