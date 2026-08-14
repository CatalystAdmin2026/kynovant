import { redirect } from "next/navigation";

// No separate Features page is authored — the homepage
// (app/(kynovant)/home/page.tsx) covers the product surface in depth
// with the "Platform" and "AI Programming" sections. Redirecting to
// that section rather than fabricating a duplicate marketing page.
export default function FeaturesPage() {
  redirect("/#platform");
}
