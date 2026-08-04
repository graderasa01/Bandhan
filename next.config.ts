import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
