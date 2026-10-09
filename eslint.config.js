import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import stylistic from '@stylistic/eslint-plugin'

export default [
  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      // Single quotes for every string literal. Double quotes stay legal only where they avoid
      // escaping an apostrophe; HTML attribute quoting is a separate rule and is not touched.
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'never' }],
    },
  },
  {
    /*
     * Built output and anything a test RUN leaves behind. The last two are not housekeeping:
     * Playwright writes `playwright-report/` only when a run fails, and it contains its own
     * bundled viewer — measured 2026-10-08, one failing browser run turned `lint:check` into
     * 17,416 errors from vendored JavaScript nobody here wrote. A hygiene check that drowns the
     * moment a test fails is a hygiene check that stops being run.
     */
    ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
]
