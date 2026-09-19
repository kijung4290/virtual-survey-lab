#!/usr/bin/env node
/**
 * Parquet → Synthetic Client CSV 변환기
 *
 * NVIDIA Nemotron-Personas-Korea 처럼 Parquet 으로 배포되는 합성 페르소나 데이터를
 * 이 앱이 가져올 수 있는 CSV 로 바꿔준다. (PRD 의 v1.1 항목을 미리 보조 도구로 제공)
 *
 * 사용법:
 *   node scripts/parquet-to-csv.mjs <입력.parquet> [옵션]
 *
 * 옵션:
 *   --out <파일>       출력 CSV 경로 (기본: data/private/personas.csv)
 *   --limit <숫자>     최대 행 수 (기본: 300)
 *   --seed <숫자>      무작위 추출 seed. 지정하면 앞에서부터가 아니라 무작위 표본을 뽑는다.
 *   --columns          컬럼 목록만 출력하고 종료
 *   --min-age <숫자>   해당 나이 이상만 추출 (예: 65)
 *
 * 예시:
 *   node scripts/parquet-to-csv.mjs data/private/nemotron-korea.parquet --columns
 *   node scripts/parquet-to-csv.mjs data/private/nemotron-korea.parquet --limit 300 --min-age 65 --seed 42
 *
 * 주의:
 * - 이 스크립트는 인터넷에서 데이터를 내려받지 않는다. 이미 받아 둔 파일만 변환한다.
 * - 개인 식별정보가 없는 합성 데이터에만 사용한다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';

/** Nemotron 계열에서 자주 쓰이는 컬럼명 → 앱 표준 CSV 헤더 */
const COLUMN_ALIASES = {
  age: ['age', 'age_years', '나이', '연령'],
  sex: ['sex', 'gender', '성별'],
  province: ['province', 'region', 'sido', 'state', '시도'],
  district: ['district', 'city', 'sigungu', '시군구'],
  household_type: ['household_type', 'family_type', 'household', 'marital_household', '가구형태'],
  marital_status: ['marital_status', 'marital', '혼인상태'],
  housing_type: ['housing_type', 'housing', 'residence_type', '주거형태'],
  education_level: ['education', 'education_level', '학력'],
  employment_status: ['occupation', 'employment', 'employment_status', 'job', '직업'],
  economic_status: ['income_level', 'economic_status', 'income', '소득수준'],
  health_status: ['health_status', 'health', '건강상태'],
  mobility_difficulty: ['mobility_difficulty', 'mobility', '이동불편'],
  digital_literacy: ['digital_literacy', 'tech_savviness', 'digital_skill', '디지털활용'],
  social_contact: ['social_contact', 'social_contact_level', 'social_engagement', '사회적접촉'],
  care_need: ['care_need', '돌봄필요'],
  current_service_use: ['current_service_use', 'services', '이용서비스'],
};

/** 개인 식별정보로 의심되는 컬럼은 변환 단계에서 아예 버린다. */
const DROP_PATTERNS = [
  'name',
  'fullname',
  'phone',
  'mobile',
  'email',
  'address',
  'addr',
  'resident',
  'rrn',
  'ssn',
  '이름',
  '성명',
  '전화',
  '주소',
  '이메일',
  '주민',
];

function norm(s) {
  return String(s).trim().toLowerCase().replace(/[\s._-]/g, '');
}

function parseArgs(argv) {
  const args = { input: '', out: 'data/private/personas.csv', limit: 300, seed: null, columns: false, minAge: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--min-age') args.minAge = Number(argv[++i]);
    else if (a === '--columns') args.columns = true;
    else rest.push(a);
  }
  args.input = rest[0] ?? '';
  return args;
}

