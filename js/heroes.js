// 角色設定：名稱、稱號、武器與數值都可以直接在這裡修改。
// weapon: sword 劍 / spear 槍 / blade 大刀 / mace 錘 / bow 弓 / magic 術
export const HEROES = [
  { id: '0001', name: '雙劍犬君', title: '仁德之主', weapon: 'sword', hp: 1100, atk: 1.0, spd: 1.05, color: '#7be07b', desc: '雙劍連斬，出手快、連段長，最容易上手。' },
  { id: '0002', name: '蛇矛猛犬', title: '萬夫莫敵', weapon: 'spear', hp: 1300, atk: 1.15, spd: 0.95, color: '#ff6b4a', desc: '長矛突刺距離遠，一吼震退整片敵兵。' },
  { id: '0003', name: '青龍狐將', title: '義薄雲天', weapon: 'blade', hp: 1250, atk: 1.2, spd: 0.95, color: '#3fd48f', desc: '青龍大刀橫掃大範圍，一刀清場。' },
  { id: '0006', name: '白鬚仙師', title: '臥龍妙算', weapon: 'magic', hp: 900, atk: 1.1, spd: 1.0, color: '#9be8ff', desc: '操縱靈氣法球，遠距離爆炸傷害。' },
  { id: '0009', name: '白羽柴犬', title: '一身是膽', weapon: 'spear', hp: 1150, atk: 1.05, spd: 1.15, color: '#5ab8ff', desc: '銀槍快突，七進七出的機動型武將。' },
  { id: '0010', name: '銀鬃白駒', title: '西涼錦將', weapon: 'sword', hp: 1100, atk: 1.05, spd: 1.15, color: '#d9f2ff', desc: '雙劍旋舞，速度極快。' },
  { id: '0013', name: '赤披獅犬', title: '小霸王', weapon: 'spear', hp: 1200, atk: 1.1, spd: 1.05, color: '#ff4a3a', desc: '赤色披風下的猛槍，攻守平衡。' },
  { id: '0014', name: '鐵錘鷹將', title: '惡來', weapon: 'mace', hp: 1400, atk: 1.3, spd: 0.85, color: '#ffb347', desc: '狼牙錘重擊，把敵兵打上天。' },
  { id: '0015', name: '神弓老犬', title: '老當益壯', weapon: 'bow', hp: 1000, atk: 1.0, spd: 1.0, color: '#ffd84a', desc: '百步穿楊，箭矢可貫穿多名敵兵。' },
  { id: '0016', name: '霸王獅君', title: '亂世奸雄', weapon: 'sword', hp: 1200, atk: 1.15, spd: 1.0, color: '#b07bff', desc: '王者之劍，斬擊附帶紫色劍氣。' },
  { id: '0017', name: '金盾雄獅', title: '江東猛獅', weapon: 'spear', hp: 1350, atk: 1.05, spd: 0.95, color: '#ffcc33', desc: '盾槍兼備，耐打的前線武將。' },
  { id: '0019', name: '紫狼射手', title: '疾風神射', weapon: 'bow', hp: 950, atk: 1.05, spd: 1.15, color: '#e08bff', desc: '連射快、跑得快，邊走邊打。' },
  { id: '0020', name: '翠羽孔雀', title: '美周郎', weapon: 'magic', hp: 950, atk: 1.15, spd: 1.05, color: '#3ff0d0', desc: '羽扇召喚烈焰，遠程範圍爆破。' },
  { id: '0021', name: '犀甲戰將', title: '虎癡', weapon: 'blade', hp: 1450, atk: 1.2, spd: 0.85, color: '#7fb2ff', desc: '重甲巨刃，皮粗肉厚。' },
  { id: '0022', name: '河馬巨鎚', title: '暴君', weapon: 'mace', hp: 1500, atk: 1.3, spd: 0.8, color: '#ff8a5c', desc: '最大的錘、最重的一擊。' },
  { id: '0028', name: '江東猛虎', title: '碧眼虎主', weapon: 'sword', hp: 1150, atk: 1.1, spd: 1.05, color: '#4aa8ff', desc: '虎劍連斬，無雙技威力強大。' },
];

// 雜兵
export const TROOPS = [
  { id: '0003', name: '虎貓爪兵', ai: 'melee', hp: 70, dmg: 18, spd: 3.4 },
  { id: '0004', name: '小犬刀兵', ai: 'melee', hp: 55, dmg: 14, spd: 3.8 },
  { id: '0005', name: '兔子彈弓兵', ai: 'ranged', hp: 45, dmg: 14, spd: 3.2 },
  { id: '0007', name: '山羊輜重兵', ai: 'melee', hp: 60, dmg: 12, spd: 3.0 },
  { id: '0008', name: '蛋殼錘兵', ai: 'melee', hp: 65, dmg: 16, spd: 3.0 },
  { id: '0009', name: '黃鴨錘兵', ai: 'melee', hp: 60, dmg: 15, spd: 3.5 },
  { id: '0010', name: '野豬衝鋒兵', ai: 'charger', hp: 110, dmg: 24, spd: 3.0 },
];

export const WEAPONS = {
  sword: { label: '雙劍', range: 2.5, arc: 140, interval: 0.2, dmg: 28, kb: 4, proj: null },
  spear: { label: '長槍', range: 3.6, arc: 70, interval: 0.26, dmg: 32, kb: 5, proj: null },
  blade: { label: '大刀', range: 3.2, arc: 220, interval: 0.32, dmg: 38, kb: 6, proj: null },
  mace: { label: '重錘', range: 2.8, arc: 160, interval: 0.38, dmg: 46, kb: 8, proj: null },
  bow: { label: '弓', range: 16, arc: 0, interval: 0.22, dmg: 26, kb: 3, proj: 'arrow' },
  magic: { label: '法術', range: 12, arc: 0, interval: 0.34, dmg: 30, kb: 4, proj: 'orb' },
};
