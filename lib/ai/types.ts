import type { SurveyQuestion } from '@/lib/types';

/** LLM 에 넘기는 입력 (특정 회사 SDK 에 종속되지 않는 중립 형태) */
export interface SurveyPromptInput {
  respondentId: string;
  /** 구조화 필드 블록 */
  personaFields: string;
  personaSummary: string;
  questions: SurveyQuestion[];
  systemPrompt: string;
  temperature: number;
  model: string;
  /** 재시도 시 직전 오류를 알려 교정 유도 */
  repairHint?: string;
}

export interface LLMRawResult {
  /** 모델이 만든 원문 텍스트 */
  text: string;
  model: string;
  modelVersion?: string;
  latencyMs: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly label: string;
  /** API Key 등 실행 준비가 되었는지 */
  isReady(): boolean;
  generateResponse(input: SurveyPromptInput): Promise<LLMRawResult>;
}

export class RateLimitError extends Error {
  /** 서버가 알려준 재시도 대기 시간(ms). 모르면 undefined */
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}
