// Renders inside app/hq/layout.tsx's <HQShell> — the sidebar/top bar stay
// mounted and already apply the lg:ml-64 content offset, so this only
// needs to fill the content area itself. Covers in-HQ navigation (the
// common case); the very first load still waits on layout.tsx's own
// auth + dashboard-nav queries before this can render at all.
export default function HQLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-5 h-5 border border-[#c9a24d]/30 border-t-[#c9a24d] rounded-full animate-spin" />
        <p className="text-[10px] text-white/25 uppercase tracking-[0.3em]">Loading</p>
      </div>
    </div>
  );
}
