import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai/prompts/surveyPrompt';
import { validateLLMResponse } from '@/lib/ai/schemas/response';
import type { SurveyQuestion } from '@/lib/types';

/**
 * Provider 연결 테스트.
 * 실제 설문 대신 아주 작은 2문항을 1명분만 호출해서
 * API Key·모델명·JSON 응답 형식이 정상인지 확인한다. (호출 1회)
 */
const TEST_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'Q1',
    type: 'single_choice',
    question: '가장 참여하고 싶은 프로그램은 무엇입니까?',
    options: ['병원동행', '스마트폰 활용교육', '건강걷기'],
  },
  { id: 'Q2', type: 'scale_5', question: '실제로 참여할 의향은 어느 정도입니까?' },
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { provider?: string; model?: string; temperature?: number };
    const providerId = body.provider ?? 'mock';
    const provider = getProvider(providerId);

    if (!provider.isReady()) {
      return NextResponse.json(
        { ok: false, error: `${provider.label} 는 아직 사용할 수 없습니다. .env 의 API Key 를 확인하세요.` },
        { status: 400 }
      );
    }

    const result = await provider.generateResponse({
      respondentId: 'TEST-0001',
      personaFields: 'Age: 78\nHousehold type: 독거\nMobility difficulty: 높음\nDigital literacy: 낮음',
      personaSummary: '78세이며 가구형태는 독거이다. 외출과 이동에 어려움이 큰 편이다.',
      questions: TEST_QUESTIONS,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      temperature: body.temperature ?? 0.3,
      model: body.model ?? '',
    });

    const validation = validateLLMResponse(result.text, TEST_QUESTIONS);

    return NextResponse.json({
      ok: validation.ok,
      model: result.model,
      modelVersion: result.modelVersion,
      latencyMs: result.latencyMs,
      answers: validation.answers,
      validationErrors: validation.errors,
      rawPreview: result.text.slice(0, 600),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '연결 테스트에 실패했습니다.' },
      { status: 502 }
    );
  }
}
