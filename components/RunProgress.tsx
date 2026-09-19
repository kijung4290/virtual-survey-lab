'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, LinkButton, Notice } from '@/components/ui';
import { ResponseStatusBadge, RunStatusBadge } from '@/components/RunStatusBadge';

interface Progress {
  id: string;
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  errorMessage: string | null;
  active: boolean;
  byStatus: Record<string, number>;
}

/** 실행 진행률 표시 + 실패분 재실행 */
export function RunProgress({ runId, projectId }: { runId: string; projectId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/progress`, { cache: 'no-store' });
      if (!res.ok) return;
      setProgress((await res.json()) as Progress);
    } catch {
      // 네트워크 오류는 다음 폴링에서 회복된다.
    }
  }, [runId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 1500);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (progress && !progress.active && progress.status !== 'RUNNING' && progress.status !== 'PENDING') {
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.status, progress?.active]);

  if (!progress) return <p className="text-sm text-slate-600">진행 상황을 불러오는 중…</p>;

  const done = progress.completedCount + progress.failedCount;
  const percent = progress.totalCount ? Math.round((done / progress.totalCount) * 100) : 0;
  const running = progress.active || progress.status === 'RUNNING' || progress.status === 'PENDING';
  const retryable =
    (progress.byStatus.FAILED ?? 0) +
    (progress.byStatus.INVALID_RESPONSE ?? 0) +
    (progress.byStatus.RATE_LIMITED ?? 0) +
    (progress.byStatus.PENDING ?? 0);

  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/resume`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '재실행에 실패했습니다.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '재실행에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <RunStatusBadge status={progress.status} />
        <p className="text-sm text-slate-700">
          완료 {progress.completedCount.toLocaleString()} / {progress.totalCount.toLocaleString()}명
          {progress.failedCount > 0 && ` · 실패 ${progress.failedCount.toLocaleString()}건`}
        </p>
        {running && <span className="text-sm text-blue-800">진행 중… 이 화면을 열어두면 자동으로 갱신됩니다.</span>}
      </div>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="설문 실행 진행률"
        className="h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-slate-600">{percent}% 진행</p>

      <div className="flex flex-wrap gap-2">
        {Object.entries(progress.byStatus).map(([status, count]) => (
          <span key={status} className="inline-flex items-center gap-1 text-sm text-slate-700">
            <ResponseStatusBadge status={status} />
            {count.toLocaleString()}건
          </span>
        ))}
      </div>

      {progress.errorMessage && <Notice tone="danger" title="실행 오류">{progress.errorMessage}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void resume()} disabled={busy || running || retryable === 0}>
          {busy ? '재실행 중…' : `실패·미완료 ${retryable}건 다시 실행`}
        </Button>
        <LinkButton href={`/analysis/${runId}?project=${projectId}`} variant="primary">
          결과 분석 보기
        </LinkButton>
        <LinkButton href={`/api/export?type=responses&id=${runId}`}>응답 CSV 내려받기</LinkButton>
      </div>
    </div>
  );
}
