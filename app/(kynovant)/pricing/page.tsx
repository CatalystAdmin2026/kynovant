import { redirect } from "next/navigation";

// Dedicated nav destination per the Kynovant public navigation
// requirement, but no separate Pricing page has been authored yet —
// /for-coaches already covers pricing (Founding Coach rate), features,
// and the application CTA in one page. Redirecting here rather than
// fabricating new marketing copy. Revisit once a standalone Pricing
// page is written.
export default function PricingPage() {
  redirect("/for-coaches");
}
