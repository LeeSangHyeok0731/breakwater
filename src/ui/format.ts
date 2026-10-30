const UNITS = ['', '만', '억', '조', '경'];

/**
 * 한국식 숫자 표기. 끝자리까지 모두 쓰고, 0인 단위는 뺀다.
 * 12430 → "1만 2430", 123456789 → "1억 2345만 6789", 10200 → "1만 200"
 */
export function koNum(n: number): string {
  let v = Math.round(Math.abs(n));
  if (v === 0) return '0';
  const parts: string[] = [];
  for (let i = 0; v > 0 && i < UNITS.length; i++) {
    // 가장 큰 단위는 남은 값을 통째로 쓴다.
    const chunk = i === UNITS.length - 1 ? v : v % 10000;
    if (chunk > 0) parts.unshift(`${chunk}${UNITS[i]}`);
    v = i === UNITS.length - 1 ? 0 : Math.floor(v / 10000);
  }
  return (n < 0 ? '-' : '') + parts.join(' ');
}
