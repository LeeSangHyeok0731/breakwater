import type { WeaponType } from './weapons';

export interface SkillDef {
  id: string;
  name: string;
  /** 슬롯에 표시하는 두 글자 약칭 */
  short: string;
  weapon: WeaponType;
  mana: number;
  cooldown: number;
  reqLevel: number;
  /** 스킬 등급: 2 상급, 3 궁극 (없으면 일반) */
  tier?: 2 | 3;
  desc: string;
}

export const SKILL_TIER_NAME: Record<2 | 3, string> = { 2: '상급', 3: '궁극' };

/** 무기 하나의 스킬 슬롯 수 (Q W E A S D F G) */
export const SKILL_SLOTS = 8;

/** 천공 섬광 [초안]: 스킬 id (옛 세이브를 위해 만검귀종 때의 id를 그대로 쓴다), 마나검 한 자루에 드는 처치·타격 수, 최대 자루 */
export const SKY_FLASH_ID = 'sword_thousand_blades';
export const SKY_STACKS_PER_BLADE = 10;
export const SKY_MAX_BLADES = 30;
/**
 * 탄검강 [초안]: 최대 마나 SKY_MANA_BASE까지는 한 발에 마나 5, 힘의 80%.
 * 그보다 최대 마나가 크면 한 발의 마나는 배수에서 늘어난 몫의 SKY_COST_GROWTH만큼 커지고,
 * 피해는 배수의 SKY_POWER_EXP 제곱만큼 커진다. 마나를 키울수록 발 수와 한 발 피해가 함께 는다.
 */
export const SKY_SHOT_MANA = 5;
const SKY_SHOT_STR = 0.8;
const SKY_MANA_BASE = 300;
const SKY_POWER_EXP = 1.3;
const SKY_COST_GROWTH = 0.7;

function skyScale(maxMp: number): number {
  return Math.max(1, maxMp / SKY_MANA_BASE);
}

/** 최대 마나에 따른 탄검강 한 발의 마나 */
export function skyShotMana(maxMp: number): number {
  return Math.round(SKY_SHOT_MANA * (1 + (skyScale(maxMp) - 1) * SKY_COST_GROWTH));
}

