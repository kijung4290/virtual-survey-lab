import { hashString, mulberry32 } from '@/lib/utils';
import type { LLMProvider, LLMRawResult, SurveyPromptInput } from '@/lib/ai/types';
import type { SurveyQuestion } from '@/lib/types';

/**
 * MockLLMProvider
 *
 * API 비용 없이 전체 파이프라인을 테스트하기 위한 결정적 응답 생성기.
 * 같은 (응답자, 설문, temperature) 조합이면 항상 같은 값을 만든다.
 *
 * 주의: 이것은 "모델"이 아니라 규칙 기반 더미다.
 * Mock 결과를 연구 결론이나 기관 의사결정에 사용해서는 안 된다.
 */

/** 페르소나 특성 → 보기 키워드 친화도(테스트 데이터에 약한 상관을 넣기 위한 장치) */
const AFFINITY: { persona: RegExp; option: RegExp; weight: number }[] = [
  { persona: /Mobility difficulty: (높음|high|중간)/i, option: /병원|동행|이동|차량/, weight: 2.2 },
  { persona: /Mobility difficulty: (낮음|low)/i, option: /걷기|운동|나들이/, weight: 1.8 },
  { persona: /Digital literacy: (낮음|low)/i, option: /스마트폰|키오스크|디지털/, weight: 1.6 },
  { persona: /Digital literacy: (높음|high)/i, option: /취미|공예|문화/, weight: 1.4 },
  { persona: /Household type: 독거/, option: /식사|모임|말벗|돌봄/, weight: 2.0 },
  { persona: /Economic status: (낮음|저소득|low)/i, option: /비용|식사|지원/, weight: 1.5 },
  { persona: /Social contact: (낮음|low)/i, option: /모임|말벗|관계/, weight: 1.7 },
  { persona: /Health status: (나쁨|하|낮음)/i, option: /건강|병원|의료/, weight: 1.6 },
];

const OPEN_TEXT_TEMPLATES: { match: RegExp; sentences: string[] }[] = [
  {
    match: /Mobility difficulty: (높음|high)/i,
    sentences: [
      '혼자 멀리 이동하는 것이 어려워서 가까운 곳에서 하는 프로그램이면 참여하기 쉽다.',
      '오가는 길이 부담스러워 차량 지원이 있으면 좋겠다.',
    ],
  },
  {
    match: /Digital literacy: (낮음|low)/i,
    sentences: [
      '스마트폰 사용이 익숙하지 않아 신청 방법이 간단하면 참여하기 쉬울 것 같다.',
      '기계를 다루는 것이 어렵게 느껴져서 천천히 알려주면 좋겠다.',
    ],
  },
  {
    match: /Household type: 독거/,
    sentences: [
      '혼자 지내는 시간이 길어 사람들과 만나는 시간이 있으면 좋겠다.',
      '식사를 혼자 준비하는 것이 번거로워 함께 먹는 자리가 있으면 참여하고 싶다.',
    ],
  },
  {
    match: /Economic status: (낮음|저소득|low)/i,
    sentences: [
      '비용 부담이 적으면 참여를 결정하기 쉬울 것 같다.',
      '참가비가 없으면 더 자주 참여할 수 있을 것 같다.',
    ],
  },
  {
    match: /Social contact: (높음|high)/i,
    sentences: [
      '아는 사람들과 함께 참여할 수 있으면 더 즐거울 것 같다.',
      '이미 참여하는 모임이 있어 시간이 겹치지 않으면 참여하겠다.',
    ],
  },
];

const FALLBACK_SENTENCES = [
  '시간대가 맞으면 참여할 의향이 있다.',
  '내용이 어렵지 않고 설명이 충분하면 참여하고 싶다.',
  '가까운 곳에서 진행되면 참여하기 수월할 것 같다.',
  '건강 상태에 맞춰 무리하지 않는 수준이면 좋겠다.',
];

function weightsFor(q: SurveyQuestion, persona: string): number[] {
  const options = q.options ?? [];
  return options.map((opt) => {
    let w = 1;
    for (const rule of AFFINITY) {
      if (rule.persona.test(persona) && rule.option.test(opt)) w *= rule.weight;
    }
    return w;
  });
}

