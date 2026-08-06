interface Props {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function HQPageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 mb-8 sm:mb-10">
      <div className="min-w-0">
        <h1 className="font-headline text-2xl uppercase tracking-[0.06em] text-white mb-2">
          {title}
        </h1>

        {subtitle && (
          <p className="text-white/40 text-sm leading-relaxed max-w-xl">
            {subtitle}
          </p>
        )}
      </div>

      {action && <div className="shrink-0 sm:pt-1">{action}</div>}
    </div>
  );
}
