import Anthropic from '@anthropic-ai/sdk';
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
 * Anthropic Claude Provider.
 *
 * API Key 는 서버 프로세스의 환경변수(.env)에서만 읽는다.
 * 클라이언트 번들로 전달되지 않는다.
 */

export const ANTHROPIC_MODELS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
];

/** 최신 모델군은 temperature 파라미터를 받지 않는다(전달 시 400). */
function supportsTemperature(model: string): boolean {
  return !/^claude-(opus-(5|4-[678])|sonnet-5|fable-5)/.test(model);
}

/** effort(사고 깊이) 옵션을 지원하는 모델군 */
function supportsEffort(model: string): boolean {
  return /^claude-(opus-(5|4-[6789])|sonnet-5|fable-5)/.test(model);
}

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly label = 'Anthropic Claude';

  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new ProviderError('ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env 파일을 확인하세요.');
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  isReady(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async generateText(input: TextPromptInput): Promise<LLMRawResult> {
    return this.call(input);
  }

  async generateResponse(input: SurveyPromptInput): Promise<LLMRawResult> {
    return this.call({
      systemPrompt: input.systemPrompt,
      userPrompt: buildUserPrompt(input),
      model: input.model,
      temperature: input.temperature,
    });
  }

  private async call(input: TextPromptInput): Promise<LLMRawResult> {
    const started = Date.now();
    const client = this.getClient();
    const model = input.model || 'claude-opus-5';

    try {
      const response = await client.messages.create({
        model,
        max_tokens: input.maxTokens ?? 4000,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.userPrompt }],
        // 설문 응답은 단순·대량 작업이므로 사고 비용을 낮춘다.
        ...(supportsEffort(model) ? { output_config: { effort: 'low' as const } } : {}),
        ...(supportsTemperature(model) ? { temperature: input.temperature } : {}),
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      if (response.stop_reason === 'refusal') {
        throw new ProviderError('모델이 응답을 거부했습니다(safety refusal).');
      }

      return {
        text,
        model: response.model ?? model,
        modelVersion: response.model,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new RateLimitError('Anthropic API 호출 한도에 도달했습니다.');
      }
      if (error instanceof Anthropic.APIError) {
        throw new ProviderError(`Anthropic API 오류 (${error.status}): ${error.message}`);
      }
      throw error;
    }
  }
}
