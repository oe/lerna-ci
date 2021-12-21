module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/indent': ['error', 2],
    '@typescript-eslint/semi': ['error', 'never'],
    quotes: ['error', 'single'],
    '@typescript-eslint/member-delimiter-style': [
      'error',
      {
        multiline: {
          delimiter: 'none',
          requireLast: false
        }
      }
    ],
    "@typescript-eslint/interface-name-prefix": ["error", "always"],
    '@typescript-eslint/explicit-function-return-type': ['off']
  },
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module'
  }
}
