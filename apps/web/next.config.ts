import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace package ships TypeScript sources; let Next compile them.
  transpilePackages: ['@facepay/shared'],
  poweredByHeader: false,
};

export default nextConfig;
