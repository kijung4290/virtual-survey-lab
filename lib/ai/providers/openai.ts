import { buildUserPrompt } from '@/lib/ai/prompts/surveyPrompt';
import {
  ProviderError,
  RateLimitError,
  type LLMProvider,
  type LLMRawResult,
  type SurveyPromptInput,
} from '@/lib/ai/types';

/**
 * OpenAI 호환 Chat Completions Provider.
 *
 * 공식 OpenAI 뿐 아니라 동일 규격을 제공하는 로컬 LLM/프록시(OPENAI_BASE_URL)도 사용할 수 있다.
 * API Key 는 서버 환경변수에서만 읽는다.
 */

export const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'];

interface ChatCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = 'openai';
  readonly label = 'OpenAI 호환 API';

  isReady(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async generateResponse(input: SurveyPromptInput): Promise<LLMRawResult> {
    const started = Date.now();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderError('OPENAI_API_KEY 가 설정되지 않았습니다. .env 파일을 확인하세요.');
    }
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: input.model || 'gpt-4o-mini',
        temperature: input.temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: buildUserPrompt(input) },
        ],
      }),
    });

    if (res.status === 429) {
      throw new RateLimitError('OpenAI 호환 API 호출 한도에 도달했습니다.');
    }
    if (!res.ok) {
      const body = await res.text();
      throw new ProviderError(`OpenAI 호환 API 오류 (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as ChatCompletionResponse;
    const text = json.choices?.[0]?.message?.content ?? '';
    if (!text) throw new ProviderError('응답 본문이 비어 있습니다.');

    return {
      text,
      model: json.model ?? input.model,
      modelVersion: json.model,
      latencyMs: Date.now() - started,
    };
  }
}
