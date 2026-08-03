import { redirect } from "next/navigation";

// Dedicated nav destination per the Kynovant public navigation
// requirement, but no separate Features page has been authored yet —
// /for-coaches already covers features, pricing, and the application
// CTA in one page. Redirecting here rather than fabricating new
// marketing copy. Revisit once a standalone Features page is written.
export default function FeaturesPage() {
  redirect("/for-coaches");
}
