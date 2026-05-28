/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Public hostnames served through the cloudflared tunnel during dev (`next dev`).
  // Next 14+ warns on cross-origin /_next/* requests from any non-localhost host.
  experimental: {
    allowedDevOrigins: ["xn----8sbkccc5iwa.online"],
  },
};

export default nextConfig;
