'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Notice } from '@/components/ui';

/**
 * 데모 데이터 한 번에 만들기.
 * API 키가 없어도 Mock(더미) 응답으로 전체 흐름과 결과 화면을 바로 볼 수 있게 한다.
 */
export function DemoLauncher({
  exists,
  projectId,
  variant = 'primary',
  label,
}: {
  exists: boolean;
  projectId?: string | null;
  variant?: 'primary' | 'secondary';
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (replace: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replace }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '데모 데이터를 만들지 못했습니다.');
      router.push(`/dashboard?project=${data.projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '데모 데이터를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (exists && projectId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={variant} onClick={() => router.push(`/dashboard?project=${projectId}`)}>
          데모 결과 보기
        </Button>
        <Button onClick={() => void create(true)} disabled={busy}>
          {busy ? '다시 만드는 중…' : '데모 다시 만들기'}
        </Button>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button variant={variant} onClick={() => void create(false)} disabled={busy}>
        {busy ? '만드는 중… (10초쯤 걸립니다)' : (label ?? '데모 데이터 만들고 결과 보기')}
      </Button>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
