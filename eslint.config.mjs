import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      'node_modules/**',
      'next-env.d.ts',
      'cloudflare-env.d.ts',
    ],
  },
  {
    files: ['app/page.tsx', 'app/signin/SignInForm.tsx'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: ['components/ui/Radio/index.tsx', 'components/ui/Tabs/index.tsx'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
];

export default eslintConfig;
