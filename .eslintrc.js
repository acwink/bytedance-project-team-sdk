module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'airbnb-base',
    'plugin:prettier/recommended', // 添加 prettier 插件
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'import/no-extraneous-dependencies': 'off',
    'no-unused-vars': 'off',
    'no-shadow': 'off',
    'import/no-unresolved': 'off',
    'class-methods-use-this': 'off',
    'new-cap': 'off',
    'no-restricted-syntax': 'off',
    'no-underscore-dangle': 'off',
    'prefer-destructuring': 'off',
    'no-param-reassign': 'off',
  },
};
