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
    ignores: ['dist/**', 'node_modules/**'],
  },
]
