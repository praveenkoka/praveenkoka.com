/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
        port: "",
      },
    ],
  },
}

export default nextConfig
