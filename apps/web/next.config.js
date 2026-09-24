/* eslint-disable no-undef */
// Env vars (NEXT_PUBLIC_WS_URL, NEXT_PUBLIC_API_URL) are auto-loaded by Next.js
// from this app's own .env file (./.env) — no code defaults.

/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) {
            throw new Error(
                "NEXT_PUBLIC_API_URL is not set",
            );
        }
        return [
            {
                source: "/api/:path*",
                destination: `${apiUrl}/api/:path*`,
            },
        ];
    },
};

export default nextConfig;