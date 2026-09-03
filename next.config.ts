import type { NextConfig } from "next";

const chromiumFiles=["./node_modules/@sparticuz/chromium/bin/**/*"];

const nextConfig: NextConfig = {
  serverExternalPackages:["@sparticuz/chromium","puppeteer-core"],
  outputFileTracingIncludes:{
    "/api/admin/books":chromiumFiles,
    "/api/admin/user-books":chromiumFiles,
    "/api/user-books":chromiumFiles,
    "/api/chromium-health":chromiumFiles
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "books.google.com" },
      { protocol: "https", hostname: "books.googleusercontent.com" },
      { protocol: "https", hostname: "covers.openlibrary.org" }
    ]
  }
};

export default nextConfig;
