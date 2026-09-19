'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Notice, Select, Table, Td, Th } from '@/components/ui';
import { REVIEW_TYPES, type ReviewFinding, type ReviewResult } from '@/lib/survey/review';
import type { ProviderInfo } from '@/lib/ai';

interface StoredReview {
  id: string;
  source: 'rule' | 'ai';
  modelProvider: string | null;
  modelName: string | null;
  surveyVersion: number;
  createdAt: string;
  result: ReviewResult & { summary?: string };
}

const SEVERITY_LABEL = {
  high: { label: '꼭 확인', tone: 'danger' as const },
  medium: { label: '확인 권장', tone: 'warning' as const },
  low: { label: '참고', tone: 'neutral' as const },
};

function FindingTable({ findings }: { findings: ReviewFinding[] }) {
  if (findings.length === 0) {
    return <Notice tone="info">지적된 문제가 없습니다. 다만 이것이 &ldquo;타당한 설문지&rdquo;라는 보증은 아닙니다.</Notice>;
  }

  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <Table caption="문항 검토 결과">
      <thead>
        <tr>
          <Th>문항</Th>
          <Th>중요도</Th>
          <Th>유형</Th>
          <Th>무엇이 문제인가</Th>
          <Th>어떻게 고칠까</Th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((f, i) => (
          <tr key={`${f.questionId}-${f.type}-${i}`}>
            <Td className="whitespace-nowrap font-mono text-xs">{f.questionId ?? '설문 전체'}</Td>
            <Td>
              <Badge tone={SEVERITY_LABEL[f.severity].tone}>{SEVERITY_LABEL[f.severity].label}</Badge>
            </Td>
            <Td className="whitespace-nowrap text-xs text-slate-600">{REVIEW_TYPES[f.type] ?? f.type}</Td>
            <Td className="text-sm">{f.message}</Td>
            <Td className="text-sm text-slate-700">{f.suggestion}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function ReviewRunner({
  projectId,
  surveyId,
  targetPopulation,
  providers,
  defaultProvider,
  initialReviews,
}: {
  projectId: string;
  surveyId: string;
  targetPopulation?: string | null;
  providers: ProviderInfo[];
  defaultProvider: string;
  initialReviews: StoredReview[];
}) {
  const router = useRouter();
  const [reviews, setReviews] = useState<StoredReview[]>(initialReviews);
  const [providerId, setProviderId] = useState(defaultProvider === 'mock' ? 'gemini' : defaultProvider);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const provider = providers.find((p) => p.id === providerId);
  const rule = reviews.find((r) => r.source === 'rule');
  const ai = reviews.find((r) => r.source === 'ai');

  const run = async (source: 'rule' | 'ai') => {
    setBusy(source);
    setError(null);
    try {
      const res = await fetch(`/api/surveys/${surveyId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          source,
          provider: providerId,
          model: provider?.models[0],
          targetPopulation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '검토에 실패했습니다.');

      const listRes = await fetch(`/api/surveys/${surveyId}/review`);
      const listData = await listRes.json();
      setReviews(listData.reviews ?? []);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '검토에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex flex-wrap items-end gap-2">
        <Button variant="primary" onClick={() => void run('rule')} disabled={busy !== null}>
          {busy === 'rule' ? '검토 중…' : '규칙 기반 검토 실행 (무료)'}
        </Button>

        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="review-provider" className="block text-xs text-slate-600">
              AI 검토에 쓸 모델
            </label>
            <Select
              id="review-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-48"
            >
              {providers
                .filter((p) => p.id !== 'mock')
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.ready}>
                    {p.label}
                    {p.ready ? '' : ' (API Key 없음)'}
                  </option>
                ))}
            </Select>
          </div>
          <Button onClick={() => void run('ai')} disabled={busy !== null || !provider?.ready}>
            {busy === 'ai' ? '검토 중…' : 'AI 보강 검토 (호출 1회)'}
          </Button>
        </div>
      </div>

      {!provider?.ready && (
        <Notice tone="info">
          API Key 가 없어도 <strong>규칙 기반 검토</strong>는 그대로 쓸 수 있습니다. 이중 질문, 유도 표현, 어려운 용어,
          보기 중복·누락, 척도 라벨 불균형을 찾아줍니다.
        </Notice>
      )}

      {rule && (
        <section>
          <h3 className="text-sm font-semibold text-slate-800">
            규칙 기반 검토{' '}
            <span className="font-normal text-slate-500">
              (설문 v{rule.surveyVersion} · 꼭 확인 {rule.result.counts.high} / 확인 권장 {rule.result.counts.medium} /
              참고 {rule.result.counts.low})
            </span>
          </h3>
          <div className="mt-2">
            <FindingTable findings={rule.result.findings} />
          </div>
        </section>
      )}

      {ai && (
        <section>
          <h3 className="text-sm font-semibold text-slate-800">
            AI 보강 검토{' '}
            <span className="font-normal text-slate-500">
              ({ai.modelProvider}/{ai.modelName} · 설문 v{ai.surveyVersion})
            </span>
          </h3>
          {ai.result.summary && (
            <p className="mt-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {ai.result.summary}
            </p>
          )}
          <div className="mt-2">
            <FindingTable findings={ai.result.findings} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            AI 검토 결과도 사람이 판단해야 할 제안입니다. 기관 상황과 조사 목적에 맞는지 직접 확인하세요.
          </p>
        </section>
      )}
    </div>
  );
}
