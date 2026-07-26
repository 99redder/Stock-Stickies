const CARD_WIDTH = 1600
const CARD_HEIGHT = 900
export const YTD_SHARE_CARD_SIZE = { width: CARD_WIDTH, height: CARD_HEIGHT }

const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

const fitText = (ctx, text, maxWidth, startingSize, weight = 800) => {
  let size = startingSize
  do {
    ctx.font = `${weight} ${size}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 4
  } while (size > 44)
  return size
}

const decodeImage = (source, crossOrigin = '') => new Promise((resolve, reject) => {
  const image = new Image()
  image.decoding = 'async'
  if (crossOrigin) image.crossOrigin = crossOrigin
  image.referrerPolicy = 'no-referrer'
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = source
})

const loadImage = async (sources) => {
  const candidates = (Array.isArray(sources) ? sources : [sources]).filter(Boolean)
  for (const source of candidates) {
    let objectUrl = ''
    try {
      if (String(source).startsWith('data:') || String(source).startsWith('blob:')) {
        return await decodeImage(source)
      }
      const response = await fetch(source, {
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      })
      if (!response.ok) throw new Error(`Profile image returned ${response.status}`)
      objectUrl = URL.createObjectURL(await response.blob())
      return await decodeImage(objectUrl)
    } catch {
      try {
        return await decodeImage(source, 'anonymous')
      } catch {
        // Try the next available profile-photo source.
      }
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }
  return null
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const isMobileShareDevice = () => {
  if (navigator.userAgentData?.mobile === true) return true
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
}

const drawBrandMark = (ctx, x, y, size) => {
  roundedRect(ctx, x, y, size, size, size * 0.12)
  ctx.fillStyle = '#111827'
  ctx.fill()
  ctx.lineWidth = size * 0.04
  ctx.strokeStyle = '#00ff9f'
  ctx.stroke()

  ctx.strokeStyle = '#39ff14'
  ctx.lineWidth = size * 0.055
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x + size * 0.14, y + size * 0.66)
  ctx.lineTo(x + size * 0.32, y + size * 0.42)
  ctx.lineTo(x + size * 0.46, y + size * 0.54)
  ctx.lineTo(x + size * 0.68, y + size * 0.24)
  ctx.lineTo(x + size * 0.86, y + size * 0.38)
  ctx.stroke()

  const bars = [
    [0.12, 0.76, 0.16, 0.12, 0.66],
    [0.33, 0.70, 0.16, 0.18, 0.76],
    [0.54, 0.63, 0.16, 0.25, 0.88],
    [0.75, 0.72, 0.12, 0.16, 0.58],
  ]
  bars.forEach(([bx, by, bw, bh, alpha]) => {
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#39ff14'
    ctx.fillRect(x + size * bx, y + size * by, size * bw, size * bh)
  })
  ctx.globalAlpha = 1
}

const drawAvatar = (ctx, image, initials, x, y, size) => {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.clip()
  if (image) {
    const scale = Math.max(size / image.width, size / image.height)
    const width = image.width * scale
    const height = image.height * scale
    ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height)
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size)
    gradient.addColorStop(0, '#5b8cff')
    gradient.addColorStop(1, '#9b5cff')
    ctx.fillStyle = gradient
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = '#ffffff'
    ctx.font = `850 ${Math.round(size * 0.42)}px Inter, ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, x + size / 2, y + size / 2 + 2)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(255,255,255,.28)'
  ctx.stroke()
}

