/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: process.env.VERCEL_ENV === 'production',
  },
  eslint: {
    ignoreDuringBuilds: process.env.VERCEL_ENV === 'production',
  },
  images: {
    unoptimized: process.env.VERCEL_ENV === 'preview',
  },
  productionBrowserSourceMaps: false,
  compress: true,
  // External packages for server components
  serverExternalPackages: ['redis'],
}

export default nextConfig
