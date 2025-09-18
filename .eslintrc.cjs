module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, es2022: true },
  rules: {
    'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
    'max-depth': ['error', 3],
    'complexity': ['error', { max: 12 }],
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '**/*.js'],
};
