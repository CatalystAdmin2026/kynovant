interface Props {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function HQPageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex items-start justify-between gap-6 mb-10">
      <div>
        <h1 className="text-[11px] text-[#C9A24D]/60 uppercase tracking-[0.5em] font-semibold mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-white/40 text-sm leading-relaxed max-w-xl">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  );
}