/** 최대 마나에 따른 탄검강 한 발의 힘 계수 */
export function skyShotStr(maxMp: number): number {
  return SKY_SHOT_STR * skyScale(maxMp) ** SKY_POWER_EXP;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'sword_whirl',
    name: '회전베기',
    short: '회전',
    weapon: 'sword',
    mana: 20,
    cooldown: 7,
    reqLevel: 1,
    desc: '[선풍] 몸을 돌리며 앞뒤로 네 번 벤다. 타격마다 힘의 75% 피해(총 300%), 적을 1초 기절시킨다.',
  },
  {
    id: 'sword_upper',
    name: '올려베기',
    short: '대공',
    weapon: 'sword',
    mana: 15,
    cooldown: 5,
    reqLevel: 1,
    desc: '[승천] 두 번 빠르게 벤 뒤 하늘로 크게 올려 벤다. 힘의 60%·60%·180% 피해(총 300%). 마지막 일격은 공중의 적까지 닿고 1.2초 기절.',
  },
  {
    id: 'sword_cry',
    name: '전투의 함성',
    short: '함성',
    weapon: 'sword',
    mana: 25,
    cooldown: 30,
    reqLevel: 2,
    desc: '12초 동안 공격력이 30% 증가한다.',
  },
  {
    id: 'sword_sunder',
    name: '약점 베기',
    short: '약점',
    weapon: 'sword',
    mana: 20,
    cooldown: 10,
    reqLevel: 3,
    desc: '[십자] 엇갈려 두 번 베어 X자를 새기고 그 가운데를 찌른다. 힘의 60%·60%·80% 피해(총 200%), 6초 동안 적이 받는 피해가 25% 증가한다.',
  },
  {
    id: 'sword_waves',
    name: '검기 난무',
    short: '검기',
    weapon: 'sword',
    mana: 60,
    cooldown: 20,
    reqLevel: 5,
    desc: '전방으로 검기 12개를 연달아 날린다. 검기마다 힘의 400% 피해를 주고 적을 관통한다.',
  },
  {
    id: 'staff_meteor',
    name: '메테오',
    short: '메테',
    weapon: 'staff',
    mana: 45,
    cooldown: 12,
    reqLevel: 1,
    desc: '조준한 곳에 운석을 떨어뜨린다. 마력의 600% 광역 피해 후, 3초 동안 불타는 장판을 남긴다.',
  },
  {
    id: 'staff_shield',
    name: '마나 보호막',
    short: '보호',
    weapon: 'staff',
    mana: 25,
    cooldown: 18,
    reqLevel: 1,
    desc: '10초 동안 마력의 1000%만큼 피해를 흡수하는 보호막을 두른다.',
  },
  {
    id: 'staff_laser',
    name: '레이저 커팅',
    short: '레이',
    weapon: 'staff',
    mana: 35,
    cooldown: 9,
    reqLevel: 2,
    desc: '1.5초 동안 조준 방향으로 레이저를 뿜는다. 0.1초마다 경로의 모든 적에게 마력의 50% 피해.',
  },
  {
    id: 'staff_frost',
    name: '서리 장판',
    short: '서리',
    weapon: 'staff',
    mana: 25,
    cooldown: 10,
    reqLevel: 2,
    desc: '조준한 곳에 5초 동안 서리 장판을 깐다. 안의 적은 50% 느려지고 0.5초마다 마력의 30% 피해를 받는다.',
  },
  {
    id: 'staff_curse',
    name: '취약의 낙인',
    short: '낙인',
    weapon: 'staff',
    mana: 20,
    cooldown: 12,
    reqLevel: 3,
    desc: '조준한 곳 주변의 적에게 낙인을 새긴다. 6초 동안 받는 피해가 30% 증가한다.',
  },
  {
    id: 'staff_ward',
    name: '마력 방어막',
    short: '방어',
    weapon: 'staff',
    mana: 30,
    cooldown: 25,
    reqLevel: 3,
    desc: '12초 동안 공격 3회를 완전히 막는 방어막을 두른다. 막을 때마다 1회씩 줄어든다.',
  },
  {
    id: 'staff_amp',
    name: '마력 증폭',
    short: '증폭',
    weapon: 'staff',
    mana: 30,
    cooldown: 30,
    reqLevel: 4,
    desc: '10초 동안 주는 피해가 30% 증가한다.',
  },
  {
    id: 'dao_crescent',
    name: '초승달 베기',
    short: '초승',
    weapon: 'dao',
    mana: 18,
    cooldown: 6,
    reqLevel: 1,
    desc: '[만월] 앞뒤로 크게 휘두른 뒤 둥근 달을 그리며 마무리한다. 힘의 70%·70%·80% 피해(총 220%).',
  },
  {
    id: 'dao_skyfall',
    name: '낙월',
    short: '낙월',
    weapon: 'dao',
    mana: 15,
    cooldown: 5,
    reqLevel: 1,
    desc: '[낙월] 뛰어오르며 올려 베고, 달이 떨어지듯 내려찍는다. 힘의 80%+200% 피해(총 280%). 내려찍기는 1초 기절.',
  },
  {
    id: 'dao_hamstring',
    name: '발목 베기',
    short: '발목',
    weapon: 'dao',
    mana: 18,
    cooldown: 8,
    reqLevel: 2,
    desc: '[연환각] 바닥을 쓸 듯 낮게 세 번 벤다. 힘의 60%·60%·80% 피해(총 200%), 4초 동안 이동속도를 50% 낮춘다.',
  },
  {
    id: 'dao_rage',
    name: '투혼',
    short: '투혼',
    weapon: 'dao',
    mana: 25,
    cooldown: 25,
    reqLevel: 3,
    desc: '10초 동안 주는 피해가 25%, 이동속도가 20% 증가한다. (이동속도 상한 없음)',
  },
  {
    id: 'dao_iai',
    name: '발도',
    short: '발도',
    weapon: 'dao',
    mana: 40,
    cooldown: 14,
    reqLevel: 4,
    desc: '눈 깜짝할 사이에 앞으로 9m 돌진하며 경로의 적을 벤다(힘의 100%). 곧이어 지나간 길에 칼바람이 네 번 몰아친다(각 100%, 총 500%). 돌진 중에는 무적.',
  },
  {
    id: 'bow_fan',
    name: '부채 사격',
    short: '부채',
    weapon: 'bow',
    mana: 15,
    cooldown: 5,
    reqLevel: 1,
    desc: '화살 5발을 부채꼴로 쏜다. 화살마다 민첩의 90% + 힘의 40% 피해.',
  },
  {
    id: 'bow_rain',
    name: '화살비',
    short: '화살',
    weapon: 'bow',
    mana: 30,
    cooldown: 12,
    reqLevel: 1,
    desc: '조준한 곳에 2초 동안 화살비를 내린다. 0.25초마다 민첩의 35% + 힘의 15% 피해. 공중의 적도 맞는다.',
  },
  {
    id: 'bow_pierce',
    name: '관통 사격',
    short: '관통',
    weapon: 'bow',
    mana: 20,
    cooldown: 7,
    reqLevel: 2,
    desc: '일직선의 모든 적을 꿰뚫는 화살. 민첩의 250% + 힘의 100% 피해.',
  },
  {
    id: 'bow_haste',
    name: '질풍',
    short: '질풍',
    weapon: 'bow',
    mana: 20,
    cooldown: 20,
    reqLevel: 3,
    desc: '8초 동안 이동속도가 40% 증가하고 장전 시간이 절반이 된다. (이동속도 상한 없음)',
  },
  {
    id: 'bow_mana_arrows',
    name: '마력 화살',
    short: '마화',
    weapon: 'bow',
    mana: 55,
    cooldown: 18,
    reqLevel: 5,
    desc: '마력 화살 12발을 연달아 쏜다. 화살마다 민첩의 100% + 힘의 100% 피해를 주고 적을 관통한다.',
  },
  {
    id: 'gun_rapid',
    name: '속사',
    short: '속사',
    weapon: 'gun',
    mana: 15,
    cooldown: 6,
    reqLevel: 1,
    desc: '탄약을 쓰지 않고 6발을 빠르게 쏜다. 한 발마다 기본 사격의 80% 피해.',
  },
  {
    id: 'gun_grenade',
    name: '수류탄',
    short: '수류',
    weapon: 'gun',
    mana: 20,
    cooldown: 8,
    reqLevel: 1,
    desc: '조준한 곳으로 수류탄을 던진다. 반경 3.5m에 기본 사격의 300% 피해, 0.8초 기절.',
  },
  {
    id: 'gun_snipe',
    name: '저격',
    short: '저격',
    weapon: 'gun',
    mana: 25,
    cooldown: 10,
    reqLevel: 2,
    desc: '잠시 조준한 뒤 일직선의 모든 적을 꿰뚫는 한 발. 기본 사격의 600% 피해.',
  },
  {
    id: 'gun_tactical',
    name: '전술 재장전',
    short: '전술',
    weapon: 'gun',
    mana: 15,
    cooldown: 15,
    reqLevel: 3,
    desc: '즉시 탄창을 가득 채우고, 8초 동안 주는 피해가 30% 증가한다.',
  },
  {
    id: 'gun_barrage',
    name: '탄막',
    short: '탄막',
    weapon: 'gun',
    mana: 50,
    cooldown: 18,
    reqLevel: 5,
    desc: '2초 동안 탄약 없이 30발을 흩뿌린다. 한 발마다 기본 사격의 60% 피해.',
  },
  // ───────────────────────── 상급·궁극 스킬: 화면 전체를 휩쓰는 광역기 ─────────────────────────
  {
    id: 'sword_heaven_cleave',
    name: '천공 일섬',
    short: '천공',
    weapon: 'sword',
    tier: 2,
    mana: 50,
    cooldown: 18,
    reqLevel: 6,
    desc: '검을 크게 그어 화면 끝에서 끝까지 베어 가른다. 화면 안에서 같은 높이에 있는 모든 적에게 힘의 800% 피해.',
  },
  {
    id: 'sword_cross_judgment',
    name: '십자 심판',
    short: '심판',
    weapon: 'sword',
    tier: 2,
    mana: 60,
    cooldown: 24,
    reqLevel: 8,
    desc: '화면 전체에 거대한 X자 참격을 새긴다. 화면 안 모든 적(공중 포함)에게 힘의 500% 피해 두 번, 2초 기절.',
  },
  {
    id: 'sword_thousand_blades',
    name: '천공 섬광',
    short: '섬광',
    weapon: 'sword',
    tier: 3,
    mana: SKY_SHOT_MANA,
    cooldown: 60,
    reqLevel: 10,
    desc: '공중으로 날아올라, 쌓은 처치·타격 10회당 마나검 한 자루(최대 30자루)를 소환한다. 전투는 30자루가 찬 채로 시작한다. 검들이 번갈아 몬스터를 조준해 탄검강을 쏘며, 마나가 바닥날 때까지 이어진다. 탄검강은 직선의 적을 꿰뚫고, 최대 마나 300까지는 한 발에 마나 5를 써서 힘의 80% 피해를 준다. 최대 마나가 그보다 크면 한 발의 마나가 늘고, 피해는 그보다 더 크게 는다. 검이 많을수록 빠르게 쏜다. 시전 중에는 마나가 차지 않는다. 쓰면 쌓은 처치·타격이 모두 사라지고, 탄검강의 타격부터 다시 쌓인다. 한 자루도 없으면 쓸 수 없다.',
  },
  {
    id: 'dao_moon_storm',
    name: '월하 폭풍참',
    short: '월하',
    weapon: 'dao',
    tier: 2,
    mana: 50,
    cooldown: 18,
    reqLevel: 6,
    desc: '거대한 초승달 참격 6개를 앞뒤로 번갈아 날린다. 참격은 화면 끝까지 날아가며 닿는 적마다 힘의 350% 피해.',
  },
  {
    id: 'dao_heaven_fall',
    name: '천붕',
    short: '천붕',
    weapon: 'dao',
    tier: 2,
    mana: 60,
    cooldown: 22,
    reqLevel: 8,
    desc: '하늘 높이 뛰어올라 내려찍는다. 화면 전체의 땅이 갈라지며 땅 위의 모든 적에게 힘의 900% 피해, 2초 기절.',
  },
  {
    id: 'dao_blood_moon',
    name: '혈월 발도',
    short: '발도',
    weapon: 'dao',
    tier: 3,
    mana: 120,
    cooldown: 60,
    reqLevel: 10,
    desc: '키를 누르고 있는 동안 혈월을 끌어올린다 (최대 10초, 걷기·점프는 되지만 공격·구르기는 못 하고 맞을 수 있다). 0.5초마다 게이지가 한 칸 차고, 칸이 찰수록 늘어나는 타수가 커지고 (첫 칸 3타, 이후 두 칸마다 1타씩 더, 20칸이면 150타) 한 타 피해도 칸마다 15%씩 커진다 (힘의 70% → 280%). 키를 떼면 화면 안 모든 적에게 쌓은 만큼 핏빛 참격이 몰아친다. 몰아치는 동안은 맞지 않는다.',
  },
  {
    id: 'bow_sky_burst',
    name: '천궁 산개',
    short: '산개',
    weapon: 'bow',
    tier: 2,
    mana: 45,
    cooldown: 16,
    reqLevel: 6,
    desc: '하늘로 쏘아 올린 화살이 정점에서 30발로 갈라져 화면 전체에 쏟아진다. 화살마다 민첩의 220% + 힘의 80% 피해.',
  },
  {
    id: 'bow_meteor_arrow',
    name: '유성 화살',
    short: '유성',
    weapon: 'bow',
    tier: 2,
    mana: 55,
    cooldown: 20,
    reqLevel: 8,
    desc: '빛나는 화살 3발이 화면에서 가장 강한 적 셋을 쫓아가 폭발한다. 폭발마다 주변 적에게 민첩의 700% + 힘의 300% 피해.',
  },
  {
    id: 'bow_aurora',
    name: '별사냥',
    short: '별',
    weapon: 'bow',
    tier: 3,
    mana: 110,
    cooldown: 55,
    reqLevel: 10,
    desc: '오로라가 하늘을 덮고 6초 동안 별사냥이 열린다. 그동안 활로 같은 적을 맞힐수록 새겨지는 별이 1개씩 더 늘어난다 (1대 1개, 2대 3개, 3대 6개 …, 상한 없음). 끝나면 별마다 별똥별이 떨어져 민첩의 150% + 힘의 50% 피해를 준다.',
  },
  {
    id: 'gun_ricochet',
    name: '도탄 난사',
    short: '도탄',
    weapon: 'gun',
    tier: 2,
    mana: 45,
    cooldown: 16,
    reqLevel: 6,
    desc: '탄환 4발이 적에서 적으로 튕기며 각각 최대 8마리를 맞힌다. 맞힐 때마다 기본 사격의 150% 피해.',
  },
  {
    id: 'gun_airstrike',
    name: '포격 요청',
    short: '포격',
    weapon: 'gun',
    tier: 2,
    mana: 60,
    cooldown: 24,
    reqLevel: 8,
    desc: '신호탄을 쏘아 올리면 화면 안 모든 적의 머리 위로 포탄이 떨어진다. 포탄마다 기본 사격의 500% 범위 피해.',
  },
  {
    id: 'gun_dead_eye',
    name: '황금 탄환',
    short: '황금',
    weapon: 'gun',
    tier: 3,
    mana: 100,
    cooldown: 50,
    reqLevel: 10,
    desc: '세상이 느려지고 황금 탄환 8발을 쏜다. 발마다 적 하나에 조준 원이 줄어들고, 원이 가운데 고리에 닿을 때 공격키를 누르면 PERFECT (기본 사격의 1500% + 가까운 적 둘에게 절반 도탄), 조금 이르면 GOOD (800%), 너무 이르거나 놓치면 400%. GOOD마다 서브 총 1개, PERFECT마다 2개가 생겨 이후 발마다 함께 쏘고 (각 300%), 마지막에 일제 사격한다. 쏘는 동안은 맞지 않는다.',
  },
  {
    id: 'staff_chain_lightning',
    name: '연쇄 번개',
    short: '연쇄',
    weapon: 'staff',
    tier: 2,
    mana: 45,
    cooldown: 14,
    reqLevel: 6,
    desc: '번개가 최대 10마리의 적을 잇따라 꿰뚫는다. 적마다 마력의 600% 피해.',
  },
  {
    id: 'staff_blizzard',
    name: '블리자드',
    short: '눈보',
    weapon: 'staff',
    tier: 2,
    mana: 70,
    cooldown: 26,
    reqLevel: 8,
    desc: '4초 동안 화면 전체에 눈보라가 몰아친다. 0.4초마다 화면 안 모든 적에게 마력의 80% 피해, 이동속도 60% 감소.',
  },
  {
    id: 'staff_armageddon',
    name: '룬 아마겟돈',
    short: '룬',
    weapon: 'staff',
    tier: 3,
    mana: 130,
    cooldown: 70,
    reqLevel: 10,
    desc: '머리 위에 뜨는 방향 룬과 같은 방향키를 누를 때마다 운석이 떨어진다 (마력의 350%). 틀리거나 4.5초가 지나거나 룬 12개를 채우면 영창이 끝나고, 화면 안 모든 적에게 대폭발 (마력의 200% + 룬 하나당 100%). 영창하는 동안은 맞지 않는다.',
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** 무기를 처음 얻을 때부터 배워져 있는 기본 스킬 (초기화해도 남는다) */
export const STARTER_SKILLS = [
  'sword_whirl',
  'sword_upper',
  'staff_meteor',
  'staff_shield',
  'dao_crescent',
  'dao_skyfall',
  'bow_fan',
  'bow_rain',
  'gun_rapid',
  'gun_grenade',
];

export function skillsFor(type: WeaponType): SkillDef[] {
  return SKILLS.filter((s) => s.weapon === type);
}

/** 스킬들을 슬롯 수만큼씩 장으로 나눈다. 모자란 칸은 null이다. */
export function chunkSkills(skills: SkillDef[]): (SkillDef | null)[][] {
  const pages: (SkillDef | null)[][] = [];
  for (let i = 0; i < skills.length; i += SKILL_SLOTS) {
    const page: (SkillDef | null)[] = skills.slice(i, i + SKILL_SLOTS);
    while (page.length < SKILL_SLOTS) page.push(null);
    pages.push(page);
  }
  return pages;
}
