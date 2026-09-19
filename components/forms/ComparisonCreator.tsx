'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Notice, Select } from '@/components/ui';

export function ComparisonCreator({
  projectId,
  runs,
  actualDatasets,
}: {
  projectId: string;
  runs: { id: string; label: string }[];
  actualDatasets: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [runId, setRunId] = useState(runs[0]?.id ?? '');
  const [actualDatasetId, setActualDatasetId] = useState(actualDatasets[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (runs.length === 0 || actualDatasets.length === 0) {
    return (
      <Notice tone="warning" title="비교하려면 두 가지가 필요합니다">
        완료된 Synthetic 실행 1개와 업로드된 실제 조사 결과 1개가 있어야 비교 리포트를 만들 수 있습니다.
      </Notice>
    );
  }

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, runId, actualDatasetId, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '비교 리포트를 만들 수 없습니다.');
      router.push(`/validation/${data.id}?project=${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '비교 리포트를 만들 수 없습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Synthetic 실행" htmlFor="cmp-run" required>
          <Select id="cmp-run" value={runId} onChange={(e) => setRunId(e.target.value)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="실제 조사 결과" htmlFor="cmp-actual" required>
          <Select id="cmp-actual" value={actualDatasetId} onChange={(e) => setActualDatasetId(e.target.value)}>
            {actualDatasets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="리포트 제목" htmlFor="cmp-title" hint="비워두면 자동으로 생성됩니다.">
        <Input id="cmp-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Button variant="primary" onClick={() => void create()} disabled={busy}>
        {busy ? '계산 중…' : '비교 리포트 만들기'}
      </Button>
    </div>
  );
}
