import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_`-prefixed bindings are intentional discards (e.g. dropping confirmPassword before submit).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  { ignores: ['.next/**', '.next-e2e/**', 'node_modules/**', 'next-env.d.ts'] },
];

export default config;
