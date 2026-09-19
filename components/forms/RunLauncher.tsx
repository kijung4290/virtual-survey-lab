'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Notice, Select, Textarea } from '@/components/ui';
import { CLIENT_FIELDS, RECOMMENDED_RPM } from '@/lib/types';
import type { ProviderInfo } from '@/lib/ai';

interface Option {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  projectId: string;
  surveys: Option[];
  datasets: Option[];
  providers: ProviderInfo[];
  defaultSystemPrompt: string;
  defaultProvider: string;
  defaultSurveyId?: string;
  defaultDatasetId?: string;
}

interface TestResult {
  ok: boolean;
  model?: string;
  latencyMs?: number;
  answers?: Record<string, unknown>;
  validationErrors?: string[];
  rawPreview?: string;
  error?: string;
}

const CUSTOM = '__custom__';

export function RunLauncher({
  projectId,
  surveys,
  datasets,
  providers,
  defaultSystemPrompt,
  defaultProvider,
  defaultSurveyId,
  defaultDatasetId,
}: Props) {
  const router = useRouter();
  const [surveyId, setSurveyId] = useState(defaultSurveyId ?? surveys[0]?.id ?? '');
  const [datasetId, setDatasetId] = useState(defaultDatasetId ?? datasets[0]?.id ?? '');
  const [providerId, setProviderId] = useState(defaultProvider);
  const provider = providers.find((p) => p.id === providerId) ?? providers[0];

  const [model, setModel] = useState(provider?.models[0] ?? 'mock-deterministic-v1');
  const [modelMode, setModelMode] = useState<string>(provider?.models[0] ?? 'mock-deterministic-v1');
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const [temperature, setTemperature] = useState(0.3);
  const [repeat, setRepeat] = useState(1);
  const [concurrency, setConcurrency] = useState(5);
  const [rpm, setRpm] = useState(RECOMMENDED_RPM[defaultProvider] ?? 0);
  const [limit, setLimit] = useState<string>('');
  const [segmentField, setSegmentField] = useState('');
  const [segmentValues, setSegmentValues] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<{ value: string; label: string; count: number }[]>([]);
  const [loadingValues, setLoadingValues] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt);
  const [showPrompt, setShowPrompt] = useState(false);

  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const [estimate, setEstimate] = useState<{ targetCount: number; estimatedCalls: number; totalClients: number } | null>(
    null
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Provider 를 바꾸면 모델 선택과 조회 결과를 초기화한다.
  useEffect(() => {
    const p = providers.find((x) => x.id === providerId);
    const first = p?.models[0] ?? '';
    setModel(first);
    setModelMode(first);
    setFetchedModels(null);
    setModelListError(null);
    setTest(null);
    // Provider 마다 무료 등급 호출 한도가 달라 권장값을 다시 채운다.
    setRpm(RECOMMENDED_RPM[providerId] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  // 세그먼트 속성을 고르면 데이터셋에 실제로 있는 값만 불러온다(직접 입력하다 오타 나는 것을 막는다).
  useEffect(() => {
    setSegmentValues([]);
    setFieldValues([]);
    if (!segmentField || !datasetId) return;

    let cancelled = false;
    setLoadingValues(true);
    fetch(`/api/datasets/${datasetId}/values?field=${segmentField}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.values)) setFieldValues(data.values);
      })
      .catch(() => {
        if (!cancelled) setFieldValues([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingValues(false);
      });

    return () => {
      cancelled = true;
    };
  }, [segmentField, datasetId]);

  // 설정이 바뀌면 실행 확인을 다시 받는다.
  useEffect(() => {
    setConfirmed(false);
    setEstimate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, datasetId, providerId, model, repeat, limit, segmentField, segmentValues.join(',')]);

  const modelOptions = fetchedModels && fetchedModels.length > 0 ? fetchedModels : (provider?.models ?? []);

  const loadModels = async () => {
    setLoadingModels(true);
    setModelListError(null);
    try {
      const res = await fetch(`/api/providers/models?provider=${providerId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '모델 목록을 불러오지 못했습니다.');
      if (!data.models?.length) throw new Error('사용 가능한 모델이 없습니다.');
      setFetchedModels(data.models as string[]);
    } catch (err) {
      setModelListError(err instanceof Error ? err.message : '모델 목록을 불러오지 못했습니다.');
    } finally {
      setLoadingModels(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, model, temperature: Number(temperature) }),
      });
      setTest((await res.json()) as TestResult);
    } catch (err) {
      setTest({ ok: false, error: err instanceof Error ? err.message : '연결 테스트에 실패했습니다.' });
    } finally {
      setTesting(false);
    }
  };

  const segmentFilter = () => {
    if (!segmentField || segmentValues.length === 0) return undefined;
    return { [segmentField]: segmentValues };
  };

  const runEstimate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          surveyId,
          datasetId,
          provider: providerId,
          model,
          repeat: Number(repeat),
          limit: limit ? Number(limit) : undefined,
          segmentFilter: segmentFilter(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '계산에 실패했습니다.');
      setEstimate(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '계산에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

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
          provider: providerId,
          model,
          temperature: Number(temperature),
          repeat: Number(repeat),
          concurrency: Number(concurrency),
          requestsPerMinute: Number(rpm) || 0,
          limit: limit ? Number(limit) : undefined,
          segmentFilter: segmentFilter(),
          systemPrompt,
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실행에 실패했습니다.');
      router.push(`/runs/${data.firstRunId}?project=${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '실행에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (surveys.length === 0 || datasets.length === 0) {
    return (
      <Notice tone="warning" title="실행 준비가 필요합니다">
        설문지와 Synthetic Client 데이터셋이 각각 1개 이상 있어야 실행할 수 있습니다.
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Notice tone="danger">{error}</Notice>}

      <Card title="1단계 · 무엇을 실행할까요?">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="설문지" htmlFor="run-survey" required>
            <Select id="run-survey" value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Synthetic Client 데이터셋" htmlFor="run-dataset" required>
            <Select id="run-dataset" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card title="2단계 · 대상 좁히기 (선택)" description="비워두면 패널 전체에 실행합니다.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="대상 인원 상한" htmlFor="run-limit" hint="비워두면 전체. 처음에는 5~10명으로 시험해보세요.">
            <Input id="run-limit" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
          <Field label="세그먼트 속성" htmlFor="run-segfield" hint="특정 집단에만 실행하려면 선택하세요.">
            <Select id="run-segfield" value={segmentField} onChange={(e) => setSegmentField(e.target.value)}>
              <option value="">사용 안 함 (전체)</option>
              {CLIENT_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {segmentField && (
          <fieldset className="mt-4 rounded-lg border border-slate-200 px-4 py-3">
            <legend className="px-1 text-sm font-medium text-slate-800">
              포함할 값 {segmentValues.length > 0 && `(${segmentValues.length}개 선택)`}
            </legend>

            {loadingValues ? (
              <p className="text-sm text-slate-600">값 목록을 불러오는 중…</p>
            ) : fieldValues.length === 0 ? (
              <p className="text-sm text-amber-800">
                이 데이터셋에는 해당 속성 값이 없습니다. 다른 속성을 고르거나 &ldquo;사용 안 함&rdquo;으로 두세요.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {fieldValues.map((v) => {
                    const checked = segmentValues.includes(v.value);
                    return (
                      <label
                        key={v.value}
                        className={
                          'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ' +
                          (checked ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white')
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSegmentValues((prev) =>
                              e.target.checked ? [...prev, v.value] : prev.filter((x) => x !== v.value)
                            )
                          }
                        />
                        <span>
                          {v.label} <span className="text-slate-500">({v.count}명)</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  데이터셋에 실제로 있는 값만 표시합니다. 아무것도 고르지 않으면 전체가 대상입니다.
                </p>
              </>
            )}
          </fieldset>
        )}
      </Card>

      <Card title="3단계 · AI 설정">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="AI Provider" htmlFor="run-provider" required>
            <Select id="run-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.ready}>
                  {p.label}
                  {p.ready ? '' : ' (API Key 없음)'}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="모델"
            htmlFor="run-model"
            required
            hint={
              provider?.allowCustomModel
                ? '목록에 없으면 "직접 입력"을 선택해 모델명을 그대로 적을 수 있습니다.'
                : undefined
            }
          >
            <Select
              id="run-model"
              value={modelMode}
              onChange={(e) => {
                setModelMode(e.target.value);
                if (e.target.value !== CUSTOM) setModel(e.target.value);
                else setModel('');
              }}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              {provider?.allowCustomModel && <option value={CUSTOM}>직접 입력…</option>}
            </Select>
          </Field>

          {modelMode === CUSTOM && (
            <Field label="모델명 직접 입력" htmlFor="run-model-custom" required hint="예: gemini-2.5-flash">
              <Input
                id="run-model-custom"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gemini-2.5-flash"
              />
            </Field>
          )}

          <Field label="Temperature" htmlFor="run-temp" hint="기본값 0.3. 일부 최신 모델은 이 값을 사용하지 않습니다.">
            <Input
              id="run-temp"
              type="number"
              step={0.1}
              min={0}
              max={1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </Field>
          <Field label="반복 실행 횟수" htmlFor="run-repeat" hint="같은 설문을 여러 번 실행해 응답 안정성을 확인합니다.">
            <Input
              id="run-repeat"
              type="number"
              min={1}
              max={10}
              value={repeat}
              onChange={(e) => setRepeat(Number(e.target.value))}
            />
          </Field>
          <Field label="최대 동시 실행 수" htmlFor="run-conc" hint="기본값 5. 호출 한도 오류가 나면 낮추세요.">
            <Input
              id="run-conc"
              type="number"
              min={1}
              max={20}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
            />
          </Field>
          <Field
            label="분당 최대 호출 수"
            htmlFor="run-rpm"
            hint="0 = 제한 없음. Gemini 무료 키는 분당 한도가 낮아 10~15 를 권장합니다."
          >
            <Input
              id="run-rpm"
              type="number"
              min={0}
              max={600}
              value={rpm}
              onChange={(e) => setRpm(Number(e.target.value))}
            />
          </Field>
        </div>

        {provider && !provider.ready && (
          <Notice tone="warning" title="이 Provider 는 아직 사용할 수 없습니다">
            {provider.hint}
          </Notice>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {provider?.allowCustomModel && (
            <Button onClick={() => void loadModels()} disabled={loadingModels || !provider?.ready}>
              {loadingModels ? '불러오는 중…' : '사용 가능한 모델 목록 불러오기'}
            </Button>
          )}
          <Button onClick={() => void runTest()} disabled={testing || !provider?.ready || !model.trim()}>
            {testing ? '테스트 중…' : '연결 테스트 (1회 호출)'}
          </Button>
          <Button onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? 'System Prompt 접기' : 'System Prompt 보기/수정'}
          </Button>
        </div>

        {modelListError && (
          <div className="mt-3">
            <Notice tone="warning">{modelListError}</Notice>
          </div>
        )}
        {fetchedModels && (
          <p className="mt-2 text-xs text-slate-500">
            계정에서 사용 가능한 모델 {fetchedModels.length}개를 불러왔습니다.
          </p>
        )}

        {test && (
          <div className="mt-3">
            <Notice tone={test.ok ? 'info' : 'danger'} title={test.ok ? '연결 성공' : '연결 실패'}>
              {test.ok ? (
                <div className="space-y-1">
                  <p>
                    모델 <strong>{test.model}</strong> · 응답 시간 {test.latencyMs}ms
                  </p>
                  <p className="text-xs">
                    테스트 응답: {JSON.stringify(test.answers)} — JSON 형식 검증까지 통과했습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p>{test.error ?? '응답 형식 검증에 실패했습니다.'}</p>
                  {test.validationErrors && test.validationErrors.length > 0 && (
                    <ul className="list-disc pl-5 text-xs">
                      {test.validationErrors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                  {test.rawPreview && (
                    <details className="text-xs">
                      <summary className="cursor-pointer">모델 원문 보기</summary>
                      <pre className="mt-1 whitespace-pre-wrap">{test.rawPreview}</pre>
                    </details>
                  )}
                </div>
              )}
            </Notice>
          </div>
        )}

        {showPrompt && (
          <div className="mt-3">
            <Field
              label="System Prompt"
              htmlFor="run-sysprompt"
              hint="실행 기록에 그대로 저장되어 재현성 추적에 사용됩니다."
            >
              <Textarea
                id="run-sysprompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-48 font-mono text-xs"
              />
            </Field>
          </div>
        )}
      </Card>

      <Card title="4단계 · 예상 호출 수 확인 후 실행" description="실행 전에 예상 API 호출 수를 반드시 확인하세요.">
        <div className="space-y-4">
          <Button onClick={() => void runEstimate()} disabled={busy}>
            {busy ? '계산 중…' : '예상 호출 수 계산'}
          </Button>

          {estimate && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p>
                대상 응답자: <strong>{estimate.targetCount.toLocaleString()}명</strong>{' '}
                <span className="text-slate-500">(데이터셋 전체 {estimate.totalClients.toLocaleString()}명)</span>
              </p>
              <p>
                설문 실행: <strong>{repeat}회</strong>
              </p>
              {rpm > 0 && estimate.estimatedCalls > 0 && (
                <p className="text-slate-600">
                  분당 {rpm}회 제한 → 예상 소요 시간 약{' '}
                  <strong>{Math.max(1, Math.ceil(estimate.estimatedCalls / rpm))}분</strong>
                </p>
              )}
              <p className="mt-1 text-base">
                예상 API 호출: <strong>{estimate.estimatedCalls.toLocaleString()}회</strong>
                {providerId === 'mock' && <span className="ml-2 text-slate-600">(Mock 모드는 비용이 발생하지 않습니다)</span>}
              </p>

              {estimate.targetCount === 0 ? (
                <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                  조건에 맞는 대상자가 <strong>0명</strong>입니다. 위 2단계에서 세그먼트 값을 다시 고르거나
                  &ldquo;사용 안 함&rdquo;으로 바꿔주세요.
                </p>
              ) : (
                <label className="mt-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    위 호출 수를 확인했고 실행에 동의합니다.
                    {providerId !== 'mock' && ' 실제 API 비용이 발생할 수 있습니다.'}
                  </span>
                </label>
              )}
            </div>
          )}

          <Button
            variant="primary"
            onClick={() => void start()}
            disabled={
              busy || !estimate || estimate.targetCount === 0 || !confirmed || !provider?.ready || !model.trim()
            }
          >
            {busy ? '시작하는 중…' : '설문 실행 시작'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
