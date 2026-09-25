export function loadBrowserImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = source
  })
}

/**
 * 素材进入画布前的唯一入口。
 *
 * 现役素材已经是标准 transparent background 佩戴图（背景 alpha=0，主体 alpha≈250），
 * 所以这里刻意不做任何像素处理：任何自动抠色都会削掉金属边缘的抗锯齿。
 * 以后如果确实需要加工（例如统一亮度、统一主体占比），只在函数内部实现，
 * 不改变编辑器与 jewelry.js 的数据结构。
 *
 * 素材本身必须遵守 docs/JEWELRY_ASSET_SPEC.md。
 */
export async function preprocessJewelryImage(source) {
  return loadBrowserImage(source)
}

export function coverCrop(image, targetWidth, targetHeight) {
  const sourceRatio = image.width / image.height
  const targetRatio = targetWidth / targetHeight

  if (sourceRatio > targetRatio) {
    const width = image.height * targetRatio
    return { x: (image.width - width) / 2, y: 0, width, height: image.height }
  }

  const height = image.width / targetRatio
  return { x: 0, y: (image.height - height) / 2, width: image.width, height }
}
