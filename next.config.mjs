/** @type {import('next').NextConfig} */
// CTS v3.2 - Redis-only, Turbopack compatible
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  productionBrowserSourceMaps: false,
  compress: true,
}

export default nextConfig
