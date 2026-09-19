/**
 * 개발·데모용 seed 데이터.
 *
 * 실행: npm run seed
 *
 * 생성 내용 (PRD 45장)
 * - 데모 프로젝트 1개
 * - Synthetic Clients 30명 (분포 기반 결정적 생성)
 * - 데모 설문 6문항
 * - Mock Provider 로 실행한 Synthetic 응답 (2회 반복)
 * - 실제 조사 응답(모의) 50건 + 비교 리포트
 *
 * 실제 로직은 lib/services/demoService.ts 에 있고, 화면의 "데모 데이터 만들기" 버튼도 같은 코드를 쓴다.
 */

import fs from 'node:fs';
import path from 'node:path';

// tsx 로 직접 실행하므로 .env 를 수동으로 읽는다(Next.js 는 자동 로드).
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let value = m[2].trim();
      if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  }
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:./dev.db';
}
loadEnv();

import { prisma } from '../lib/db';
import { createDemoProject } from '../lib/services/demoService';

async function main() {
  console.log('▶ seed 시작');

  const result = await createDemoProject({
    replace: true,
    onProgress: (message) => console.log(`  ${message}`),
  });

  console.log('✔ seed 완료');
  console.log(`   프로젝트: ${result.projectName} (가상 이용자 ${result.clientCount}명)`);
  console.log('   npm run dev 로 서버를 시작한 뒤 http://localhost:3000 에서 확인하세요.');
}

main()
  .catch((error) => {
    console.error('✖ seed 실패:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
