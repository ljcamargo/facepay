import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace package ships TypeScript sources; let Next compile them.
  transpilePackages: ['@facepay/shared'],
  poweredByHeader: false,
  // /onboarding/[token] hashes the legal markdown at request time to build the
  // consent evidence, so those files must ship with the server bundle.
  outputFileTracingIncludes: {
    '/onboarding/[token]': ['./content/legal/*.md'],
  },
};

export default nextConfig;
