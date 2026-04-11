/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: process.env.VERCEL_ENV === 'preview',
  },
  productionBrowserSourceMaps: false,
  compress: true,
  // External packages for server components
  serverExternalPackages: ['redis'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        dns: false,
        tls: false,
        fs: false,
        child_process: false,
        crypto: false,
        util: false,
        os: false,
        path: false,
        stream: false,
        assert: false,
        zlib: false,
        'dns/promises': false,
        'diagnostics_channel': false,
      }
      config.externals = config.externals || []
      config.externals.push({
        redis: 'commonjs redis',
        'ioredis': 'commonjs ioredis',
      })
    }
    return config
  }
}

export default nextConfig
