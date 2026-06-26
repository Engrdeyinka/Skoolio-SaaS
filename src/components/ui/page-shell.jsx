import React from "react";

const MAX_WIDTHS = {
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
};

export function PageShell({ children, maxWidth = "7xl", className = "" }) {
  const maxWidthClass = MAX_WIDTHS[maxWidth] || MAX_WIDTHS["7xl"];
  return (
    <div className={`px-3 py-4 sm:p-4 md:p-6 lg:p-8 ${className}`.trim()}>
      <div className={`mx-auto w-full ${maxWidthClass}`.trim()}>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className = "",
}) {
  return (
    <div className={`flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ${className}`.trim()}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-[1.75rem] font-bold tracking-tight text-slate-950 sm:text-2xl lg:text-3xl">
          {title}
        </h1>
        {meta ? <p className="mt-2 text-sm text-slate-500">{meta}</p> : null}
        {description ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-start">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function PageSection({ children, className = "" }) {
  return <div className={`space-y-6 ${className}`.trim()}>{children}</div>;
}

export function PageLoadingState({ label = "Loading..." }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}
