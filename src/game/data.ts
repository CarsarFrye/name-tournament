export const NPC_NAMES = [
  '文家驰', '严鑫', '赵献明', '白雪岩', '魏煜书', '王奕凯', '陈家凯', '李勃衡',
  '王景行', '刘宬希', '刘佳奕', '葛吴', '李俊涛', '许家旺', '翟宇阳', '连薪渊',
  '李子羊', '李瑞泽', '陈志铭', '黄云飞', '宋家晨', '黄小豪', '王家樑', '王浚宇',
  '周明健', '赵博硕', '张炅焱', '甄航', '李鹏飞', '周洪涛', '周家豪', '朱禹涵',
  '赵正汉', '蔡昇阳', '陈熙', '孙海若', '葛佳庆', '缪昕源', '陈一鸣', '李昊林',
  '陈彦叡', '刘秋豪', '刘仕元', '易家兴', '郭宇航', '李昀洲', '杨浩天', '田乐优',
] as const;

export type Trait = 'sound' | 'shape' | 'meaning' | 'recognition';

export const TRAITS: { id: Trait; name: string; short: string; icon: string; color: string }[] = [
  { id: 'sound', name: '音韵节奏', short: '音韵', icon: '♫', color: '#d86645' },
  { id: 'recognition', name: '辨识传播', short: '辨识', icon: '✦', color: '#1e9b83' },
  { id: 'shape', name: '字形结构', short: '字形', icon: '▧', color: '#dc9c29' },
  { id: 'meaning', name: '意涵气质', short: '意涵', icon: '❋', color: '#6a68bb' },
];

export const SCENES = [
  { name: '点名时刻', description: '清晰有记忆点，才不会被叫错。', trait: 'recognition' as Trait, icon: '✦' },
  { name: '朗诵现场', description: '读起来顺口，节奏自然更出彩。', trait: 'sound' as Trait, icon: '♫' },
  { name: '签名展示', description: '落笔有形，结构舒展更占优势。', trait: 'shape' as Trait, icon: '▧' },
  { name: '故事包装', description: '名字的寓意，也能讲出好故事。', trait: 'meaning' as Trait, icon: '❋' },
];

