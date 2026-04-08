/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  productionBrowserSourceMaps: false,
  compress: true,
  // Disable static optimization for pages that need runtime data
  experimental: {
    serverComponentsExternalPackages: ['redis'],
  },
  // Ensure API routes can run in serverless environment
  serverRuntimeConfig: {
    // Will be available in server-side code
  },
  publicRuntimeConfig: {
    // Will be available in client-side code
    NODE_ENV: process.env.NODE_ENV,
  },
}

export default nextConfig
