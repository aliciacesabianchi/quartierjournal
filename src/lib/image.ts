// Turns a chosen picture into a small square JPEG in the browser (centre crop, 320 px). Redrawing through a canvas also drops
// location and camera data (EXIF), so only the picture itself is uploaded.
export async function squareJpeg(file: File, size = 320): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('type')
  if (file.size > 12 * 1024 * 1024) throw new Error('size')
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#FDF1E3'; ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
  if (!blob) throw new Error('encode')
  return blob
}
