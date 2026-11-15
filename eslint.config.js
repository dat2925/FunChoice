import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'dist-test/**', 'server/dist/**', 'server/.wrangler/**', 'src-tauri/**', 'playwright-report/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
]

