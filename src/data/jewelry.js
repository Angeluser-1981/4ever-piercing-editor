// 素材是"佩戴素材"，不是商品展示图：透明底、正面视角、只要饰品本身。
// 新增 / 替换素材前请先读 docs/JEWELRY_ASSET_SPEC.md。
import iceSignal from '../assets/jewelry/ice-signal-stud.png'
import pearlStud from '../assets/jewelry/pearl-stud.png'
import crystalWing from '../assets/jewelry/crystal-wing-stud.png'
import silverHoop from '../assets/jewelry/silver-clicker-hoop.png'
import pearlHoop from '../assets/jewelry/pearl-drop-hoop.png'
import doubleChain from '../assets/jewelry/double-star-chain.png'
import iceDrop from '../assets/jewelry/ice-drop-chain.png'
import crystalCuff from '../assets/jewelry/crystal-cuff.png'
import doubleCuff from '../assets/jewelry/double-band-cuff.png'

export const jewelryCategories = [
  { value: 'ALL', zh: '全部', en: 'ALL' },
  { value: 'STUD', zh: '耳钉', en: 'STUD' },
  { value: 'HOOP', zh: '耳环', en: 'HOOP' },
  { value: 'CHAIN', zh: '链饰', en: 'CHAIN' },
  { value: 'CUFF', zh: '耳骨夹', en: 'CUFF' },
]

export const jewelryArchive = [
  { id: 'ice-signal', zh: '冰星信号', en: 'ICE SIGNAL', type: 'STUD', source: iceSignal, size: 104, scale: 0.82 },
  { id: 'pearl-orbit', zh: '珍珠轨道', en: 'PEARL ORBIT', type: 'STUD', source: pearlStud, size: 104, scale: 0.7 },
  { id: 'frost-wing', zh: '霜翼', en: 'FROST WING', type: 'STUD', source: crystalWing, size: 118, scale: 0.72 },
  { id: 'silver-loop', zh: '银色回路', en: 'SILVER LOOP', type: 'HOOP', source: silverHoop, size: 158, scale: 0.78 },
  { id: 'pearl-drop', zh: '珍珠垂环', en: 'PEARL DROP', type: 'HOOP', source: pearlHoop, size: 172, scale: 0.78 },
  { id: 'twin-signal', zh: '双星连线', en: 'TWIN SIGNAL', type: 'CHAIN', source: doubleChain, size: 230, scale: 0.8 },
  { id: 'cold-tear', zh: '冷泪链坠', en: 'COLD TEAR', type: 'CHAIN', source: iceDrop, size: 220, scale: 0.76 },
  { id: 'crystal-arc', zh: '晶体弧线', en: 'CRYSTAL ARC', type: 'CUFF', source: crystalCuff, size: 162, scale: 0.78 },
  { id: 'double-halo', zh: '双重光环', en: 'DOUBLE HALO', type: 'CUFF', source: doubleCuff, size: 174, scale: 0.76 },
]
