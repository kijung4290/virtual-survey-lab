'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Field, Input, Notice, Select, Table, Td, Th, Textarea } from '@/components/ui';
import { PrivacyWarning } from '@/components/Disclaimer';
import type { PrivacyScanResult } from '@/lib/privacy/detect';

interface PreviewData {
  headers: string[];
  rowCount: number;
  sample: Record<string, string>[];
  privacy: PrivacyScanResult;
  valueSuspects: string[];
  suggestedMap: Record<string, string>;
  questions: { id: string; question: string; type: string }[];
  error?: string;
}

const SAMPLE = `respondent_id,Q1,Q2,Q3
R001,병원동행,5,혼자 가기 어려움
R002,스마트폰 활용교육,4,필요하지만 배울 곳이 없음`;

export function ActualImportWizard({
  projectId,
  surveys,
}: {
  projectId: string;
  surveys: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [surveyId, setSurveyId] = useState(surveys[0]?.id ?? '');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/actual/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, surveyId }),
      });
      const data = (await res.json()) as PreviewData;
      if (!res.ok) throw new Error(data.error ?? '미리보기에 실패했습니다.');
      setPreview(data);
      setMap(data.suggestedMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : '미리보기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const blockedRemaining = (preview?.privacy.blocked ?? []).filter((b) => map[b.column] !== '');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/actual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, surveyId, name, surveyDate, notes, csv, columnMap: map }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '가져오기에 실패했습니다.');
      router.push(`/validation?project=${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '가져오기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (surveys.length === 0) {
    return (
      <Notice tone="warning" title="먼저 설문지가 필요합니다">
        실제 조사 결과는 비교할 설문지의 문항에 맞춰 저장됩니다. 설문지를 먼저 만들어주세요.
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      <PrivacyWarning />
      {error && <Notice tone="danger">{error}</Notice>}

      <Notice tone="info">
        업로드한 실제 조사 결과는 이 컴퓨터의 로컬 데이터베이스에만 저장되며, 외부 AI 모델로 전송되지 않습니다.
      </Notice>

      <Card title="1단계 · 비교할 설문지와 CSV 선택">
        <div className="space-y-4">
          <Field label="비교할 설문지" htmlFor="actual-survey" required>
            <Select id="actual-survey" value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="CSV 파일" htmlFor="actual-file">
            <input
              id="actual-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setCsv(await file.text());
                if (!name) setName(file.name.replace(/\.csv$/i, ''));
              }}
              className="block w-full text-sm"
            />
          </Field>

          <Field label="또는 CSV 내용 붙여넣기" htmlFor="actual-csv">
            <Textarea
              id="actual-csv"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={SAMPLE}
              className="min-h-32 font-mono text-sm"
            />
          </Field>

          <Button variant="primary" onClick={() => void runPreview()} disabled={!csv.trim() || busy}>
            {busy ? '읽는 중…' : '컬럼 확인하기'}
          </Button>
        </div>
      </Card>

      {preview && (
        <>
          {preview.privacy.blocked.length > 0 && (
            <Notice tone="danger" title="개인 식별정보로 의심되는 컬럼이 있습니다">
              {preview.privacy.blocked.map((b) => b.column).join(', ')} — 해당 컬럼을 파일에서 제거한 뒤 다시
              업로드하세요.
            </Notice>
          )}
          {preview.valueSuspects.length > 0 && (
            <Notice tone="danger" title="값에서 식별정보 패턴이 발견되었습니다">
              {preview.valueSuspects.join(', ')} 컬럼을 확인하세요.
            </Notice>
          )}

          <Card
            title="2단계 · 컬럼을 문항에 연결"
            description={`총 ${preview.rowCount.toLocaleString()}행. 각 컬럼이 어떤 문항의 응답인지 지정하세요.`}
          >
            <Table caption="실제 조사 컬럼 매핑">
              <thead>
                <tr>
                  <Th>CSV 컬럼</Th>
                  <Th>예시 값</Th>
                  <Th>연결할 문항</Th>
                </tr>
              </thead>
              <tbody>
                {preview.headers.map((h) => (
                  <tr key={h}>
                    <Td className="font-mono text-sm">
                      {h}
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
                        aria-label={`${h} 컬럼 연결`}
                        value={map[h] ?? ''}
                        onChange={(e) => setMap((prev) => ({ ...prev, [h]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">사용하지 않음</option>
                        <option value="__respondent_id__">응답자 식별번호</option>
                        {preview.questions.map((qq) => (
                          <option key={qq.id} value={qq.id}>
                            {qq.id}. {qq.question.slice(0, 30)}
                          </option>
                        ))}
                      </select>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="3단계 · 저장">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="데이터 이름" htmlFor="actual-name" required>
                  <Input
                    id="actual-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 2027년 1차 실제 욕구조사"
                  />
                </Field>
                <Field label="조사 시점" htmlFor="actual-date" hint="예: 2027-03">
                  <Input id="actual-date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} />
                </Field>
              </div>
              <Field label="비고" htmlFor="actual-notes" hint="표본 수집 방법, 대상 등">
                <Input id="actual-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>

              {blockedRemaining.length > 0 && (
                <Notice tone="danger">
                  개인정보 의심 컬럼이 남아 있습니다. 파일에서 제거하거나 &quot;사용하지 않음&quot;으로 지정하세요.
                </Notice>
              )}

              <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
                {busy ? '저장 중…' : `${preview.rowCount.toLocaleString()}건 저장`}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
