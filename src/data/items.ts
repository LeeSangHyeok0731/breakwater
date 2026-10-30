export interface MaterialDef {
  name: string;
  desc: string;
}

export const MATERIALS: Record<string, MaterialDef> = {
  bone_shard: { name: '부서진 뼛조각', desc: '좀비에게서 얻는 흔한 재료. 모든 강화에 쓰인다.' },
  mana_crystal: { name: '마력 결정', desc: '마법사가 지니고 다니는 결정. 스태프 강화에 쓰인다.' },
  wing_membrane: { name: '박쥐 날개막', desc: '미니언의 날개 조각. 무기 교환에 쓰인다.' },
  golem_core: { name: '골렘 핵 조각', desc: '골렘의 동력원 파편. 근접 무기 강화에 쓰인다.' },
  elite_sigil: { name: '정예의 증표', desc: '정예 몬스터만 떨어뜨리는 증표. +5 이상 강화에 필요하다.' },
  lord_heart: { name: '군주의 심장석', desc: '보스가 남기는 심장석. 강력한 무기 교환에 쓰인다.' },
  angel_feather: { name: '타락천사의 깃털', desc: '대성당의 망령과 타락천사가 떨어뜨린다. 영웅 무기 교환에 쓰인다.' },
  abyss_shard: { name: '심연의 파편', desc: '마왕성의 몬스터와 심연의 군주가 떨어뜨린다. 전설 무기 교환에 쓰인다.' },
};
