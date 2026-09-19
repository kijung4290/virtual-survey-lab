/**
 * 검증된 카테고리 팔레트 (light surface #ffffff 기준).
 * 슬롯 순서를 고정해서 사용하고, 색을 순환 생성하지 않는다.
 * 채도가 낮은 슬롯이 있으므로 모든 차트는 반드시 표를 함께 제공한다(색만으로 구분 금지).
 */
export const SERIES_COLORS = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
];

export const AXIS_COLOR = '#94a3b8';
export const GRID_COLOR = '#eef2f7';
export const TEXT_PRIMARY = '#111827';
export const TEXT_SECONDARY = '#52514e';

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
