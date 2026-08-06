interface Props {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function HQPageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex items-start justify-between gap-6 mb-10">
      <div>
        {/* Matches the established page-title treatment (see
            app/account/page.tsx) rather than the eyebrow-label style this
            used previously, which made every HQ page's title render
            smaller and fainter than its own subtitle. */}
        <h1 className="font-headline text-2xl uppercase tracking-[0.06em] text-white mb-2">
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
