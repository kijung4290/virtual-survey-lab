import { prisma } from '@/lib/db';
import { getProvider } from '@/lib/ai';
import { PROMPT_TEMPLATE_VERSION, DEFAULT_SYSTEM_PROMPT } from '@/lib/ai/prompts/surveyPrompt';
import { validateLLMResponse } from '@/lib/ai/schemas/response';
import { RateLimitError } from '@/lib/ai/types';
import { buildPersonaFields } from '@/lib/clients/persona';
import { allClients } from '@/lib/services/clientDatasetService';
import { getSurvey } from '@/lib/services/surveyService';
import { logAudit } from '@/lib/services/auditService';
import { safeParseJSON } from '@/lib/utils';
import { RECOMMENDED_RPM, type AnswerMap, type PlainClient, type SurveyQuestion } from '@/lib/types';

export { RECOMMENDED_RPM };

/** 설문 실행 설정 (PRD 15장) */
export interface RunConfig {
  projectId: string;
  surveyId: string;
  datasetId: string;
  label?: string;
  provider: string;
  model: string;
  temperature: number;
  repeat: number;
  concurrency: number;
  /** 분당 최대 호출 수 (0 = 제한 없음). 무료 등급 호출 한도 대응 */
  requestsPerMinute?: number;
  /** 대상 인원 상한 (미지정 시 전체) */
  limit?: number;
  /** { field: [허용값...] } 형태의 세그먼트 필터 */
  segmentFilter?: Record<string, string[]>;
  systemPrompt?: string;
}

export const RUN_DEFAULTS = { temperature: 0.3, repeat: 1, concurrency: 5 };

/** 응답 1건당 호출 한도(429)로 다시 시도하는 최대 횟수 */
const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * 호출 속도 조절기.
 *
 * - 분당 최대 호출 수를 넘지 않도록 요청 시작 시점을 순서대로 벌린다.
 * - 한도 오류(429)를 만나면 모든 워커가 함께 쉬도록 일시 정지 시각을 공유한다.
 *   (워커마다 따로 재시도하면 한도를 더 빨리 소진한다)
 */
export class RunThrottle {
  private minIntervalMs: number;
  private nextSlot = 0;
  private pausedUntil = 0;

  /** 한도 오류가 반복되면 이 간격까지 자동으로 느려진다(= 분당 2회) */
  static readonly MAX_INTERVAL_MS = 30_000;

  constructor(requestsPerMinute: number) {
    this.minIntervalMs = requestsPerMinute > 0 ? Math.ceil(60_000 / requestsPerMinute) : 0;
  }

  /**
   * 한도 오류를 만나면 호출 간격을 늘린다.
   * 사용자가 정한 값이 실제 한도보다 빠를 때 스스로 맞춰가기 위한 장치.
   */
  slowDown() {
    const base = this.minIntervalMs > 0 ? this.minIntervalMs : 5_000;
    this.minIntervalMs = Math.min(RunThrottle.MAX_INTERVAL_MS, Math.ceil(base * 1.5));
    return this.minIntervalMs;
  }

  get intervalMs() {
    return this.minIntervalMs;
  }

  /** 요청을 보내기 직전에 호출한다. 필요한 만큼 기다린 뒤 반환된다. */
  async acquire(now = Date.now(), sleep = defaultSleep): Promise<number> {
    const slot = Math.max(now, this.nextSlot, this.pausedUntil);
    this.nextSlot = slot + this.minIntervalMs;
    const wait = slot - now;
    if (wait > 0) await sleep(wait);
    return wait;
  }

  /** 한도 오류 발생 시 전체를 잠시 멈춘다. */
  pause(ms: number, now = Date.now()) {
    this.pausedUntil = Math.max(this.pausedUntil, now + ms);
  }

