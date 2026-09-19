import type { SurveyQuestion } from '@/lib/types';

/** LLM 에 넘기는 입력 (특정 회사 SDK 에 종속되지 않는 중립 형태) */
/** 실행 목적: 설문 응답 / 문항 이해도 점검 */
export type RunMode = 'answer' | 'comprehension';

export interface SurveyPromptInput {
  respondentId: string;
  /** 기본값 answer */
  mode?: RunMode;
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

/** 설문 응답이 아닌 일반 텍스트 생성(문항 검토 등) 입력 */
export interface TextPromptInput {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly label: string;
  /** API Key 등 실행 준비가 되었는지 */
  isReady(): boolean;
  generateResponse(input: SurveyPromptInput): Promise<LLMRawResult>;
  /**
   * 설문 문항 검토처럼 페르소나가 필요 없는 요청.
   * 구현하지 않은 provider(Mock 등)에서는 undefined 이다.
   */
  generateText?(input: TextPromptInput): Promise<LLMRawResult>;
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
