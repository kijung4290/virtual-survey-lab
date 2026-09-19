/**
 * 의존성 없는 CSV 파서/직렬화기.
 * - RFC4180 스타일 따옴표 처리("" 이스케이프)
 * - CRLF/LF 혼용 허용
 * - BOM 제거
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  /** 헤더를 제외한 원시 행(열 순서 유지) */
  matrix: string[][];
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, '');
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      matrix.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // CRLF 의 CR 은 무시한다.
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    matrix.push(row);
  }

  // 완전히 빈 줄 제거
  const cleaned = matrix.filter((r) => r.some((c) => c.trim() !== ''));
  if (cleaned.length === 0) return { headers: [], rows: [], matrix: [] };

  const headers = cleaned[0].map((h) => h.trim());
  const body = cleaned.slice(1);
  const rows = body.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows, matrix: body };
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  // Excel 에서 한글이 깨지지 않도록 BOM 을 붙인다.
  return '﻿' + lines.join('\r\n');
}
