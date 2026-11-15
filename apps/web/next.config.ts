import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace package ships TypeScript sources; let Next compile them.
  transpilePackages: ['@facepay/shared', '@facepay/face-engine'],
  // Human's Node build pulls @tensorflow/tfjs-node, which has no place in a
  // browser app and breaks the SSR bundle. The engine is client-only anyway.
  serverExternalPackages: ['@vladmandic/human'],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tensorflow/tfjs-node': false,
    };
    return config;
  },
  poweredByHeader: false,
  // Netlify exposes the commit being built; show it in Ajustes so a stale bundle
  // is obvious instead of guessing.
  env: { NEXT_PUBLIC_COMMIT_REF: process.env.COMMIT_REF ?? 'dev' },
  // /onboarding/[token] hashes the legal markdown at request time to build the
  // consent evidence, so those files must ship with the server bundle.
  outputFileTracingIncludes: {
    '/onboarding/[token]': ['./content/legal/*.md'],
  },
};

export default nextConfig;
