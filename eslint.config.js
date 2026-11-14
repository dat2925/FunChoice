import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'dist-test/**', 'src-tauri/**', 'playwright-report/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
]

