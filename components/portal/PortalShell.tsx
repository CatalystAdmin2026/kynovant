import PortalSidebar from "./PortalSidebar";
import PortalMobileHeader from "./PortalMobileHeader";
import MobilePortalNav from "./MobilePortalNav";
import PortalInstallOnboarding from "@/components/pwa/PortalInstallOnboarding";

interface Props {
  children: React.ReactNode;
  clientName: string;
}

export default function PortalShell({ children, clientName }: Props) {
  return (
    <div className="min-h-screen bg-[#080909] text-[#f0efeb]">
      {/* Atmospheric warm glow — very subtle, breaks flat darkness */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[45vh] z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(201,162,77,0.038) 0%, transparent 100%)",
        }}
        aria-hidden
      />

      <PortalSidebar clientName={clientName} />
      <PortalMobileHeader clientName={clientName} />

      <main className="lg:ml-56 min-h-screen flex flex-col relative z-10">
        <div className="flex-1 max-w-3xl w-full mx-auto px-5 md:px-8 pt-[calc(4rem+env(safe-area-inset-top))] lg:pt-10 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-14 flex flex-col gap-10">
          {children}
          <PortalInstallOnboarding />
        </div>
      </main>

      <MobilePortalNav />
    </div>
  );
}