export async function createYtdShareCard({
  year,
  gain,
  returnPercent,
  scopeLabel,
  displayName,
  profilePhoto,
}) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')

  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  background.addColorStop(0, '#071018')
  background.addColorStop(0.55, '#0b1019')
  background.addColorStop(1, '#151022')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  const greenGlow = ctx.createRadialGradient(220, 110, 0, 220, 110, 560)
  greenGlow.addColorStop(0, 'rgba(57,217,138,.22)')
  greenGlow.addColorStop(1, 'rgba(57,217,138,0)')
  ctx.fillStyle = greenGlow
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  const purpleGlow = ctx.createRadialGradient(1450, 790, 0, 1450, 790, 620)
  purpleGlow.addColorStop(0, 'rgba(139,92,246,.22)')
  purpleGlow.addColorStop(1, 'rgba(139,92,246,0)')
  ctx.fillStyle = purpleGlow
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  ctx.strokeStyle = 'rgba(255,255,255,.035)'
  ctx.lineWidth = 1
  for (let x = 0; x <= CARD_WIDTH; x += 80) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, CARD_HEIGHT)
    ctx.stroke()
  }
  for (let y = 0; y <= CARD_HEIGHT; y += 80) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CARD_WIDTH, y)
    ctx.stroke()
  }

  roundedRect(ctx, 62, 62, 1476, 776, 38)
  ctx.fillStyle = 'rgba(8,12,18,.83)'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255,255,255,.12)'
  ctx.stroke()

  drawBrandMark(ctx, 118, 112, 92)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#00ff41'
  ctx.font = '950 47px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  ctx.fillText('STOCK', 232, 151)
  ctx.fillStyle = '#ff2bd6'
  ctx.font = '900 29px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  ctx.fillText('STICKIES', 232, 188)

  const safeName = String(displayName || 'Investor').trim() || 'Investor'
  const initials = safeName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || '?'
  const avatarImage = await loadImage(profilePhoto)
  drawAvatar(ctx, avatarImage, initials, 1262, 116, 82)
  ctx.fillStyle = '#f5f7fa'
  ctx.font = '800 27px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(safeName, 1490, 151)
  ctx.fillStyle = '#8794a7'
  ctx.font = '600 19px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(scopeLabel || 'All Accounts', 1490, 184)

  roundedRect(ctx, 118, 264, 320, 48, 24)
  ctx.fillStyle = 'rgba(57,217,138,.12)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(57,217,138,.34)'
  ctx.stroke()
  ctx.fillStyle = '#72e6ae'
  ctx.font = '850 20px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`${year} YTD PERFORMANCE`, 143, 296)

  const numericGain = Number(gain || 0)
  const gainText = `${numericGain > 0 ? '+' : ''}${new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericGain)}`
  const positive = numericGain >= 0
  ctx.fillStyle = positive ? '#39d98a' : '#ff6b7c'
  fitText(ctx, gainText, 1320, 142, 900)
  ctx.fillText(gainText, 118, 493)

  if (returnPercent != null && Number.isFinite(Number(returnPercent))) {
    const numericPercent = Number(returnPercent)
    const percentText = `${numericPercent > 0 ? '+' : ''}${numericPercent.toFixed(2)}%`
    ctx.font = '850 64px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(percentText, 122, 590)
    const percentWidth = ctx.measureText(percentText).width
    ctx.fillStyle = '#aab6c6'
    ctx.font = '650 24px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('cash-flow-adjusted return', 122 + percentWidth + 32, 584)
  } else {
    ctx.fillStyle = '#aab6c6'
    ctx.font = '650 27px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('Cash-flow-adjusted year-to-date gain', 122, 576)
  }

  const asOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  ctx.fillStyle = '#dce4ef'
  ctx.font = '750 24px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(scopeLabel || 'All Accounts', 122, 690)
  ctx.fillStyle = '#7f8da1'
  ctx.font = '600 20px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(`As of ${asOf}`, 122, 727)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#9aa7b8'
  ctx.font = '750 24px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('www.stockstickies.com', 1482, 716)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to create the YTD image.')), 'image/png', 1)
  })
}

export async function shareOrDownloadYtdCard(blob, filename, shareTitle) {
  const file = new File([blob], filename, { type: 'image/png' })
  if (isMobileShareDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      downloadBlob(blob, filename)
      return 'downloaded'
    }
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}

export async function copyYtdCardToClipboard(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is not supported by this browser.')
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ])
}
