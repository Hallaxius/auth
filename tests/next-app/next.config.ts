import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // E2E: tenancy tests call the app via custom dev Hosts
  // (acme.localhost / suspended.localhost resolvem para 127.0.0.1).
  allowedDevOrigins: ["acme.localhost", "suspended.localhost"],
  // Prevents Turbopack from inferring the workspace root as the lib repo
  // (auth/) e resolva o src/middleware.ts errado.
  turbopack: {
    root: __dirname,
  },
  // The lib's ESM imports React at the top level (createContext), which doesn't
  // exist in the "react-server" build used by App Router. Externalizing causes
  // the package to be loaded via native require ("default" condition → react.production.js).
  serverExternalPackages: ["@hallaxius/auth"],
}

export default nextConfig