  get pausedUntilMs() {
    return this.pausedUntil;
  }
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** 세그먼트 필터 적용 */
export function filterClients(clients: PlainClient[], filter?: Record<string, string[]>): PlainClient[] {
  if (!filter || Object.keys(filter).length === 0) return clients;
  return clients.filter((c) =>
    Object.entries(filter).every(([field, values]) => {
      if (!values || values.length === 0) return true;
      if (field === 'age') {
        // ["65-74", "85+"] 형태
        const age = c.age;
        if (age === null || age === undefined) return false;
        return values.some((v) => {
          const range = v.match(/^(\d+)[-~](\d+)$/);
          if (range) return age >= Number(range[1]) && age <= Number(range[2]);
          const plus = v.match(/^(\d+)\+$/);
          if (plus) return age >= Number(plus[1]);
          return String(age) === v;
        });
      }
      const raw = (c as unknown as Record<string, unknown>)[field];
      if (Array.isArray(raw)) return raw.some((x) => values.includes(String(x)));
      return values.includes(String(raw ?? ''));
    })
  );
}

/** 실행 전 예상 호출 수 계산 (PRD 30장 비용 보호) */
export async function estimateRun(config: RunConfig) {
  const clients = filterClients(await allClients(config.datasetId), config.segmentFilter);
  const targets = config.limit ? clients.slice(0, config.limit) : clients;
  const perRun = targets.length;
  return {
    targetCount: perRun,
    repeat: config.repeat,
    estimatedCalls: perRun * config.repeat,
    totalClients: clients.length,
  };
}

/** Run + PENDING 응답 레코드 생성 (아직 LLM 호출은 하지 않는다) */
export async function createRuns(config: RunConfig) {
  const survey = await getSurvey(config.surveyId);
  if (!survey) throw new Error('설문지를 찾을 수 없습니다.');
  if (survey.questions.length === 0) throw new Error('문항이 없는 설문지는 실행할 수 없습니다.');

  const dataset = await prisma.clientDataset.findUnique({ where: { id: config.datasetId } });
  if (!dataset) throw new Error('Synthetic Client 데이터셋을 찾을 수 없습니다.');

  const clients = filterClients(await allClients(config.datasetId), config.segmentFilter);
  const targets = config.limit ? clients.slice(0, config.limit) : clients;
  if (targets.length === 0) throw new Error('조건에 맞는 Synthetic Client 가 없습니다.');

  const batchKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const runs = [];

  for (let i = 1; i <= Math.max(1, config.repeat); i++) {
    const run = await prisma.surveyRun.create({
      data: {
        projectId: config.projectId,
        surveyId: config.surveyId,
        datasetId: config.datasetId,
        label: config.label?.trim() || null,
        modelProvider: config.provider,
        modelName: config.model,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT,
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
        clientDatasetVersion: dataset.version,
        surveyVersion: survey.version,
        segmentFilter: JSON.stringify(config.segmentFilter ?? {}),
        repeatIndex: i,
        batchKey,
        concurrency: Math.max(1, Math.min(20, config.concurrency)),
        requestsPerMinute: Math.max(0, Math.min(600, config.requestsPerMinute ?? 0)),
        status: 'PENDING',
        totalCount: targets.length,
      },
    });

    const CHUNK = 200;
    for (let s = 0; s < targets.length; s += CHUNK) {
      await prisma.surveyResponse.createMany({
        data: targets.slice(s, s + CHUNK).map((c) => ({
          runId: run.id,
          clientId: c.id,
          status: 'PENDING',
        })),
      });
    }

    // 데이터셋 버전이 실행에 사용되었으므로 이후 수정 시 새 버전을 쓰도록 표시
    if (!dataset.locked) {
      await prisma.clientDataset.update({ where: { id: dataset.id }, data: { locked: true } });
    }

    runs.push(run);
    await logAudit('RUN_START', config.projectId, {
      runId: run.id,
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      repeatIndex: i,
      targetCount: targets.length,
    });
  }

  return { runs, batchKey, targetCount: targets.length };
}

/** 중복 실행 방지용 in-process 락 */
const activeRuns = new Set<string>();

export function isRunActive(runId: string) {
  return activeRuns.has(runId);
}

async function processOne(
  runId: string,
  responseId: string,
  client: PlainClient,
  questions: SurveyQuestion[],
  cfg: { provider: string; model: string; temperature: number; systemPrompt: string },
  throttle: RunThrottle
): Promise<{ status: string }> {
  const provider = getProvider(cfg.provider);
  const personaFields = buildPersonaFields(client);

  let attempts = 0;
  let repairHint: string | undefined;
  let lastError = '';
  let rawOutput = '';
  let latency = 0;
  // 한도 오류는 형식 오류와 별도로 센다(한 번만 더 시도한다).
  let rateLimitRetries = 0;

  // 최초 1회 + 최대 2회 재시도 (PRD 14장)
  while (attempts < 3) {
    attempts += 1;
    try {
      await throttle.acquire();
      const result = await provider.generateResponse({
        respondentId: client.localId,
        personaFields,
        personaSummary: client.personaSummary,
        questions,
        systemPrompt: cfg.systemPrompt,
        temperature: cfg.temperature,
        model: cfg.model,
        repairHint,
      });
      rawOutput = result.text;
      latency = result.latencyMs;

      const validation = validateLLMResponse(result.text, questions);
      if (validation.ok) {
        await prisma.surveyResponse.update({
          where: { id: responseId },
          data: {
            status: 'SUCCESS',
            answers: JSON.stringify(validation.answers),
            rawOutput: result.text.slice(0, 8000),
            errorMessage: null,
            attempts,
            latencyMs: latency,
          },
        });
        return { status: 'SUCCESS' };
      }

      lastError = validation.errors.join(' / ');
      repairHint = lastError;
    } catch (error) {
      if (error instanceof RateLimitError) {
        // 모든 워커를 함께 멈춰 한도가 회복될 시간을 준다.
        const waitMs = Math.min(error.retryAfterMs ?? 30_000, 70_000);
        throttle.pause(waitMs);
        // 사용자가 정한 속도가 실제 한도보다 빠르다는 뜻이므로 전체 속도를 낮춘다.
        throttle.slowDown();

        if (rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
          rateLimitRetries += 1;
          attempts -= 1; // 한도 때문에 못 한 시도는 횟수에서 제외
          lastError = error.message;
          continue;
        }

        await prisma.surveyResponse.update({
          where: { id: responseId },
          data: {
            status: 'RATE_LIMITED',
            errorMessage: error.message,
            attempts,
            rawOutput: rawOutput.slice(0, 8000) || null,
          },
        });
        return { status: 'RATE_LIMITED' };
      }
      lastError = error instanceof Error ? error.message : String(error);
      repairHint = undefined;
      // 호출 자체가 실패한 경우는 잠깐 쉬고 재시도
      await new Promise((r) => setTimeout(r, 300 * attempts));
    }
  }

  const finalStatus = rawOutput ? 'INVALID_RESPONSE' : 'FAILED';
  await prisma.surveyResponse.update({
    where: { id: responseId },
    data: {
      status: finalStatus,
      errorMessage: lastError.slice(0, 1000),
      rawOutput: rawOutput.slice(0, 8000) || null,
      attempts,
      latencyMs: latency || null,
    },
  });
  return { status: finalStatus };
}

/**
 * 배치 실행. PENDING / 실패 상태의 응답만 처리하므로 resume 에도 그대로 사용한다.
 * 중단되어도 이미 저장된 응답은 유지된다 (PRD 31장).
 */
export async function executeRun(runId: string): Promise<void> {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);

