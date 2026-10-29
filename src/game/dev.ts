/** 개발자 모드 치트 상태. 세이브에 저장하지 않으며 새로고침하면 초기화된다. */
export const dev = {
  /** 피해를 받지 않는다 */
  god: false,
  /** 마나가 줄지 않는다 */
  infiniteMp: false,
  /** 스킬 쿨타임이 없다 */
  noCooldown: false,
  /** 모든 공격이 적을 한 방에 처치한다 */
  oneHit: false,
  /** 주는 피해 배율 */
  damageMul: 1,
  /** 새로 나오는 몬스터의 체력 배율 */
  monsterHpMul: 1,
};
