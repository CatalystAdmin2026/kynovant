import { requireCoachOrAdminPage } from "@/lib/auth/guards";
import HQShell from "@/components/hq/HQShell";

export default async function HQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dbUser } = await requireCoachOrAdminPage();

  return <HQShell coachName={dbUser.email}>{children}</HQShell>;
}