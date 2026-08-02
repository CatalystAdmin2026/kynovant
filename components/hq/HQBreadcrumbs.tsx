import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export default function HQBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 mb-8">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-white/15 text-[10px]">/</span>
            )}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="text-[10px] text-white/35 uppercase tracking-[0.25em] font-medium hover:text-white/60 transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={`text-[10px] uppercase tracking-[0.25em] font-medium ${
                  isLast ? "text-white/60" : "text-white/35"
                }`}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
