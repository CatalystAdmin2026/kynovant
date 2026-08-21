import HQSidebar from "./HQSidebar";
import HQMobileNav from "./HQMobileNav";
import HQTopBar from "./HQTopBar";
import { HQUnreadCountProvider } from "./HQUnreadCountProvider";

interface Props {
  children: React.ReactNode;
  coachName: string;
}

export default function HQShell({ children, coachName }: Props) {
  return (
    <div className="min-h-screen bg-[#080909] text-[#f0efeb]">
      <HQUnreadCountProvider>
        {/* Fixed sidebar — desktop */}
        <HQSidebar coachName={coachName} />

        {/* Fixed top bar — desktop (sits right of sidebar) */}
        <HQTopBar />

        {/* Mobile nav (fixed top bar + slide-out drawer) */}
        <HQMobileNav coachName={coachName} />

        {/* Content canvas */}
        <main className="lg:ml-64 min-h-screen">
          {/*
            Desktop: offset by top bar (h-12 = 48px) + generous top padding.
            Mobile:  offset by mobile nav bar (h-12 = 48px).
            px-6 sm:px-8 lg:px-10 keeps gutters consistent at all breakpoints.
          */}
          <div className="pt-[calc(3rem+env(safe-area-inset-top))] lg:pt-20 px-6 sm:px-8 lg:px-10 pb-16 max-w-[1280px] mx-auto">
            {children}
          </div>
        </main>
      </HQUnreadCountProvider>
    </div>
  );
}
