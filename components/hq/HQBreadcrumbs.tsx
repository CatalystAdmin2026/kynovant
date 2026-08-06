import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export default function HQBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-6 sm:mb-8 flex flex-wrap items-center gap-x-1.5 gap-y-2 overflow-hidden"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;

        return (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && (
              <span
                className="shrink-0 text-white/15 text-[10px]"
                aria-hidden="true"
              >
                /
              </span>
            )}

            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="truncate text-[10px] text-white/35 uppercase tracking-[0.25em] font-medium hover:text-white/60 transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                className={`truncate text-[10px] uppercase tracking-[0.25em] font-medium ${
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
