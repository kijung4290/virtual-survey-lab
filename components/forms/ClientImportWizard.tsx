'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, Notice, Table, Td, Th, Textarea } from '@/components/ui';
import { PrivacyWarning } from '@/components/Disclaimer';
import { MAPPABLE_FIELDS, SKIP_COLUMN } from '@/lib/clients/mapping';
import type { PrivacyScanResult } from '@/lib/privacy/detect';

interface PreviewResponse {
  headers: string[];
  rowCount: number;
  sample: Record<string, string>[];
  suggestedMapping: Record<string, string>;
  privacy: PrivacyScanResult;
  valueSuspects: string[];
  previewClients: { localId: string; personaSummary: string }[];
  extraColumns: string[];
  mappingErrors: string[];
  error?: string;
}

const SAMPLE_CSV = `id,age,sex,household_type,housing_type,economic_status,mobility_difficulty,digital_literacy,social_contact
SC001,78,F,독거,임대,낮음,중간,낮음,낮음
SC002,69,M,부부,자가,중간,낮음,중간,높음`;

export function ClientImportWizard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [baseSource, setBaseSource] = useState('');
  const [distSource, setDistSource] = useState('');
  const [notes, setNotes] = useState('개인 식별정보 없음');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File) => {
    const text = await file.text();
    setCsv(text);
    if (!name) setName(file.name.replace(/\.csv$/i, ''));
  };

  const runPreview = async (nextMapping?: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/clients/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, mapping: nextMapping }),
      });
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok) throw new Error(data.error ?? '미리보기에 실패했습니다.');
      setPreview(data);
      setMapping(nextMapping ?? data.suggestedMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : '미리보기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const changeMapping = (header: string, value: string) => {
    const next = { ...mapping, [header]: value };
    setMapping(next);
    void runPreview(next);
  };

  const blockedRemaining = (preview?.privacy.blocked ?? []).filter(
    (b) => mapping[b.column] !== SKIP_COLUMN
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name,
          csv,
          mapping,
          sourceMeta: {
            base_source: baseSource || undefined,
            welfare_distribution_source: distSource || undefined,
            notes: notes || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '가져오기에 실패했습니다.');
      router.push(`/clients/${data.dataset.id}?project=${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '가져오기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PrivacyWarning />
      {error && <Notice tone="danger">{error}</Notice>}

      <Card title="1단계 · CSV 불러오기" description="파일을 선택하거나 내용을 직접 붙여넣을 수 있습니다.">
        <div className="space-y-4">
          <Field label="CSV 파일" htmlFor="csv-file">
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
              }}
              className="block w-full text-sm"
            />
          </Field>

          <Field
            label="또는 CSV 내용 붙여넣기"
            htmlFor="csv-text"
            hint={`첫 줄은 컬럼명이어야 합니다. 예시:\n${SAMPLE_CSV.split('\n')[0]}`}
          >
            <Textarea
              id="csv-text"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={SAMPLE_CSV}
              className="min-h-32 font-mono text-sm"
            />
          </Field>

          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void runPreview()} disabled={!csv.trim() || busy}>
              {busy ? '읽는 중…' : '컬럼 확인하기'}
            </Button>
            <Button onClick={() => setCsv(SAMPLE_CSV)}>예시 채우기</Button>
          </div>
        </div>
      </Card>

      {preview && (
        <>
          {preview.privacy.blocked.length > 0 && (
            <Notice tone="danger" title="개인 식별정보로 의심되는 컬럼이 있습니다">
              <ul className="mt-1 list-disc pl-5">
                {preview.privacy.blocked.map((b) => (
                  <li key={b.column}>
                    <strong>{b.column}</strong> ({b.matched} 패턴) —{' '}
                    {mapping[b.column] === SKIP_COLUMN ? '저장하지 않음으로 지정됨' : '저장하지 않음으로 바꾸거나 파일에서 제거하세요.'}
                  </li>
                ))}
              </ul>
            </Notice>
          )}

          {preview.privacy.warnings.length > 0 && (
            <Notice tone="warning" title="확인이 필요한 컬럼">
              {preview.privacy.warnings.map((w) => w.column).join(', ')} — 준식별정보일 수 있습니다.
            </Notice>
          )}

          {preview.valueSuspects.length > 0 && (
            <Notice tone="danger" title="값에서 식별정보 패턴이 발견되었습니다">
              {preview.valueSuspects.join(', ')} 컬럼의 값에 전화번호/주민등록번호/이메일 형태가 포함되어 있습니다.
            </Notice>
          )}

          <Card
            title="2단계 · 컬럼 매핑"
            description={`총 ${preview.rowCount.toLocaleString()}행을 읽었습니다. 각 컬럼을 어떤 속성으로 저장할지 지정하세요.`}
          >
            <Table caption="컬럼 매핑">
              <thead>
                <tr>
                  <Th>CSV 컬럼</Th>
                  <Th>예시 값</Th>
                  <Th>저장할 속성</Th>
                </tr>
              </thead>
              <tbody>
                {preview.headers.map((h) => (
                  <tr key={h}>
                    <Td>
                      <span className="font-mono text-sm">{h}</span>
                      {preview.privacy.blocked.some((b) => b.column === h) && (
                        <span className="ml-2">
                          <Badge tone="danger">개인정보 의심</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {preview.sample
                        .map((r) => r[h])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(' / ')}
                    </Td>
                    <Td>
                      <select
                        aria-label={`${h} 컬럼 매핑`}
                        value={mapping[h] ?? ''}
                        onChange={(e) => changeMapping(h, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">사용자 정의 필드로 보존</option>
                        <option value={SKIP_COLUMN}>저장하지 않음</option>
                        {MAPPABLE_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="3단계 · Persona Summary 미리보기" description="구조화 필드만으로 생성한 요약입니다. 없는 정보는 만들지 않습니다.">
            <ul className="space-y-3">
              {preview.previewClients.map((c) => (
                <li key={c.localId} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-700">{c.localId}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{c.personaSummary}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="4단계 · 데이터 출처 기록 후 저장" description="출처 정보는 결과 리포트에도 함께 표시됩니다.">
            <div className="space-y-4">
              <Field label="데이터셋 이름" htmlFor="ds-name" required>
                <Input
                  id="ds-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: WelfarePersona-v1"
                  required
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="기반 데이터 출처" htmlFor="ds-base" hint="예: Nemotron-Personas-Korea">
                  <Input id="ds-base" value={baseSource} onChange={(e) => setBaseSource(e.target.value)} />
                </Field>
                <Field label="복지 특성 분포 출처" htmlFor="ds-dist" hint="예: 2023 노인실태조사">
                  <Input id="ds-dist" value={distSource} onChange={(e) => setDistSource(e.target.value)} />
                </Field>
              </div>
              <Field label="비고" htmlFor="ds-notes">
                <Input id="ds-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>

              {blockedRemaining.length > 0 && (
                <Notice tone="danger">
                  개인정보 의심 컬럼({blockedRemaining.map((b) => b.column).join(', ')})을 &quot;저장하지 않음&quot;으로
                  지정해야 가져올 수 있습니다.
                </Notice>
              )}

              <Button
                variant="primary"
                onClick={() => void submit()}
                disabled={busy || !name.trim() || blockedRemaining.length > 0}
              >
                {busy ? '가져오는 중…' : `${preview.rowCount.toLocaleString()}명 가져오기`}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
