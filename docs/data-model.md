# 데이터 구조 설명

로컬 SQLite(`prisma/dev.db`)에 저장되는 데이터 구조입니다. 정의 원본은 `prisma/schema.prisma` 입니다.
SQLite에는 배열·객체를 담을 수 없으므로 JSON은 **문자열로 저장**하고, 서비스 레이어에서 파싱합니다.

## 전체 관계

```
Project
 ├─ ClientDataset (버전별)  ─── SyntheticClient
 ├─ Survey (버전별)
 ├─ SurveyRun ───────────── SurveyResponse ── (client)
 ├─ ActualDataset ───────── ActualResponse
 ├─ ComparisonReport (run × actualDataset)
 └─ AuditLog
```

## 모델별 설명

### Project
조사 단위. 이름, 설명, 조사 대상(`targetPopulation`)을 가집니다.

### ClientDataset
가상 이용자 패널 묶음. `name` + `version` 조합으로 버전을 관리합니다.

| 필드 | 설명 |
| --- | --- |
| `version` | 같은 이름으로 다시 만들면 자동 증가 |
| `sourceMeta` | JSON. `base_source`, `welfare_distribution_source`, `generation_method`, `notes` |
| `clientCount` | 소속 Synthetic Client 수 |
| `locked` | 설문 실행에 한 번이라도 사용되면 true (수정 시 새 버전 사용을 유도) |

### SyntheticClient
가상 이용자 1명. 실제 인물과 연결되지 않으며 식별정보를 담지 않습니다.

- 고정 속성: `age`, `sex`, `province`, `district`, `householdType`, `maritalStatus`, `housingType`,
  `educationLevel`, `employmentStatus`, `economicStatus`, `healthStatus`, `mobilityDifficulty`,
  `digitalLiteracy`, `socialContactLevel`, `careNeed`
- `currentServiceUse`: JSON 문자열 배열
- `attributes`: 매핑되지 않은 사용자 정의 필드(JSON)
- `personaSummary`: 구조화 필드만으로 생성한 규칙 기반 요약. LLM이 아니라 `lib/clients/persona.ts` 가 생성하며,
  제공되지 않은 정보(질병·성격·감정)를 만들지 않습니다.
- `sourceType`: `imported` | `generated` | `manual`

### Survey
설문지. 수정 시 새 레코드(새 `version`)를 만들고 `lineageId` 로 같은 계보를 묶습니다.
아직 실행된 적 없는 버전은 그 자리에서 수정합니다.

`questions` 는 아래 형태의 JSON 배열입니다.

```jsonc
{
  "id": "Q1",
  "type": "single_choice",      // single_choice | multi_choice | scale_5 | number | open_text
  "question": "가장 참여하고 싶은 프로그램은?",
  "options": ["병원동행", "건강걷기"],
  "maxSelections": 3,            // multi_choice
  "scaleLabels": ["...", "...", "...", "...", "..."], // scale_5 (내부 저장값은 1~5)
  "min": 0, "max": 10, "unit": "회",                  // number
  "required": true,
  "condition": { "questionId": "Q2", "operator": "lte", "value": 2 } // 조건부 표시
}
```

`operator`: `eq` | `neq` | `lte` | `gte` | `includes`

### SurveyRun
한 번의 배치 실행. **재현성을 위해 실행 당시 설정을 모두 스냅샷으로 저장합니다.**

| 필드 | 설명 |
| --- | --- |
| `modelProvider`, `modelName`, `modelVersion` | 사용한 AI |
| `temperature` | 요청에 사용한 값 |
| `systemPrompt` | 실행 당시 System Prompt 원문 |
| `promptTemplateVersion` | 프롬프트 템플릿 버전(`v1`) |
| `surveyVersion`, `clientDatasetVersion` | 실행 당시 버전 |
| `segmentFilter` | 대상 한정 조건(JSON) |
| `repeatIndex`, `batchKey` | 반복 실행 회차와 묶음 키 |
| `status` | `PENDING` / `RUNNING` / `SUCCESS` / `FAILED` / `CANCELLED` |
| `totalCount`, `completedCount`, `failedCount` | 진행률 |