  try {
    const run = await prisma.surveyRun.findUnique({ where: { id: runId } });
    if (!run) return;

    const survey = await getSurvey(run.surveyId);
    if (!survey) throw new Error('설문지를 찾을 수 없습니다.');

    await prisma.surveyRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', errorMessage: null, completedAt: null },
    });

    const pending = await prisma.surveyResponse.findMany({
      where: {
        runId,
        status: { in: ['PENDING', 'RUNNING', 'FAILED', 'INVALID_RESPONSE', 'RATE_LIMITED'] },
      },
      include: { client: true },
    });

    const cfg = {
      provider: run.modelProvider,
      model: run.modelName,
      temperature: run.temperature,
      systemPrompt: run.systemPrompt,
    };

    // 실행 전체가 공유하는 호출 속도 조절기.
    // 지정하지 않은 실행(과거 기록 포함)은 provider 권장값을 적용해 한도 오류를 예방한다.
    const effectiveRpm =
      run.requestsPerMinute > 0 ? run.requestsPerMinute : (RECOMMENDED_RPM[run.modelProvider] ?? 0);
    const throttle = new RunThrottle(effectiveRpm);

    let cursor = 0;
    const workerCount = Math.max(1, Math.min(20, run.concurrency));

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= pending.length) return;
        const item = pending[index];
        const client: PlainClient = {
          id: item.client.id,
          localId: item.client.localId,
          age: item.client.age,
          sex: item.client.sex,
          province: item.client.province,
          district: item.client.district,
          householdType: item.client.householdType,
          maritalStatus: item.client.maritalStatus,
          housingType: item.client.housingType,
          educationLevel: item.client.educationLevel,
          employmentStatus: item.client.employmentStatus,
          economicStatus: item.client.economicStatus,
          healthStatus: item.client.healthStatus,
          mobilityDifficulty: item.client.mobilityDifficulty,
          digitalLiteracy: item.client.digitalLiteracy,
          socialContactLevel: item.client.socialContactLevel,
          careNeed: item.client.careNeed,
          currentServiceUse: safeParseJSON<string[]>(item.client.currentServiceUse, []),
          attributes: safeParseJSON<Record<string, unknown>>(item.client.attributes, {}),
          personaSummary: item.client.personaSummary,
          sourceType: item.client.sourceType,
          sourceMetadata: {},
        };

        await processOne(runId, item.id, client, survey.questions, cfg, throttle);

        // 진행률 갱신
        const [ok, failed] = await Promise.all([
          prisma.surveyResponse.count({ where: { runId, status: 'SUCCESS' } }),
          prisma.surveyResponse.count({
            where: { runId, status: { in: ['FAILED', 'INVALID_RESPONSE', 'RATE_LIMITED'] } },
          }),
        ]);
        await prisma.surveyRun.update({
          where: { id: runId },
          data: { completedCount: ok, failedCount: failed },
        });
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const [ok, failed] = await Promise.all([
      prisma.surveyResponse.count({ where: { runId, status: 'SUCCESS' } }),
      prisma.surveyResponse.count({
        where: { runId, status: { in: ['FAILED', 'INVALID_RESPONSE', 'RATE_LIMITED'] } },
      }),
    ]);

    await prisma.surveyRun.update({
      where: { id: runId },
      data: {
        status: failed > 0 && ok === 0 ? 'FAILED' : 'SUCCESS',
        completedCount: ok,
        failedCount: failed,
        completedAt: new Date(),
      },
    });

    await logAudit('RUN_COMPLETE', run.projectId, { runId, success: ok, failed });
  } catch (error) {
    await prisma.surveyRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
  } finally {
    activeRuns.delete(runId);
  }
}

