import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist (used by @langchain/community's PDFLoader) loads its worker
  // file from disk at runtime; bundling it breaks that lookup ("Setting up
  // fake worker failed: Cannot find module pdf.worker.mjs"). Keeping it
  // external lets Node resolve it normally from node_modules.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
