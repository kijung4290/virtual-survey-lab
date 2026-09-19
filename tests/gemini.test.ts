import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '@/lib/ai/providers/gemini';
import { validateLLMResponse } from '@/lib/ai/schemas/response';
import { RateLimitError, ProviderError, type SurveyPromptInput } from '@/lib/ai/types';
import type { SurveyQuestion } from '@/lib/types';

/**
 * Gemini Provider 는 실제 호출 없이 fetch 를 가로채 요청/응답 처리를 검증한다.
 * (실제 API 호출은 화면의 "연결 테스트" 버튼으로 확인한다.)
 */

const QUESTIONS: SurveyQuestion[] = [
  { id: 'Q1', type: 'single_choice', question: '선호', options: ['병원동행', '건강걷기'] },
  { id: 'Q2', type: 'scale_5', question: '의향' },
];

const INPUT: SurveyPromptInput = {
  respondentId: 'SC-0001',
  personaFields: 'Age: 78\nHousehold type: 독거',
  personaSummary: '78세이며 가구형태는 독거이다.',
  questions: QUESTIONS,
  systemPrompt: 'SYSTEM',
  temperature: 0.3,
  model: 'gemini-2.5-flash',
};

function mockFetch(status: number, body: unknown) {
  const make = () => {
    const res = {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      clone: () => make(),
    };
    return res;
  };
  const spy = vi.fn(async () => make());
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

describe('GeminiProvider', () => {
  it('API Key 가 없으면 준비되지 않은 상태로 보고한다', () => {
    expect(new GeminiProvider().isReady()).toBe(false);
    process.env.GEMINI_API_KEY = 'test-key';
    expect(new GeminiProvider().isReady()).toBe(true);
  });

  it('요청 형식(엔드포인트·헤더·본문)을 올바르게 구성한다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const spy = mockFetch(200, {
      candidates: [{ content: { parts: [{ text: '{"respondent_id":"SC-0001","answers":[]}' }] } }],
      modelVersion: 'gemini-2.5-flash-001',
    });

    await new GeminiProvider().generateResponse(INPUT);

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-2.5-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');

    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('SYSTEM');
    expect(body.contents[0].parts[0].text).toContain('[PERSONA]');
    expect(body.generationConfig.temperature).toBe(0.3);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    // 2.5 계열은 기본적으로 thinking 을 끈다(대량 호출 비용 절감)
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);

    // API Key 가 URL 에 노출되지 않아야 한다
    expect(url).not.toContain('test-key');
  });

  it('3.x 계열에도 thinking 을 끈 설정을 보낸다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const spy = mockFetch(200, { candidates: [{ content: { parts: [{ text: '{"answers":[]}' }] } }] });

    await new GeminiProvider().generateResponse({ ...INPUT, model: 'gemini-3.5-flash' });

    const body = JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it('2.0 계열에는 thinkingConfig 를 보내지 않는다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const spy = mockFetch(200, { candidates: [{ content: { parts: [{ text: '{"answers":[]}' }] } }] });

    await new GeminiProvider().generateResponse({ ...INPUT, model: 'gemini-2.0-flash' });

    const body = JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it('정상 응답을 문항 스키마 검증까지 통과시킨다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockFetch(200, {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  respondent_id: 'SC-0001',
                  answers: [
                    { question_id: 'Q1', value: '병원동행' },
                    { question_id: 'Q2', value: 4 },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await new GeminiProvider().generateResponse(INPUT);
    const validation = validateLLMResponse(result.text, QUESTIONS);

    expect(validation.ok).toBe(true);
    expect(validation.answers).toEqual({ Q1: '병원동행', Q2: 4 });
    expect(result.model).toBe('gemini-2.5-flash');
  });

  it('503(과부하)은 자동으로 다시 시도한 뒤 재시도 가능한 오류로 처리한다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const spy = mockFetch(503, '{"error":{"status":"UNAVAILABLE"}}');

    const error = await new GeminiProvider().generateResponse(INPUT).catch((e) => e);

    // 최초 1회 + 자동 재시도 2회 = 3회 호출
    expect(spy).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(String(error.message)).toContain('요청이 몰려');
  });

  it('과부하 후 회복되면 정상 응답을 돌려준다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    let call = 0;
    const spy = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'busy' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '{"answers":[{"question_id":"Q1","value":"병원동행"},{"question_id":"Q2","value":3}]}' }],
              },
            },
          ],
        }),
        text: async () => '',
      };
    });
    vi.stubGlobal('fetch', spy);

    const result = await new GeminiProvider().generateResponse(INPUT);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(validateLLMResponse(result.text, QUESTIONS).ok).toBe(true);
  });

  it('429 는 서버가 알려준 시간만큼 기다린 뒤 다시 시도한다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const spy = mockFetch(429, '{"error":{"code":429},"retryDelay": "2s"}');

    vi.useFakeTimers();
    const pending = new GeminiProvider().generateResponse(INPUT).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await pending;
    vi.useRealTimers();

    // 최초 1회 + 대기 후 재시도 2회
    expect(spy).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(2000);
    expect(String((error as Error).message)).toContain('분당 최대 호출 수');
  });

  it('대기 시간이 너무 길면 기다리지 않고 바로 재시도 가능한 오류로 넘긴다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const spy = mockFetch(429, '{"retryDelay": "600s"}');

    const error = await new GeminiProvider().generateResponse(INPUT).catch((e) => e);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(600_000);
  });

  it('404 는 모델명 안내 메시지를 준다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockFetch(404, 'not found');
    await expect(new GeminiProvider().generateResponse({ ...INPUT, model: 'gemini-flash-3.7' })).rejects.toThrow(
      /gemini-flash-3\.7.*찾을 수 없습니다/
    );
  });

  it('잘못된 키는 안내 메시지를 준다', async () => {
    process.env.GEMINI_API_KEY = 'bad-key';
    mockFetch(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}');
    await expect(new GeminiProvider().generateResponse(INPUT)).rejects.toThrow(/API Key 가 올바르지 않습니다/);
  });

  it('안전 필터로 차단되면 이유를 알려준다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockFetch(200, { promptFeedback: { blockReason: 'SAFETY' } });
    await expect(new GeminiProvider().generateResponse(INPUT)).rejects.toThrow(/SAFETY/);
  });

  it('본문이 비면 finishReason 을 포함해 실패로 처리한다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockFetch(200, { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] });
    const error = await new GeminiProvider().generateResponse(INPUT).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(String(error.message)).toContain('MAX_TOKENS');
  });
});
