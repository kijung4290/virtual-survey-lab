import { buildUserPrompt } from '@/lib/ai/prompts/surveyPrompt';
import {
  ProviderError,
  RateLimitError,
  type LLMProvider,
  type LLMRawResult,
  type SurveyPromptInput,
  type TextPromptInput,
} from '@/lib/ai/types';

/**
 * Google Gemini Provider (Generative Language API, REST).
 *
 * API Key 는 서버 환경변수(GEMINI_API_KEY 또는 GOOGLE_API_KEY)에서만 읽으며
 * 브라우저로 전달되거나 DB 에 저장되지 않는다.
 *
 * 모델명은 계정/버전에 따라 달라질 수 있으므로 실행 화면에서 직접 입력할 수도 있다.
 * 사용 가능한 모델은 아래로 확인할 수 있다.
 *   GET https://generativelanguage.googleapis.com/v1beta/models  (헤더: x-goog-api-key)
 */

/**
 * 기본 후보 목록. 계정·시점에 따라 사용 가능한 모델이 다르므로
 * 실행 화면의 "사용 가능한 모델 목록 불러오기" 로 실제 목록을 확인하는 것이 정확하다.
 */
/** 429 를 만났을 때 provider 내부에서 기다렸다가 다시 시도하는 횟수 */
const GEMINI_RATE_LIMIT_RETRIES = 2;
/** 한 번에 기다릴 수 있는 최대 시간(이보다 길면 배치 쪽에 넘겨 나중에 재개한다) */
const GEMINI_MAX_WAIT_MS = 65_000;

export const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

/**
 * 429/503 응답에서 재시도 대기 시간을 읽는다.
 * Gemini 는 본문의 RetryInfo(`"retryDelay": "31s"`)나 Retry-After 헤더로 알려준다.
 */
export function parseRetryDelayMs(body: string, headers?: Headers): number | undefined {
  const header = headers?.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }

  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (match) return Math.round(Number(match[1]) * 1000);

  return undefined;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { message?: string; status?: string };
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini';
  readonly label = 'Google Gemini';

  private apiKey(): string | undefined {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  }

  isReady(): boolean {
    return Boolean(this.apiKey());
  }

  async generateText(input: TextPromptInput): Promise<LLMRawResult> {
    return this.call({
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens ?? 6000,
    });
  }

  async generateResponse(input: SurveyPromptInput): Promise<LLMRawResult> {
    return this.call({
      systemPrompt: input.systemPrompt,
      userPrompt: buildUserPrompt(input),
      model: input.model,
      temperature: input.temperature,
      maxTokens: 4000,
    });
  }

  private async call(input: TextPromptInput): Promise<LLMRawResult> {
    const started = Date.now();
    const apiKey = this.apiKey();
    if (!apiKey) {
      throw new ProviderError('GEMINI_API_KEY 가 설정되지 않았습니다. .env 파일을 확인하세요.');
    }

    const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(
      /\/$/,
      ''
    );
    const model = (input.model || 'gemini-2.5-flash').replace(/^models\//, '');

    // 2.5 이상 계열은 기본적으로 내부 추론(thinking)을 사용한다.
    // 설문 응답은 단순·대량 작업이라 기본적으로 끄고, 필요하면 환경변수로 조정한다.
    const thinkingBudget = process.env.GEMINI_THINKING_BUDGET;
    const useThinkingConfig = /^gemini-(2\.5|3)/.test(model);

    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }],
        generationConfig: {
          temperature: input.temperature,
          responseMimeType: 'application/json',
          maxOutputTokens: input.maxTokens ?? 4000,
          ...(useThinkingConfig
            ? { thinkingConfig: { thinkingBudget: thinkingBudget === undefined ? 0 : Number(thinkingBudget) } }
            : {}),
        },
      }),
    };

    // 503(UNAVAILABLE)은 모델에 요청이 몰릴 때 나는 일시적 오류라 짧게 기다렸다가 다시 시도한다.
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    let res = await fetch(url, request);
    for (let attempt = 1; attempt <= 2 && (res.status === 503 || res.status === 500); attempt++) {
      await new Promise((r) => setTimeout(r, attempt * 1500));
      res = await fetch(url, request);
    }

    if (res.status === 503 || res.status === 500) {
      throw new RateLimitError(
        `Gemini 모델 "${model}" 에 요청이 몰려 응답하지 못했습니다(${res.status}). 잠시 후 "실패·미완료 다시 실행" 으로 이어서 진행하거나, 다른 모델을 선택하세요.`
      );
    }

    // 429(호출 한도)는 서버가 알려준 시간만큼 기다렸다가 다시 시도한다.
    // 무료 등급은 분당 호출 수 제한이 낮아 대기 후 재시도하면 대부분 성공한다.
    for (let attempt = 1; attempt <= GEMINI_RATE_LIMIT_RETRIES && res.status === 429; attempt++) {
      const body = await res.clone().text();
      const delay = parseRetryDelayMs(body, res.headers) ?? attempt * 20_000;
      if (delay > GEMINI_MAX_WAIT_MS) break;
      await new Promise((r) => setTimeout(r, delay));
      res = await fetch(url, request);
    }

    if (res.status === 429) {
      const body = await res.text();
      const retryAfterMs = parseRetryDelayMs(body, res.headers);
      const waitHint = retryAfterMs ? ` 약 ${Math.ceil(retryAfterMs / 1000)}초 뒤에 다시 시도할 수 있습니다.` : '';
      throw new RateLimitError(
        `Gemini 호출 한도(분당/일일)에 도달했습니다.${waitHint} 실행 화면에서 "분당 최대 호출 수"를 낮추거나 동시 실행 수를 줄여보세요.`,
        retryAfterMs
      );
    }

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) {
        throw new ProviderError(
          `Gemini 모델 "${model}" 을(를) 찾을 수 없습니다(404). 모델명을 확인하세요. 예: gemini-2.5-flash`
        );
      }
      if (res.status === 400 && /API key not valid/i.test(body)) {
        throw new ProviderError('Gemini API Key 가 올바르지 않습니다(400). .env 의 GEMINI_API_KEY 를 확인하세요.');
      }
      throw new ProviderError(`Gemini API 오류 (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as GeminiResponse;

    if (json.promptFeedback?.blockReason) {
      throw new ProviderError(`Gemini 가 요청을 차단했습니다: ${json.promptFeedback.blockReason}`);
    }

    const candidate = json.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');

    if (!text) {
      const reason = candidate?.finishReason ?? '알 수 없음';
      throw new ProviderError(
        `Gemini 응답 본문이 비어 있습니다 (finishReason: ${reason}). 출력 길이 제한이나 안전 필터를 확인하세요.`
      );
    }

    return {
      text,
      model,
      modelVersion: json.modelVersion ?? model,
      latencyMs: Date.now() - started,
    };
  }
}
