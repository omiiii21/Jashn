import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Jashn · Plan the whole wedding by saying it out loud",
  description:
    "Plan an Indian wedding by voice, in English, Hindi or Hinglish: events, guests, vendors and money in one family account book.",
};

/** The public landing page. The app entry redirect lives at `/app` (routes.home()). */
export default function Home() {
  return <LandingPage />;
}