function pickWeighted(weights: number[], rand: () => number): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  let r = rand() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** 문항 이해도 점검용 결정적 더미 응답 */
function mockComprehensionResponse(input: SurveyPromptInput): string {
  const persona = `${input.personaFields}\n${input.personaSummary}`;
  const lowDigital = /Digital literacy: (낮음|low)/i.test(persona);
  const lowEducation = /Education: (무학|초등)/.test(persona);

  const items = input.questions.map((q) => {
    const seed = hashString(`${input.respondentId}|comp|${q.id}`);
    const rand = mulberry32(seed);

    // 문항이 길거나 어려운 낱말이 있으면 난이도를 올린다(규칙 기반 근사).
    const hardWords = ['키오스크', '바우처', '사례관리', '접근성', '리터러시', '모니터링'].filter((w) =>
      q.question.includes(w)
    );
    let difficulty = 2 + (q.question.length > 40 ? 1 : 0) + hardWords.length;
    if (lowDigital) difficulty += 1;
    if (lowEducation) difficulty += 1;
    if (rand() > 0.7) difficulty += 1;
    difficulty = Math.max(1, Math.min(5, difficulty));

    const restated =
      difficulty >= 4
        ? `${q.question.slice(0, 12)}… 무엇을 묻는지 잘 모르겠다. 아마 복지관에서 무엇을 해줄 수 있는지 묻는 것 같다.`
        : `${q.question.replace(/[?？]/g, '')}는 뜻으로 이해했다.`;

    return { question_id: q.id, restated, difficulty, hard_words: hardWords };
  });

  return JSON.stringify({ respondent_id: input.respondentId, items }, null, 2);
}

export function deterministicMockResponse(input: SurveyPromptInput): string {
  if (input.mode === 'comprehension') return mockComprehensionResponse(input);

  const persona = `${input.personaFields}\n${input.personaSummary}`;
  const answers: { question_id: string; value: string | number | string[] }[] = [];
  const picked: Record<string, string | number | string[]> = {};

  for (const q of input.questions) {
    // 조건부 문항: 조건을 만족하지 않으면 건너뛴다.
    if (q.condition) {
      const target = picked[q.condition.questionId];
      if (target === undefined) continue;
      const cond = q.condition;
      const pass =
        cond.operator === 'eq'
          ? String(target) === String(cond.value)
          : cond.operator === 'neq'
            ? String(target) !== String(cond.value)
            : cond.operator === 'lte'
              ? Number(target) <= Number(cond.value)
              : cond.operator === 'gte'
                ? Number(target) >= Number(cond.value)
                : Array.isArray(target)
                  ? target.map(String).includes(String(cond.value))
                  : String(target).includes(String(cond.value));
      if (!pass) continue;
    }

    const seed = hashString(`${input.respondentId}|${q.id}|${input.temperature}|${persona.length}`);
    const rand = mulberry32(seed);

    let value: string | number | string[];
    switch (q.type) {
      case 'single_choice': {
        const opts = q.options ?? ['기타'];
        value = opts[pickWeighted(weightsFor(q, persona), rand)] ?? opts[0];
        break;
      }
      case 'multi_choice': {
        const opts = q.options ?? [];
        const limit = Math.min(q.maxSelections ?? 3, opts.length);
        const w = weightsFor(q, persona);
        const chosen: string[] = [];
        const pool = opts.map((o, i) => ({ o, w: w[i] }));
        for (let n = 0; n < limit && pool.length > 0; n++) {
          const idx = pickWeighted(
            pool.map((p) => p.w),
            rand
          );
          chosen.push(pool[idx].o);
          pool.splice(idx, 1);
        }
        value = chosen;
        break;
      }
      case 'scale_5': {
        // 페르소나 친화도가 높을수록 중앙보다 위쪽으로 치우치게 한다.
        const base = 3 + (rand() - 0.45) * 2.4;
        const boost = /Mobility difficulty: (높음|high)|Household type: 독거/.test(persona) ? 0.4 : 0;
        value = Math.max(1, Math.min(5, Math.round(base + boost)));
        break;
      }
      case 'number': {
        const min = q.min ?? 0;
        const max = q.max ?? 10;
        value = Math.round(min + rand() * (max - min));
        break;
      }
      case 'open_text': {
        const matched = OPEN_TEXT_TEMPLATES.filter((t) => t.match.test(persona)).flatMap(
          (t) => t.sentences
        );
        const pool = matched.length > 0 ? matched.concat(FALLBACK_SENTENCES) : FALLBACK_SENTENCES;
        value = pool[Math.floor(rand() * pool.length)];
        break;
      }
      default:
        value = '';
    }

    picked[q.id] = value;
    answers.push({ question_id: q.id, value });
  }

  return JSON.stringify({ respondent_id: input.respondentId, answers }, null, 2);
}

export class MockLLMProvider implements LLMProvider {
  readonly id = 'mock';
  readonly label = 'Mock (비용 없음 · 테스트용)';

  isReady(): boolean {
    return true;
  }

  async generateResponse(input: SurveyPromptInput): Promise<LLMRawResult> {
    const started = Date.now();
    // 실제 호출과 비슷한 흐름을 만들기 위한 아주 짧은 지연
    await new Promise((r) => setTimeout(r, 5));
    const text = deterministicMockResponse(input);
    return {
      text,
      model: input.model || 'mock-deterministic-v1',
      modelVersion: 'mock-1',
      latencyMs: Date.now() - started,
    };
  }
}
