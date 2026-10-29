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
  desc: string;
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
    desc: '제자리에서 두 번 회전하며 주변을 벤다. 타격마다 힘의 150% 피해, 적을 1초 기절시킨다.',
  },
  {
    id: 'sword_upper',
    name: '올려베기',
    short: '대공',
    weapon: 'sword',
    mana: 15,
    cooldown: 5,
    reqLevel: 1,
    desc: '전방을 크게 올려 벤다. 땅에 선 채로 공중의 적까지 닿는다. 힘의 300% 피해, 1.2초 기절.',
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
    desc: '전방을 날카롭게 벤다. 힘의 200% 피해, 6초 동안 적이 받는 피해가 25% 증가한다.',
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
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const STARTER_SKILLS = ['sword_whirl', 'sword_upper', 'staff_meteor', 'staff_shield'];

export function skillsFor(type: WeaponType): SkillDef[] {
  return SKILLS.filter((s) => s.weapon === type);
}
