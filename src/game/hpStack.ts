/** 겹친 체력바의 줄 색 (위에서 아래로 넘어가며 돌아간다) */
export const STACK_COLORS = [0xe53935, 0xff8a1a, 0xf6c445, 0x5ac85a, 0x3fa8ff, 0x9a6aff];

/** 체력바 한 줄의 체력 [초안]. 최대 체력이 이보다 크면 줄을 겹쳐 그린다. */
export const HP_PER_BAR = 1000;
/** 마지막 줄 아래에 보이는 빈 바탕 */
const EMPTY = 0x1a1214;

export interface HpStack {
  /** 남은 줄 수 */
  left: number;
  /** 지금 줄의 남은 비율 0..1 */
  ratio: number;
  color: number;
  under: number;
}

export function isStacked(maxHp: number): boolean {
  return maxHp > HP_PER_BAR;
}

/** 지금 체력을 줄로 나눈다. 마지막 줄은 언제나 빨강이다. */
export function hpStack(hp: number): HpStack {
  const left = Math.max(1, Math.ceil(hp / HP_PER_BAR));
  const ratio = Math.max(0, hp - (left - 1) * HP_PER_BAR) / HP_PER_BAR;
  return {
    left,
    ratio,
    color: STACK_COLORS[(left - 1) % STACK_COLORS.length],
    under: left > 1 ? STACK_COLORS[(left - 2) % STACK_COLORS.length] : EMPTY,
  };
}
