'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Notice, Select } from '@/components/ui';
import type { Bucket, ConditionalRule, FieldDistribution } from '@/lib/clients/generate';

/**
 * 조건 기반 Synthetic Client 생성 화면.
 * 복지 특성을 임의로 만들지 않고, 사용자가 입력한 분포/교차표만 사용한다.
 */

const FIELD_OPTIONS = [
  { key: 'age', label: '연령(구간)' },
  { key: 'sex', label: '성별' },
  { key: 'householdType', label: '가구형태' },
  { key: 'housingType', label: '주거형태' },
  { key: 'economicStatus', label: '경제수준' },
  { key: 'healthStatus', label: '건강상태' },
  { key: 'mobilityDifficulty', label: '이동 불편' },
  { key: 'digitalLiteracy', label: '디지털 활용' },
  { key: 'socialContactLevel', label: '사회적 접촉' },
  { key: 'careNeed', label: '돌봄 필요' },
  { key: 'educationLevel', label: '학력' },
  { key: 'employmentStatus', label: '경제활동' },
  { key: 'province', label: '시도' },
  { key: 'district', label: '시군구' },
];

const DEFAULT_DISTRIBUTIONS: FieldDistribution[] = [
  {
    field: 'age',
    buckets: [
      { value: '65-74', percent: 45 },
      { value: '75-84', percent: 40 },
      { value: '85+', percent: 15 },
    ],
  },
  {
    field: 'sex',
    buckets: [
      { value: 'F', percent: 62 },
      { value: 'M', percent: 38 },
    ],
  },
  {
    field: 'householdType',
    buckets: [
      { value: '독거', percent: 38 },
      { value: '부부', percent: 42 },
      { value: '자녀동거', percent: 20 },
    ],
  },
  {
    field: 'economicStatus',
    buckets: [
      { value: '낮음', percent: 40 },
      { value: '보통', percent: 45 },
      { value: '높음', percent: 15 },
    ],
  },
  {
    field: 'healthStatus',
    buckets: [
      { value: '나쁨', percent: 30 },
      { value: '보통', percent: 45 },
      { value: '좋음', percent: 25 },
    ],
  },
  {
    field: 'mobilityDifficulty',
    buckets: [
      { value: '낮음', percent: 45 },
      { value: '중간', percent: 35 },
      { value: '높음', percent: 20 },
    ],
  },
  {
    field: 'digitalLiteracy',
    buckets: [
      { value: '낮음', percent: 45 },
      { value: '보통', percent: 35 },
      { value: '높음', percent: 20 },
    ],
  },
  {
    field: 'socialContactLevel',
    buckets: [
      { value: '낮음', percent: 35 },
      { value: '보통', percent: 40 },
      { value: '높음', percent: 25 },
    ],
  },
];

const DEFAULT_RULES: ConditionalRule[] = [
  {
    when: [
      { field: 'age', operator: 'gte', value: 80 },
      { field: 'householdType', operator: 'eq', value: '독거' },
    ],
    field: 'mobilityDifficulty',
    buckets: [
      { value: '낮음', percent: 20 },
      { value: '중간', percent: 35 },
      { value: '높음', percent: 45 },
    ],
  },
];

function sum(buckets: Bucket[]) {
  return buckets.reduce((a, b) => a + (Number(b.percent) || 0), 0);
}

