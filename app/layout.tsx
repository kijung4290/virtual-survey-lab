import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { isDemoMode } from '@/lib/ai';
import { prisma } from '@/lib/db';
import './globals.css';

export const metadata: Metadata = {
  title: 'Synthetic Client Survey Lab',
  description:
    '공개·합성 데이터로 만든 가상 이용자 패널에게 먼저 설문을 실행해보는 사회복지 프로그램 사전 욕구조사 시뮬레이션 도구',
};

async function loadProjects() {
  try {
    return await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true },
    });
  } catch {
    // DB 초기화 전에도 화면은 떠야 한다.
    return [];
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const projects = await loadProjects();

  return (
    <html lang="ko">
      <body>
        <Suspense fallback={<div className="p-8 text-sm text-slate-600">불러오는 중…</div>}>
          <AppShell projects={projects} demoMode={isDemoMode()}>
            {children}
          </AppShell>
        </Suspense>
      </body>
    </html>
  );
}
