'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Notice, Select, Textarea } from '@/components/ui';
import { DEMO_QUESTIONS, DEMO_SURVEY_NAME } from '@/lib/survey/demo';
import {
  DEFAULT_SCALE_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  type ConditionOperator,
  type QuestionType,
  type SurveyQuestion,
} from '@/lib/types';

/**
 * 설문지 작성 화면.
 * 문항 유형: 단일선택 / 복수선택 / 5점척도 / 숫자 / 주관식 + 조건부 문항.
 */

interface Props {
  projectId: string;
  survey?: {
    id: string;
    name: string;
    description: string | null;
    version: number;
    questions: SurveyQuestion[];
    locked: boolean;
    runCount?: number;
  };
}

function nextId(questions: SurveyQuestion[]): string {
  let n = questions.length + 1;
  const ids = new Set(questions.map((q) => q.id));
  while (ids.has(`Q${n}`)) n += 1;
  return `Q${n}`;
}

function emptyQuestion(questions: SurveyQuestion[]): SurveyQuestion {
  return {
    id: nextId(questions),
    type: 'single_choice',
    question: '',
    options: ['', ''],
    required: true,
  };
}

export function SurveyBuilder({ projectId, survey }: Props) {
  const router = useRouter();
  const [name, setName] = useState(survey?.name ?? '');
  const [description, setDescription] = useState(survey?.description ?? '');
  const [questions, setQuestions] = useState<SurveyQuestion[]>(survey?.questions ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const patch = (idx: number, next: Partial<SurveyQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...next } : q)));
  };

  const changeType = (idx: number, type: QuestionType) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== idx) return q;
        const base: SurveyQuestion = { id: q.id, type, question: q.question, required: q.required, condition: q.condition };
        if (type === 'single_choice') return { ...base, options: q.options ?? ['', ''] };
        if (type === 'multi_choice') return { ...base, options: q.options ?? ['', ''], maxSelections: 3 };
        if (type === 'scale_5') return { ...base, scaleLabels: q.scaleLabels ?? DEFAULT_SCALE_LABELS };
        if (type === 'number') return { ...base, min: 0, max: 10, unit: '회' };
        return base;
      })
    );
  };

  const move = (idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setErrors([]);
    setMessage(null);
    try {
      const payload = { projectId, name, description, questions };
      const res = await fetch(survey ? `/api/surveys/${survey.id}` : '/api/surveys', {
        method: survey ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(String(data.error ?? '저장에 실패했습니다.').split('\n'));
        return;
      }
      setMessage(
        survey && data.version !== survey.version
          ? `실행 기록이 있어 새 버전(v${data.version})으로 저장했습니다. 기존 응답은 v${survey.version} 그대로 유지됩니다.`
          : '저장했습니다.'
      );
      router.push(`/surveys/${data.id}?project=${projectId}`);
      router.refresh();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : '저장에 실패했습니다.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {errors.length > 0 && (
        <Notice tone="danger" title="확인이 필요합니다">
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}
      {message && <Notice tone="info">{message}</Notice>}

      {survey && (survey.runCount ?? 0) > 0 && (
        <Notice tone="warning" title="이 설문지는 이미 실행되었습니다">
          내용을 수정해 저장하면 새 버전(v{survey.version + 1})이 만들어지고, 기존 응답은 v{survey.version} 을 그대로
          유지합니다.
        </Notice>
      )}

      <Card title="설문지 정보">
        <div className="space-y-4">
          <Field label="설문지 이름" htmlFor="survey-name" required>
            <Input id="survey-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 노인복지 프로그램 사전 욕구조사" required />
          </Field>
          <Field label="설명" htmlFor="survey-desc">
            <Textarea id="survey-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {questions.length === 0 && (
            <Button
              onClick={() => {
                setQuestions(DEMO_QUESTIONS);
                if (!name) setName(DEMO_SURVEY_NAME);
              }}
            >
              데모 설문 6문항 불러오기
            </Button>
          )}
        </div>
      </Card>

      <Card
        title={`문항 (${questions.length}개)`}
        description="위/아래 버튼으로 순서를 바꿀 수 있습니다."
        action={<Button onClick={() => setQuestions((prev) => [...prev, emptyQuestion(prev)])}>문항 추가</Button>}
      >
        {questions.length === 0 ? (
          <p className="text-sm text-slate-600">문항을 추가하거나 데모 설문을 불러오세요.</p>
        ) : (
          <ol className="space-y-5">
            {questions.map((q, idx) => (
              <li key={`${q.id}-${idx}`} className="rounded-lg border border-slate-200 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {idx + 1}번
                  </span>
                  <label className="sr-only" htmlFor={`qid-${idx}`}>
                    문항 ID
                  </label>
                  <Input
                    id={`qid-${idx}`}
                    value={q.id}
                    onChange={(e) => patch(idx, { id: e.target.value })}
                    className="w-24"
                  />
                  <label className="sr-only" htmlFor={`qtype-${idx}`}>
                    문항 유형
                  </label>
                  <Select
                    id={`qtype-${idx}`}
                    value={q.type}
                    onChange={(e) => changeType(idx, e.target.value as QuestionType)}
                    className="w-40"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {QUESTION_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                  <div className="ml-auto flex gap-1">
                    <Button onClick={() => move(idx, -1)} disabled={idx === 0}>
                      ↑
                    </Button>
                    <Button onClick={() => move(idx, 1)} disabled={idx === questions.length - 1}>
                      ↓
                    </Button>
                    <Button variant="danger" onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}>
                      삭제
                    </Button>
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  <Field label="문항 내용" htmlFor={`qtext-${idx}`} required>
                    <Textarea
                      id={`qtext-${idx}`}
                      value={q.question}
                      onChange={(e) => patch(idx, { question: e.target.value })}
                      className="min-h-16"
                    />
                  </Field>

                  {(q.type === 'single_choice' || q.type === 'multi_choice') && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-slate-800">선택지</legend>
                      {(q.options ?? []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <label className="sr-only" htmlFor={`opt-${idx}-${oi}`}>
                            선택지 {oi + 1}
                          </label>
                          <Input
                            id={`opt-${idx}-${oi}`}
                            value={opt}
                            onChange={(e) =>
                              patch(idx, {
                                options: (q.options ?? []).map((o, j) => (j === oi ? e.target.value : o)),
                              })
                            }
                          />
                          <Button
                            variant="danger"
                            onClick={() => patch(idx, { options: (q.options ?? []).filter((_, j) => j !== oi) })}
                          >
                            삭제
                          </Button>
                        </div>
                      ))}
                      <Button onClick={() => patch(idx, { options: [...(q.options ?? []), ''] })}>선택지 추가</Button>

                      {q.type === 'multi_choice' && (
                        <Field label="최대 선택 개수" htmlFor={`max-${idx}`}>
                          <Input
                            id={`max-${idx}`}
                            type="number"
                            min={1}
                            max={(q.options ?? []).length || 1}
                            value={q.maxSelections ?? 3}
                            onChange={(e) => patch(idx, { maxSelections: Number(e.target.value) })}
                            className="w-24"
                          />
                        </Field>
                      )}
                    </fieldset>
                  )}

                  {q.type === 'scale_5' && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-slate-800">척도 라벨 (1~5, 내부적으로 1~5 저장)</legend>
                      {(q.scaleLabels ?? DEFAULT_SCALE_LABELS).map((label, li) => (
                        <div key={li} className="flex items-center gap-2">
                          <span className="w-6 text-sm text-slate-600">{li + 1}</span>
                          <label className="sr-only" htmlFor={`scale-${idx}-${li}`}>
                            {li + 1}점 라벨
                          </label>
                          <Input
                            id={`scale-${idx}-${li}`}
                            value={label}
                            onChange={(e) =>
                              patch(idx, {
                                scaleLabels: (q.scaleLabels ?? DEFAULT_SCALE_LABELS).map((l, j) =>
                                  j === li ? e.target.value : l
                                ),
                              })
                            }
                          />
                        </div>
                      ))}
                    </fieldset>
                  )}

                  {(q.type === 'scale_5' || q.type === 'number') && (
                    <div className="grid gap-3 rounded-lg bg-slate-50 px-3 py-3 sm:grid-cols-2">
                      <Field
                        label="척도 묶음 (선택)"
                        htmlFor={`construct-${idx}`}
                        hint="같은 개념을 재는 문항에 같은 이름을 적으면 신뢰도(α)와 문항 변별도를 계산합니다. 예: 참여의향"
                      >
                        <Input
                          id={`construct-${idx}`}
                          value={q.construct ?? ''}
                          onChange={(e) => patch(idx, { construct: e.target.value || undefined })}
                          placeholder="예: 참여의향"
                        />
                      </Field>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={Boolean(q.reverse)}
                            onChange={(e) => patch(idx, { reverse: e.target.checked || undefined })}
                          />
                          역채점 문항 (방향이 반대인 문항)
                        </label>
                      </div>
                    </div>
                  )}

                  {q.type === 'number' && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="최솟값" htmlFor={`min-${idx}`}>
                        <Input
                          id={`min-${idx}`}
                          type="number"
                          value={q.min ?? 0}
                          onChange={(e) => patch(idx, { min: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="최댓값" htmlFor={`max2-${idx}`}>
                        <Input
                          id={`max2-${idx}`}
                          type="number"
                          value={q.max ?? 10}
                          onChange={(e) => patch(idx, { max: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="단위" htmlFor={`unit-${idx}`}>
                        <Input id={`unit-${idx}`} value={q.unit ?? ''} onChange={(e) => patch(idx, { unit: e.target.value })} />
                      </Field>
                    </div>
                  )}

                  <fieldset className="rounded-lg bg-slate-50 px-3 py-3">
                    <legend className="px-1 text-sm font-medium text-slate-800">조건부 표시 (선택)</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className="text-xs text-slate-600" htmlFor={`cond-q-${idx}`}>
                          기준 문항
                        </label>
                        <Select
                          id={`cond-q-${idx}`}
                          value={q.condition?.questionId ?? ''}
                          onChange={(e) =>
                            patch(idx, {
                              condition: e.target.value
                                ? {
                                    questionId: e.target.value,
                                    operator: q.condition?.operator ?? 'lte',
                                    value: q.condition?.value ?? '',
                                  }
                                : undefined,
                            })
                          }
                        >
                          <option value="">조건 없음</option>
                          {questions.slice(0, idx).map((prev) => (
                            <option key={prev.id} value={prev.id}>
                              {prev.id}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-600" htmlFor={`cond-op-${idx}`}>
                          조건
                        </label>
                        <Select
                          id={`cond-op-${idx}`}
                          value={q.condition?.operator ?? 'lte'}
                          disabled={!q.condition}
                          onChange={(e) =>
                            patch(idx, {
                              condition: q.condition
                                ? { ...q.condition, operator: e.target.value as ConditionOperator }
                                : undefined,
                            })
                          }
                        >
                          <option value="eq">같다</option>
                          <option value="neq">다르다</option>
                          <option value="lte">이하</option>
                          <option value="gte">이상</option>
                          <option value="includes">포함</option>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-600" htmlFor={`cond-v-${idx}`}>
                          기준 값
                        </label>
                        <Input
                          id={`cond-v-${idx}`}
                          value={String(q.condition?.value ?? '')}
                          disabled={!q.condition}
                          onChange={(e) =>
                            patch(idx, {
                              condition: q.condition
                                ? {
                                    ...q.condition,
                                    value: /^-?\d+(\.\d+)?$/.test(e.target.value) ? Number(e.target.value) : e.target.value,
                                  }
                                : undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      예: Q2 참여의향이 2 이하일 때만 이 문항을 표시 → 기준 문항 Q2, 조건 이하, 값 2
                    </p>
                  </fieldset>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={busy || !name.trim() || questions.length === 0}>
          {busy ? '저장 중…' : survey ? '저장' : '설문지 만들기'}
        </Button>
      </div>
    </div>
  );
}
