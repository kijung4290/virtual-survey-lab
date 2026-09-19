'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 왼쪽 메뉴를 "준비 → 실행 → 결과" 순서로 묶어 다음에 뭘 해야 할지 보이게 한다. */
const NAV_GROUPS: { label: string; items: { href: string; label: string; hint?: string }[] }[] = [
  {
    label: '시작',
    items: [
      { href: '/dashboard', label: '대시보드' },
      { href: '/projects', label: '프로젝트' },
    ],
  },
  {
    label: '1. 준비',
    items: [
      { href: '/clients', label: '가상 이용자 패널' },
      { href: '/surveys', label: '설문지' },
    ],
  },
  {
    label: '2. 실행',
    items: [
      { href: '/runs/new', label: '설문 실행하기' },
      { href: '/runs', label: '실행 기록' },
    ],
  },
  {
    label: '3. 결과',
    items: [
      { href: '/analysis', label: '결과 분석' },
      { href: '/validation', label: '실제 조사 비교' },
    ],
  },
  {
    label: '기타',
    items: [{ href: '/settings', label: '설정' }],
  },
];

export interface ProjectOption {
  id: string;
  name: string;
}

export function AppShell({
  children,
  projects,
  demoMode,
}: {
  children: ReactNode;
  projects: ProjectOption[];
  demoMode: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const projectId = params.get('project') ?? '';

  const withProject = (href: string) => (projectId ? `${href}?project=${projectId}` : href);

  const isActive = (href: string) => {
    if (href === '/runs/new') return pathname === '/runs/new';
    if (href === '/runs') return pathname === '/runs' || (pathname.startsWith('/runs/') && pathname !== '/runs/new');
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const onProjectChange = (value: string) => {
    const base = pathname === '/' ? '/dashboard' : pathname;
    router.push(value ? `${base}?project=${value}` : base);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <aside className="border-b border-slate-200 bg-white lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <Link href="/" className="block">
            <p className="text-base font-bold leading-tight text-slate-900">Synthetic Client</p>
            <p className="text-base font-bold leading-tight text-slate-900">Survey Lab</p>
          </Link>
          <p className="mt-1 text-xs text-slate-500">사전 욕구조사 시뮬레이션</p>
          {demoMode && (
            <p className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
              데모 모드 (API 키 없음)
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <label htmlFor="project-switcher" className="block text-xs font-medium text-slate-600">
            작업 중인 프로젝트
          </label>
          <select
            id="project-switcher"
            value={projectId}
            onChange={(e) => onProjectChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">(선택 안 함)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              아직 프로젝트가 없습니다. 첫 화면에서 데모를 만들어보세요.
            </p>
          )}
        </div>

        <nav aria-label="주요 메뉴" className="px-3 pb-8">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mt-4 first:mt-0">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={withProject(item.href)}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={cn(
                        'block rounded-lg px-3 py-2 text-sm',
                        isActive(item.href)
                          ? 'bg-blue-50 font-semibold text-blue-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
