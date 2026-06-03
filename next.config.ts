import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Expose the package version to client code at build time. Used by the
  // sidebar footer to show users which version they're running — important
  // for offline-first apps where updates are delivered as full installers
  // rather than via auto-update, so the user (and support) can quickly
  // identify "what's installed."
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // Keep Prisma out of Turbopack's bundling — without this, server chunks try
  // to require '@prisma/client-<hash>' at runtime and crash, because the real
  // package on disk is '@prisma/client'.
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'prisma'],
  // Keep the standalone bundle clean: don't drag user data, source files,
  // docs, tests, or our Electron tooling into the shipped server.
  outputFileTracingExcludes: {
    '*': [
      '**/*.db',
      '**/*.db-journal',
      'uploads/**',
      'backups/**',
      'bookkeeping_seed/**',
      '__tests__/**',
      'scripts/**',
      'electron/**',
      'electron-dist/**',
      'dist-electron/**',
      '*.md',
      '*.csv',
      '*.pdf',
      'package-lock.json',
      'tsconfig.tsbuildinfo',
      // Never ship .env files — secrets leak and the server's runtime DATABASE_URL
      // gets overridden by stale paths that point inside the install dir.
      '.env',
      '.env.*',
      '**/.env',
      '**/.env.*',
    ],
  },
};

export default nextConfig;
