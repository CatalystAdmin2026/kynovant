import { requireClientUser, getClientProfile } from "@/lib/supabase/session";
import { getDashboardData, getCoachData } from "@/lib/db/portal-dashboard-service";
import PortalDashboard from "@/components/portal/PortalDashboard";

export const dynamic = "force-dynamic";

export default async function PortalPage(props: {
  searchParams: Promise<{ previewState?: string }>;
}) {
  const searchParams = await props.searchParams;
  const devPreviewState =
    process.env.NODE_ENV === "development"
      ? (searchParams.previewState ?? undefined)
      : undefined;

  const { dbUser } = await requireClientUser();
  const [profile, dashboardData, coachData] = await Promise.all([
    getClientProfile(dbUser.id),
    getDashboardData(dbUser.id),
    getCoachData(dbUser.id),
  ]);

  const clientName = profile?.preferredName ?? profile?.fullName ?? "Client";

  return (
    <PortalDashboard
      clientName={clientName}
      clientId={dbUser.id}
      dashboardData={dashboardData}
      coachData={coachData}
      devPreviewState={devPreviewState}
    />
  );
}
