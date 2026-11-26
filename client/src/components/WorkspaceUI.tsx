import type { ReactNode } from 'react';

const moneyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export function workspaceMoney(amount: number) {
  return moneyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

export const workspace = {
  page: 'mx-auto w-full max-w-6xl space-y-4 px-4 pb-24 pt-4 sm:space-y-5 sm:px-6 sm:pt-6',
  primary: 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50',
  secondary: 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50',
  panel: 'rounded-2xl border border-border bg-surface',
  input: 'min-h-11 min-w-0 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
};

export function WorkspaceHeading({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
    <div className="flex-1 min-w-[9rem]">
      <h1 className="font-heading text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">{title}</h1>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function WorkspaceMetrics({ values }: { values: { label: string; value: ReactNode; tone?: 'positive' | 'attention' }[] }) {
  return <dl className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(135px,1fr))] sm:gap-3">
    {values.map(metric => <div key={metric.label} className={`${workspace.panel} min-w-0 p-3 sm:p-4`}>
      <dt className="text-xs font-medium leading-snug text-muted-foreground">{metric.label}</dt>
      <dd className={`mt-1 break-words text-base font-bold leading-tight tabular-nums sm:text-xl ${metric.tone === 'positive' ? 'text-emerald-700 dark:text-emerald-400' : metric.tone === 'attention' ? 'text-amber-800 dark:text-amber-300' : 'text-foreground'}`}>{metric.value}</dd>
    </div>)}
  </dl>;
}

export function WorkspaceFilters<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (key: T) => void; options: readonly { id: T; label: string }[];
}) {
  return <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto py-1 no-scrollbar">
    {options.map(option => <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}
      className={`min-h-9 shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-primary/50 ${option.id === value ? 'border-primary/35 bg-primary/10 text-primary dark:text-blue-300' : 'border-border bg-surface text-muted-foreground hover:text-foreground'}`}>
      {option.label}
    </button>)}
  </div>;
}