/** 실패/미완료 응답만 다시 실행 */
export async function resumeRun(runId: string) {
  const run = await prisma.surveyRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error('실행 기록을 찾을 수 없습니다.');
  await logAudit('RUN_RESUME', run.projectId, { runId });
  void executeRun(runId);
  return run;
}

export async function getRun(runId: string) {
  const run = await prisma.surveyRun.findUnique({
    where: { id: runId },
    include: {
      survey: true,
      dataset: true,
      project: { select: { id: true, name: true } },
    },
  });
  if (!run) return null;
  return {
    ...run,
    questions: safeParseJSON<SurveyQuestion[]>(run.survey.questions, []),
    segmentFilter: safeParseJSON<Record<string, string[]>>(run.segmentFilter, {}),
  };
}

export async function runProgress(runId: string) {
  const run = await prisma.surveyRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      totalCount: true,
      completedCount: true,
      failedCount: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
    },
  });
  if (!run) return null;

  const byStatus = await prisma.surveyResponse.groupBy({
    by: ['status'],
    where: { runId },
    _count: { status: true },
  });

  return {
    ...run,
    active: activeRuns.has(runId),
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count.status])),
  };
}

export async function listRuns(projectId: string) {
  const runs = await prisma.surveyRun.findMany({
    where: { projectId },
    orderBy: { startedAt: 'desc' },
    include: {
      survey: { select: { name: true, version: true } },
      dataset: { select: { name: true, version: true } },
    },
  });
  return runs;
}

/** 분석용 응답 로드 */
export async function loadRunResponses(runId: string) {
  const rows = await prisma.surveyResponse.findMany({
    where: { runId },
    include: { client: true },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map((r) => ({
    clientId: r.clientId,
    localId: r.client.localId,
    status: r.status,
    attempts: r.attempts,
    errorMessage: r.errorMessage,
    rawOutput: r.rawOutput,
    answers: safeParseJSON<AnswerMap>(r.answers, {}),
    client: {
      id: r.client.id,
      localId: r.client.localId,
      age: r.client.age,
      sex: r.client.sex,
      province: r.client.province,
      district: r.client.district,
      householdType: r.client.householdType,
      maritalStatus: r.client.maritalStatus,
      housingType: r.client.housingType,
      educationLevel: r.client.educationLevel,
      employmentStatus: r.client.employmentStatus,
      economicStatus: r.client.economicStatus,
      healthStatus: r.client.healthStatus,
      mobilityDifficulty: r.client.mobilityDifficulty,
      digitalLiteracy: r.client.digitalLiteracy,
      socialContactLevel: r.client.socialContactLevel,
      careNeed: r.client.careNeed,
      currentServiceUse: safeParseJSON<string[]>(r.client.currentServiceUse, []),
      attributes: safeParseJSON<Record<string, unknown>>(r.client.attributes, {}),
      personaSummary: r.client.personaSummary,
      sourceType: r.client.sourceType,
      sourceMetadata: {},
    } as PlainClient,
  }));
}

export async function deleteRun(runId: string) {
  const run = await prisma.surveyRun.findUnique({ where: { id: runId } });
  if (!run) return;
  await prisma.surveyRun.delete({ where: { id: runId } });
  await logAudit('RUN_DELETE', run.projectId, { runId });
}
