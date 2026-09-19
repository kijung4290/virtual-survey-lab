import { MockLLMProvider } from '@/lib/ai/providers/mock';
import { AnthropicProvider, ANTHROPIC_MODELS } from '@/lib/ai/providers/anthropic';
import { OpenAICompatibleProvider, OPENAI_MODELS } from '@/lib/ai/providers/openai';
import { GeminiProvider, GEMINI_MODELS } from '@/lib/ai/providers/gemini';
import type { LLMProvider } from '@/lib/ai/types';

/** Provider Adapter 레지스트리. 새 provider 는 여기에만 추가하면 된다. */
const REGISTRY: Record<string, () => LLMProvider> = {
  mock: () => new MockLLMProvider(),
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAICompatibleProvider(),
  gemini: () => new GeminiProvider(),
};

export function getProvider(id: string): LLMProvider {
  const factory = REGISTRY[id] ?? REGISTRY.mock;
  return factory();
}

export interface ProviderInfo {
  id: string;
  label: string;
  models: string[];
  ready: boolean;
  /** 목록에 없는 모델명을 직접 입력할 수 있는지 */
  allowCustomModel: boolean;
  /** 준비되지 않은 이유 */
  hint?: string;
}

/** 설정 화면/실행 화면에 표시할 provider 목록 (API Key 값 자체는 절대 반환하지 않는다) */
export function listProviders(): ProviderInfo[] {
  return [
    {
      id: 'mock',
      label: 'Mock (비용 없음 · 테스트용)',
      models: ['mock-deterministic-v1'],
      ready: true,
      allowCustomModel: false,
    },
    {
      id: 'gemini',
      label: 'Google Gemini',
      models: GEMINI_MODELS,
      ready: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      allowCustomModel: true,
      hint:
        process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
          ? undefined
          : '.env 파일에 GEMINI_API_KEY 를 설정하세요.',
    },
    {
      id: 'anthropic',
      label: 'Anthropic Claude',
      models: ANTHROPIC_MODELS,
      ready: Boolean(process.env.ANTHROPIC_API_KEY),
      allowCustomModel: true,
      hint: process.env.ANTHROPIC_API_KEY ? undefined : '.env 파일에 ANTHROPIC_API_KEY 를 설정하세요.',
    },
    {
      id: 'openai',
      label: 'OpenAI 호환 API',
      models: OPENAI_MODELS,
      ready: Boolean(process.env.OPENAI_API_KEY),
      allowCustomModel: true,
      hint: process.env.OPENAI_API_KEY ? undefined : '.env 파일에 OPENAI_API_KEY 를 설정하세요.',
    },
  ];
}

/**
 * 실제 AI Provider 키가 하나도 없으면 "데모 모드"로 본다.
 * 이 경우 앱은 Mock Provider(더미 응답)만으로 전체 기능을 보여준다.
 */
export function isDemoMode(): boolean {
  return !listProviders().some((p) => p.id !== 'mock' && p.ready);
}

/** 사용 가능한(키가 등록된) 실제 Provider 이름 목록 */
export function readyProviderLabels(): string[] {
  return listProviders()
    .filter((p) => p.id !== 'mock' && p.ready)
    .map((p) => p.label);
}

export function defaultProviderId(): string {
  return process.env.DEFAULT_LLM_PROVIDER || 'mock';
}

export function defaultModel(providerId: string): string {
  if (process.env.DEFAULT_LLM_MODEL && providerId === defaultProviderId()) {
    return process.env.DEFAULT_LLM_MODEL;
  }
  if (providerId === 'gemini') return GEMINI_MODELS[0];
  if (providerId === 'anthropic') return ANTHROPIC_MODELS[0];
  if (providerId === 'openai') return OPENAI_MODELS[0];
  return 'mock-deterministic-v1';
}

export type { LLMProvider };
