import { NextResponse } from 'next/server';

/**
 * Provider 가 실제로 제공하는 모델 목록 조회.
 * 모델명은 계정·시점에 따라 다르므로, 화면에서 "목록 새로고침"으로 확인할 수 있게 한다.
 * API Key 는 서버에서만 사용하고 응답에 포함하지 않는다.
 */
export async function GET(request: Request) {
  const provider = new URL(request.url).searchParams.get('provider') ?? '';

  try {
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY 가 설정되지 않았습니다.' }, { status: 400 });

      const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(
        /\/$/,
        ''
      );
      const res = await fetch(`${baseUrl}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
      if (!res.ok) {
        return NextResponse.json(
          { error: `모델 목록을 불러오지 못했습니다 (${res.status}): ${(await res.text()).slice(0, 200)}` },
          { status: 502 }
        );
      }
      const json = (await res.json()) as {
        models?: { name?: string; supportedGenerationMethods?: string[] }[];
      };
      const models = (json.models ?? [])
        .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter(Boolean)
        .sort();
      return NextResponse.json({ provider, models });
    }

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY 가 설정되지 않았습니다.' }, { status: 400 });
      const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) {
        return NextResponse.json({ error: `모델 목록 조회 실패 (${res.status})` }, { status: 502 });
      }
      const json = (await res.json()) as { data?: { id?: string }[] };
      const models = (json.data ?? []).map((m) => m.id ?? '').filter(Boolean).sort();
      return NextResponse.json({ provider, models });
    }

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY 가 설정되지 않았습니다.' }, { status: 400 });
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const list = await client.models.list();
      return NextResponse.json({ provider, models: list.data.map((m) => m.id) });
    }

    return NextResponse.json({ provider, models: [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '모델 목록을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}
