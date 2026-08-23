import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode floating "N" indicator sits bottom-left on every page and
  // was getting mistaken for a stray cursor — doubly so next to Grio's own
  // bottom-right bubble. Dev-only either way; production never shows it.
  devIndicators: false,
  // Docker/App Runner: traces the minimal dependency set into
  // `.next/standalone` (its own tiny `server.js` + only the node_modules
  // actually imported) instead of shipping the full node_modules tree. Purely
  // a build-output shape — Railway's Nixpacks build never reads this key, so
  // it doesn't touch that deployment.
  output: "standalone",
  async redirects() {
    return [
      {
        // Profile building moved out of the dashboard shell into its own
        // onboarding route group. Old links, bookmarks and the nav item that
        // still points here must land somewhere real.
        source: "/user/profile-setup",
        destination: "/profile/build",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