### SurveyResponse
응답자 1명의 응답 1건. `runId + clientId` 가 고유합니다.

- `status`: `PENDING` / `RUNNING` / `SUCCESS` / `FAILED` / `INVALID_RESPONSE` / `RATE_LIMITED`
- `answers`: `{"Q1": "병원동행", "Q2": 5, "Q6": ["식사 지원", "이동·차량 지원"]}` (JSON)
- `rawOutput`: 모델 원문(최대 8000자). 형식 오류 원인 추적용
- `attempts`: 시도 횟수(최초 1회 + 최대 2회 재시도)
- `latencyMs`: 응답 소요 시간

재실행(resume)은 `SUCCESS` 가 아닌 응답만 다시 처리하므로 이미 저장된 응답은 보존됩니다.

### ActualDataset / ActualResponse
실제(사람) 조사 결과. **로컬에만 저장하며 외부 LLM으로 전송하지 않습니다.**
업로드 시 개인정보 의심 컬럼이 있으면 차단합니다.
`columnMap` 은 CSV 컬럼 → 문항 ID 매핑(JSON)이며 `__respondent_id__` 는 응답자 식별번호를 뜻합니다.

### ComparisonReport
Synthetic 실행 × 실제 조사 데이터의 비교 결과.

- `result`: 계산 결과 JSON (문항별 비율 차이(%p), 순위, MAE, Spearman 상관, 척도 평균 차이, 주관식 키워드 비교)
- `narrative`: 규칙 기반 해석 문구. 인과관계를 주장하지 않도록 고정 문장 틀을 사용합니다.

### AuditLog
프로젝트/데이터셋/설문/실행/실제데이터/비교의 생성·변경·삭제 이력. 연구 재현성 확인용이며
개인정보 감사 로그 수준의 추적은 하지 않습니다. **설정** 화면에서 확인할 수 있습니다.

### AppSetting
앱 기본값 저장용 키-값 테이블. **API 키는 저장하지 않습니다**(환경변수만 사용).

---

## 처리 흐름

1. **가져오기/생성** — `lib/import/csv.ts` 로 파싱 → `lib/privacy/detect.ts` 로 식별정보 검사 →
   `lib/clients/mapping.ts` 또는 `lib/clients/generate.ts` → `ClientDataset` + `SyntheticClient` 저장
2. **실행** — `createRuns()` 가 `SurveyRun` 과 `PENDING` 응답을 만들고,
   `executeRun()` 이 동시 실행 수만큼 워커를 돌려 Provider를 호출합니다.
3. **검증** — 모델 원문에서 JSON을 추출(`extractJsonObject`)하고 문항 스키마로 검증합니다.
   보기와 조금 다른 값은 근접 매칭으로 보정하고, 실패하면 오류 메시지를 힌트로 최대 2회 재시도한 뒤
   `INVALID_RESPONSE` 로 저장합니다.
4. **분석** — `lib/analytics/aggregate.ts` (비율·척도·키워드·세그먼트·안정성)
5. **비교** — `lib/analytics/compare.ts` (%p 차이, 순위 차, MAE, Spearman, 자동 해석 문구)
6. **내보내기** — `lib/services/exportService.ts` (Synthetic Client CSV, Survey JSON, 응답 CSV,
   요약 CSV, 비교 CSV, 실제 응답 CSV, 프로젝트 전체 JSON 백업)

## AI Provider 어댑터

```ts
interface LLMProvider {
  readonly id: string;
  readonly label: string;
  isReady(): boolean;
  generateResponse(input: SurveyPromptInput): Promise<LLMRawResult>;
}
```

핵심 로직은 이 인터페이스에만 의존하므로 특정 회사 SDK에 종속되지 않습니다.
새 Provider는 `lib/ai/providers/` 에 추가하고 `lib/ai/index.ts` 의 레지스트리에 등록하면 됩니다.