export function ClientGenerator({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [name, setName] = useState('WelfarePersona-v1');
  const [total, setTotal] = useState(200);
  const [seed, setSeed] = useState(20270101);
  const [distributions, setDistributions] = useState<FieldDistribution[]>(DEFAULT_DISTRIBUTIONS);
  const [rules, setRules] = useState<ConditionalRule[]>(DEFAULT_RULES);
  const [distSource, setDistSource] = useState('');
  const [preview, setPreview] = useState<{ warnings: string[]; sample: { localId: string; personaSummary: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateBucket = (di: number, bi: number, patch: Partial<Bucket>) => {
    setDistributions((prev) =>
      prev.map((d, i) =>
        i === di ? { ...d, buckets: d.buckets.map((b, j) => (j === bi ? { ...b, ...patch } : b)) } : d
      )
    );
  };

  const call = async (mode: 'preview' | 'save') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/clients/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name,
          total: Number(total),
          seed: Number(seed),
          distributions: distributions.map((d) => ({
            field: d.field,
            buckets: d.buckets
              .filter((b) => b.value.trim() !== '')
              .map((b) => ({ value: b.value.trim(), percent: Number(b.percent) || 0 })),
          })),
          conditionalRules: rules,
          preview: mode === 'preview',
          sourceMeta: {
            welfare_distribution_source: distSource || undefined,
            notes: '사용자 입력 분포 기반 생성. 개인 식별정보 없음.',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '요청에 실패했습니다.');

      if (mode === 'preview') {
        setPreview({ warnings: data.warnings ?? [], sample: data.sample ?? [] });
      } else {
        router.push(`/clients/${data.dataset.id}?project=${projectId}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <Notice tone="danger">{error}</Notice>}

      <Notice tone="info" title="생성 원칙">
        복지 관련 속성은 임의 확률로 만들지 않습니다. 아래 분포와 교차표(조건부 규칙)에 입력한 값만 사용하며, 같은
        seed 와 같은 입력이면 항상 같은 패널이 생성됩니다.
      </Notice>

      <Card title="기본 설정">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="데이터셋 이름" htmlFor="gen-name" required>
            <Input id="gen-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="생성 인원" htmlFor="gen-total" required hint="1~5,000명">
            <Input
              id="gen-total"
              type="number"
              min={1}
              max={5000}
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
            />
          </Field>
          <Field label="난수 seed" htmlFor="gen-seed" hint="같은 seed = 같은 결과(재현성)">
            <Input id="gen-seed" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </Field>
          <Field label="분포 출처" htmlFor="gen-src" hint="예: 2023 노인실태조사 교차표">
            <Input id="gen-src" value={distSource} onChange={(e) => setDistSource(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title="속성 분포"
        description="각 속성의 비율(%)을 입력하세요. 합계가 100%가 아니면 비율에 맞춰 자동 정규화합니다."
        action={
          <Button
            onClick={() =>
              setDistributions((prev) => [...prev, { field: 'careNeed', buckets: [{ value: '', percent: 100 }] }])
            }
          >
            속성 추가
          </Button>
        }
      >
        <div className="space-y-5">
          {distributions.map((d, di) => {
            const total100 = sum(d.buckets);
            return (
              <fieldset key={`${d.field}-${di}`} className="rounded-lg border border-slate-200 px-4 py-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">
                  {FIELD_OPTIONS.find((f) => f.key === d.field)?.label ?? d.field}
                </legend>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-600" htmlFor={`dist-field-${di}`}>
                    속성
                  </label>
                  <Select
                    id={`dist-field-${di}`}
                    value={d.field}
                    onChange={(e) =>
                      setDistributions((prev) =>
                        prev.map((x, i) => (i === di ? { ...x, field: e.target.value } : x))
                      )
                    }
                    className="w-48"
                  >
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                  <span className={total100 === 100 ? 'text-xs text-slate-500' : 'text-xs font-semibold text-amber-700'}>
                    합계 {total100}%
                  </span>
                  <Button
                    variant="danger"
                    onClick={() => setDistributions((prev) => prev.filter((_, i) => i !== di))}
                    className="ml-auto"
                  >
                    속성 삭제
                  </Button>
                </div>

                <div className="space-y-2">
                  {d.buckets.map((b, bi) => (
                    <div key={bi} className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`bv-${di}-${bi}`}>
                        값
                      </label>
                      <Input
                        id={`bv-${di}-${bi}`}
                        value={b.value}
                        onChange={(e) => updateBucket(di, bi, { value: e.target.value })}
                        placeholder={d.field === 'age' ? '예: 65-74 또는 85+' : '예: 독거'}
                        className="w-48"
                      />
                      <label className="sr-only" htmlFor={`bp-${di}-${bi}`}>
                        비율(%)
                      </label>
                      <Input
                        id={`bp-${di}-${bi}`}
                        type="number"
                        min={0}
                        max={100}
                        value={b.percent}
                        onChange={(e) => updateBucket(di, bi, { percent: Number(e.target.value) })}
                        className="w-24"
                      />
                      <span className="text-sm text-slate-600">%</span>
                      <Button
                        variant="danger"
                        onClick={() =>
                          setDistributions((prev) =>
                            prev.map((x, i) =>
                              i === di ? { ...x, buckets: x.buckets.filter((_, j) => j !== bi) } : x
                            )
                          )
                        }
                      >
                        삭제
                      </Button>
                    </div>
                  ))}
                  <Button
                    onClick={() =>
                      setDistributions((prev) =>
                        prev.map((x, i) => (i === di ? { ...x, buckets: [...x.buckets, { value: '', percent: 0 }] } : x))
                      )
                    }
                  >
                    값 추가
                  </Button>
                </div>
              </fieldset>
            );
          })}
        </div>
      </Card>

      <Card
        title="조건부 규칙 (교차표)"
        description='예: "80세 이상이고 독거인 경우 이동 불편 분포는 낮음 20% / 중간 35% / 높음 45%"'
      >
        {rules.length === 0 ? (
          <p className="text-sm text-slate-600">등록된 규칙이 없습니다.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {rules.map((r, ri) => (
              <li key={ri} className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="font-medium text-slate-800">
                  IF{' '}
                  {r.when
                    .map(
                      (w) =>
                        `${FIELD_OPTIONS.find((f) => f.key === w.field)?.label ?? w.field} ${
                          { eq: '=', neq: '≠', lte: '≤', gte: '≥' }[w.operator]
                        } ${w.value}`
                    )
                    .join(' AND ')}
                </p>
                <p className="mt-1 text-slate-700">
                  THEN {FIELD_OPTIONS.find((f) => f.key === r.field)?.label ?? r.field}:{' '}
                  {r.buckets.map((b) => `${b.value} ${b.percent}%`).join(' / ')}
                </p>
                <Button variant="danger" className="mt-2" onClick={() => setRules((prev) => prev.filter((_, i) => i !== ri))}>
                  규칙 삭제
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          v1 에서는 기본 예시 규칙을 제공하고 삭제할 수 있습니다. 규칙 추가는 프로젝트 백업 JSON 또는 API(
          <code>/api/clients/generate</code>)로 확장할 수 있습니다.
        </p>
      </Card>

      <Card title="생성">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void call('preview')} disabled={busy}>
            {busy ? '계산 중…' : '미리보기'}
          </Button>
          <Button variant="primary" onClick={() => void call('save')} disabled={busy || !name.trim()}>
            {total.toLocaleString()}명 생성하기
          </Button>
        </div>

        {preview && (
          <div className="mt-4 space-y-3">
            {preview.warnings.length > 0 && (
              <Notice tone="warning" title="확인 사항">
                <ul className="list-disc pl-5">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-800">생성 예시</p>
              <ul className="mt-2 space-y-2">
                {preview.sample.map((c) => (
                  <li key={c.localId} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-700">{c.localId}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{c.personaSummary}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
