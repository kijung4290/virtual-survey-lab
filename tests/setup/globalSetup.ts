import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 통합 테스트용 SQLite 스키마를 준비한다.
 * 개발용 dev.db 와 분리된 tests/.tmp/test.db 를 사용한다.
 */
export default function setup() {
  const root = path.resolve(__dirname, '..', '..');
  const tmpDir = path.join(root, 'tests', '.tmp');
  const dbPath = path.join(tmpDir, 'test.db');

  fs.mkdirSync(tmpDir, { recursive: true });
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);

  const url = `file:${dbPath.replace(/\\/g, '/')}`;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });

  return () => {
    // 테스트 후 DB 파일 정리
    try {
      if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
    } catch {
      // 파일 잠금 등으로 실패해도 테스트 결과에는 영향 없음
    }
  };
}
