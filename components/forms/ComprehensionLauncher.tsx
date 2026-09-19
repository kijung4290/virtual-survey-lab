'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Notice, Select } from '@/components/ui';
import { RECOMMENDED_RPM } from '@/lib/types';
import type { ProviderInfo } from '@/lib/ai';

/**
 * 문항 이해도 점검 실행.
 * 답을 고르게 하는 대신, 가상 이용자가 문항을 어떻게 읽었는지 묻는다(인지면접 방식).
 */
export function ComprehensionLauncher({
  projectId,
  surveyId,
  datasets,
  providers,
  defaultProvider,
}: {
  projectId: string;
  surveyId: string;
  datasets: { id: string; label: string }[];
  providers: ProviderInfo[];
  defaultProvider: string;
}) {
  const router = useRouter();
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? '');
  const [providerId, setProviderId] = useState(defaultProvider);
  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const [model, setModel] = useState(provider?.models[0] ?? 'mock-deterministic-v1');
  const [limit, setLimit] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (datasets.length === 0) {
    return (
      <Notice tone="warning" title="가상 이용자 패널이 필요합니다">
        문항을 읽어줄 가상 이용자가 있어야 이해도를 점검할 수 있습니다. 먼저 패널을 만들어주세요.
      </Notice>
    );
  }

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          surveyId,
          datasetId,
          mode: 'comprehension',
          provider: providerId,
          model,
          temperature: 0.3,
          repeat: 1,
          concurrency: 3,
          requestsPerMinute: RECOMMENDED_RPM[providerId] ?? 0,
          limit: Number(limit),
          label: '문항 이해도 점검',
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실행에 실패했습니다.');
      router.push(`/pretest/comprehension/${data.firstRunId}?project=${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '실행에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="가상 이용자 패널" htmlFor="comp-dataset" required>
          <Select id="comp-dataset" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="점검 인원" htmlFor="comp-limit" hint="8~15명이면 충분합니다">
          <Input
            id="comp-limit"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </Field>

        <Field label="AI Provider" htmlFor="comp-provider">
          <Select
            id="comp-provider"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              const p = providers.find((x) => x.id === e.target.value);
              setModel(p?.models[0] ?? '');
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.ready}>
                {p.label}
                {p.ready ? '' : ' (API Key 없음)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="모델" htmlFor="comp-model">
          <Select id="comp-model" value={model} onChange={(e) => setModel(e.target.value)}>
            {(provider?.models ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="text-sm text-slate-600">
        예상 API 호출: <strong>{limit}회</strong> (1명당 1회)
        {providerId === 'mock' && ' · Mock 모드는 비용이 발생하지 않습니다'}
      </p>

      <Button variant="primary" onClick={() => void start()} disabled={busy || !provider?.ready}>
        {busy ? '시작하는 중…' : '이해도 점검 실행'}
      </Button>
    </div>
  );
}
