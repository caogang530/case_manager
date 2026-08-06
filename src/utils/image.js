/** 图片文件 → 节点 image 数据({src: dataURL, width, height})。大图自动压缩。 */

const MAX_WIDTH = 1200
const MAX_RAW_SIZE = 1024 * 1024 // 1MB 以内的原图直接保留

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function fileToImageData(file) {
  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)
  const { naturalWidth: width, naturalHeight: height } = img

  // 小图直接使用原图(保留 PNG 无损)
  if (width <= MAX_WIDTH && file.size <= MAX_RAW_SIZE) {
    return { src: dataUrl, width, height }
  }

  // 大图:等比缩放到 1200 宽,白底 JPEG 0.85
  const ratio = Math.min(1, MAX_WIDTH / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return {
    src: canvas.toDataURL('image/jpeg', 0.85),
    width: canvas.width,
    height: canvas.height,
  }
}
