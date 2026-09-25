// LIMINAL · 穿刺点数据模型 / PLACEMENT POINT MODEL
//
// 当前版本只使用耳朵。未来的唇钉 / 眉钉 / 鼻钉只需要扩展 bodyPart，
// 不需要改动编辑器逻辑，也不需要引入系统预设耳位。
//
// placementPoints 结构：
// {
//   id: "P01",
//   bodyPart: "EAR",       // 未来：LIP / BROW / NOSE
//   region: "耳垂",         // 预置部位标签，仅用于生成默认名称
//   label: "耳垂1",         // 用户可编辑的显示名称
//   status: "existing",     // existing 已有耳洞 | planned 计划穿刺
//   x, y,                   // 画布坐标（跟随耳朵照片一起变换）
// }

export const BODY_PART_EAR = 'EAR'

export const PLACEMENT_STATUS = {
  EXISTING: 'existing',
  PLANNED: 'planned',
}

// 部位标签只是命名参考，不做自动识别。
export const PLACEMENT_REGIONS = ['耳垂', '耳廓', '耳骨', '耳屏', '对耳轮', '耳轮']

export const PLACEMENT_STATUS_LABEL = {
  [PLACEMENT_STATUS.EXISTING]: { zh: '已有', en: 'EXISTING' },
  [PLACEMENT_STATUS.PLANNED]: { zh: '计划', en: 'PLANNED' },
}

export function placementPointId(index) {
  return `P${String(index).padStart(2, '0')}`
}

// 同名部位按已有编号顺延：耳垂1、耳垂2……
export function nextRegionLabel(region, points) {
  let maximum = 0
  for (const point of points) {
    if (point.region !== region) continue
    const match = /(\d+)\s*$/.exec(point.label || '')
    if (match) maximum = Math.max(maximum, Number(match[1]))
  }
  return `${region}${maximum + 1}`
}

export function createPlacementPoint({
  x,
  y,
  index,
  status = PLACEMENT_STATUS.EXISTING,
  region = PLACEMENT_REGIONS[0],
  points = [],
  bodyPart = BODY_PART_EAR,
}) {
  return {
    id: placementPointId(index),
    bodyPart,
    region,
    label: nextRegionLabel(region, points),
    status,
    x,
    y,
  }
}

export function isPlanned(point) {
  return point?.status === PLACEMENT_STATUS.PLANNED
}

// 切换左右耳时，画布背景以照片中心镜像，穿刺点需要一起镜像才不会脱离耳朵。
export function mirrorPointsAcross(points, axisX) {
  return points.map((point) => ({ ...point, x: 2 * axisX - point.x }))
}
