import { describe, expect, it } from 'vitest';
import { RunThrottle } from '@/lib/services/surveyRunService';
import { parseRetryDelayMs } from '@/lib/ai/providers/gemini';

/**
 * 호출 한도(429) 대응 로직 검증.
 * 실제 대기는 하지 않고, 주입한 시계·sleep 으로 계산만 확인한다.
 */

/** 대기 시간을 기록만 하는 sleep */
function recorder() {
  const waits: number[] = [];
  return {
    waits,
    sleep: async (ms: number) => {
      waits.push(ms);
    },
  };
}

describe('RunThrottle (분당 호출 수 제한)', () => {
  it('제한이 없으면 기다리지 않는다', async () => {
    const throttle = new RunThrottle(0);
    const { waits, sleep } = recorder();

    for (let i = 0; i < 5; i++) await throttle.acquire(1_000, sleep);

    expect(waits).toEqual([]);
  });

  it('분당 12회면 호출 간격을 5초로 벌린다', async () => {
    const throttle = new RunThrottle(12);
    const { waits, sleep } = recorder();

    // 같은 시각에 5명의 워커가 동시에 요청해도 순서대로 간격이 생긴다
    for (let i = 0; i < 5; i++) await throttle.acquire(0, sleep);

    expect(waits).toEqual([5000, 10000, 15000, 20000]);
  });

  it('시간이 충분히 지난 뒤에는 다시 즉시 실행된다', async () => {
    const throttle = new RunThrottle(60); // 1초 간격
    const { waits, sleep } = recorder();

    await throttle.acquire(0, sleep);
    await throttle.acquire(10_000, sleep); // 10초 뒤

    expect(waits).toEqual([]);
  });

  it('한도 오류가 나면 모든 워커가 함께 쉰다', async () => {
    const throttle = new RunThrottle(0);
    const { waits, sleep } = recorder();

    throttle.pause(30_000, 1_000);
    await throttle.acquire(1_000, sleep);
    await throttle.acquire(1_000, sleep);

    // 두 워커 모두 정지 해제 시각까지 기다린다
    expect(waits).toEqual([30_000, 30_000]);
    expect(throttle.pausedUntilMs).toBe(31_000);
  });

  it('한도 오류가 반복되면 호출 간격이 자동으로 늘어난다', () => {
    const throttle = new RunThrottle(12); // 5초 간격
    expect(throttle.intervalMs).toBe(5000);
    expect(throttle.slowDown()).toBe(7500);
    expect(throttle.slowDown()).toBe(11250);
  });

  it('제한 없음으로 시작해도 한도 오류가 나면 간격이 생긴다', () => {
    const throttle = new RunThrottle(0);
    expect(throttle.intervalMs).toBe(0);
    expect(throttle.slowDown()).toBe(7500);
  });

  it('간격은 최대 30초를 넘지 않는다', () => {
    const throttle = new RunThrottle(1); // 60초 간격 시도
    for (let i = 0; i < 10; i++) throttle.slowDown();
    expect(throttle.intervalMs).toBe(RunThrottle.MAX_INTERVAL_MS);
  });

  it('더 긴 대기 요청이 오면 그 시각까지 늘어난다', () => {
    const throttle = new RunThrottle(0);
    throttle.pause(10_000, 0);
    throttle.pause(40_000, 0);
    throttle.pause(5_000, 0);
    expect(throttle.pausedUntilMs).toBe(40_000);
  });
});

describe('Gemini 재시도 대기 시간 파싱', () => {
  it('본문의 RetryInfo 를 읽는다', () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '31s' }],
      },
    });
    expect(parseRetryDelayMs(body)).toBe(31_000);
  });

  it('소수점 초도 처리한다', () => {
    expect(parseRetryDelayMs('{"retryDelay": "7.5s"}')).toBe(7_500);
  });

  it('Retry-After 헤더를 우선 사용한다', () => {
    const headers = new Headers({ 'retry-after': '12' });
    expect(parseRetryDelayMs('{"retryDelay": "31s"}', headers)).toBe(12_000);
  });

  it('정보가 없으면 undefined 를 돌려준다', () => {
    expect(parseRetryDelayMs('{"error":{"code":429}}')).toBeUndefined();
    expect(parseRetryDelayMs('')).toBeUndefined();
  });
});
