import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * 최소한의 UI 프리미티브.
 * shadcn/ui 스타일(유틸리티 클래스 기반)을 따르되 외부 의존성 없이 구성했다.
 */

export function Card({
  children,
  className,
  title,
  description,
  action,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
          {action && <div className="flex flex-wrap gap-2">{action}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

const buttonVariants = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 border-blue-700',
  secondary: 'bg-white text-slate-800 hover:bg-slate-50 border-slate-300',
  danger: 'bg-white text-red-700 hover:bg-red-50 border-red-300',
} as const;

export function Button({
  children,
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: {
  children: ReactNode;
  variant?: keyof typeof buttonVariants;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = 'secondary',
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonVariants;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition',
        buttonVariants[variant],
        className
      )}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  required,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, 'min-h-24', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, props.className)} />;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    danger: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn('border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700', className)}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('border-b border-slate-100 px-3 py-2 align-top text-slate-800', className)}>{children}</td>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-base font-medium text-slate-800">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-red-300 bg-red-50 text-red-900',
  } as const;
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone])} role={tone === 'info' ? undefined : 'alert'}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
