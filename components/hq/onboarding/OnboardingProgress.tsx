interface Step {
  id: string;
  label: string;
}

interface Props {
  steps: readonly Step[];
  currentIndex: number;
}

export default function OnboardingProgress({ steps, currentIndex }: Props) {
  return (
    <div className="flex items-center gap-0 mb-12" aria-label="Onboarding progress">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors duration-300 ${
                  done
                    ? "bg-[#C9A24D] text-black"
                    : active
                    ? "bg-[#C9A24D]/15 border border-[#C9A24D] text-[#C9A24D]"
                    : "bg-white/[0.04] border border-white/10 text-white/30"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`text-[9px] uppercase tracking-[0.15em] whitespace-nowrap ${
                  active ? "text-white/80 font-semibold" : done ? "text-white/40" : "text-white/25"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px flex-1 mx-2 mb-5 transition-colors duration-300 ${
                  done ? "bg-[#C9A24D]/50" : "bg-white/[0.08]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