/** 결정적 난수 (같은 seed = 같은 표본) */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toCsvValue(v) {
  if (v === null || v === undefined) return '';
  let s = Array.isArray(v) ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  s = s.replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** 원본 컬럼 → 앱 표준 헤더 매핑 결정 */
export function resolveHeaderMap(sourceColumns) {
  const map = {};
  const used = new Set();

  for (const [target, aliases] of Object.entries(COLUMN_ALIASES)) {
    const hit = sourceColumns.find((c) => aliases.some((a) => norm(a) === norm(c)) && !used.has(c));
    if (hit) {
      map[hit] = target;
      used.add(hit);
    }
  }

  // 남은 컬럼은 그대로 보존한다(앱에서 사용자 정의 필드가 되거나 직접 매핑 가능).
  for (const c of sourceColumns) {
    if (used.has(c)) continue;
    if (DROP_PATTERNS.some((p) => norm(c).includes(norm(p)))) continue;
    map[c] = c;
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    console.error('사용법: node scripts/parquet-to-csv.mjs <입력.parquet> [--columns] [--limit 300] [--min-age 65] [--seed 42]');
    process.exit(1);
  }
  if (!fs.existsSync(args.input)) {
    console.error(`파일을 찾을 수 없습니다: ${args.input}`);
    process.exit(1);
  }

  console.log(`▶ 읽는 중: ${args.input}`);
  const file = await asyncBufferFromFile(args.input);
  const rows = await parquetReadObjects({ file });

  if (rows.length === 0) {
    console.error('행이 없습니다.');
    process.exit(1);
  }

  const sourceColumns = Object.keys(rows[0]);
  if (args.columns) {
    console.log(`\n컬럼 ${sourceColumns.length}개:`);
    for (const c of sourceColumns) {
      const sample = String(rows[0][c] ?? '').slice(0, 40);
      console.log(`  - ${c}${sample ? `  (예: ${sample})` : ''}`);
    }
    return;
  }

  let filtered = rows;
  if (args.minAge !== null) {
    const ageCol = sourceColumns.find((c) => COLUMN_ALIASES.age.some((a) => norm(a) === norm(c)));
    if (ageCol) {
      filtered = rows.filter((r) => Number(r[ageCol]) >= args.minAge);
      console.log(`  ${args.minAge}세 이상 필터: ${rows.length} → ${filtered.length}행`);
    } else {
      console.warn('  연령 컬럼을 찾지 못해 --min-age 를 건너뜁니다.');
    }
  }

  if (args.seed !== null) {
    const rand = mulberry32(args.seed);
    filtered = [...filtered].sort(() => rand() - 0.5);
  }
  const selected = filtered.slice(0, args.limit);

  const headerMap = resolveHeaderMap(sourceColumns);
  const dropped = sourceColumns.filter((c) => !(c in headerMap));
  const outHeaders = ['id', ...Object.values(headerMap)];

  const lines = [outHeaders.join(',')];
  selected.forEach((row, i) => {
    const values = [`SC${String(i + 1).padStart(4, '0')}`];
    for (const src of Object.keys(headerMap)) values.push(toCsvValue(row[src]));
    lines.push(values.join(','));
  });

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // Excel 한글 깨짐 방지 BOM
  fs.writeFileSync(outPath, '﻿' + lines.join('\r\n'), 'utf8');

  console.log(`\n✔ 저장 완료: ${outPath}`);
  console.log(`  ${selected.length}명 · 컬럼 ${outHeaders.length}개`);
  const mapped = Object.entries(headerMap).filter(([src, t]) => src !== t);
  if (mapped.length) {
    console.log('  표준 속성으로 이름을 바꾼 컬럼:');
    for (const [src, t] of mapped) console.log(`    ${src} → ${t}`);
  }
  if (dropped.length) {
    console.log(`  개인정보 의심으로 제외한 컬럼: ${dropped.join(', ')}`);
  }
  console.log('\n다음 단계: 앱 → Synthetic Clients → CSV 가져오기 에서 이 파일을 올리고 컬럼 매핑을 확인하세요.');
}

// 직접 실행할 때만 동작(테스트에서는 함수만 가져다 쓴다)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('✖ 변환 실패:', error.message);
    process.exit(1);
  });
}
