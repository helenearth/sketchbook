import { useEffect } from 'react'

/**
 * Generates a plain-weave linen texture on a canvas and exposes it as
 * --linen-tex on :root for .page-cover elements to pick up.
 *
 * Algorithm:
 *  – Pixel grid divided into thread periods (T px thread + G px gap)
 *  – Plain weave: alternating over/under at every intersection
 *  – Cosine cross-section profile on each thread (bright centre, darker edges)
 *  – Gap pixels are noticeably darker — the indent between threads
 *  – Slight warm noise to break up digital regularity
 */
export function useLinenTexture(threadSize = 3, gap = 3, periods = 20) {
  useEffect(() => {
    const P = threadSize + gap          // one full period
    const S = P * periods               // canvas side = exact multiple of period

    const canvas = document.createElement('canvas')
    canvas.width  = S
    canvas.height = S
    const ctx = canvas.getContext('2d')

    // Seeded LCG — same result every mount, no flicker on re-render
    let seed = 0xdeadbeef
    const rand = () => {
      seed = Math.imul(seed, 1664525) + 1013904223
      return ((seed >>> 0) / 0xffffffff)
    }

    // Base cover colour #D9D8D7 = rgb(217, 216, 215)
    const bR = 217, bG = 216, bB = 215

    const imgData = ctx.createImageData(S, S)
    const d = imgData.data

    for (let y = 0; y < S; y++) {
      const yi   = Math.floor(y / P)
      const yf   = y % P
      const inWeft = yf < threadSize
      // Cosine profile across weft thread width (1 = centre, 0 = edge)
      const weftProfile = inWeft
        ? Math.cos(((yf / (threadSize - 1)) - 0.5) * Math.PI) * 0.5 + 0.5
        : 0

      for (let x = 0; x < S; x++) {
        const xi   = Math.floor(x / P)
        const xf   = x % P
        const inWarp = xf < threadSize
        // Cosine profile across warp thread width
        const warpProfile = inWarp
          ? Math.cos(((xf / (threadSize - 1)) - 0.5) * Math.PI) * 0.5 + 0.5
          : 0

        // Plain weave: even (xi+yi) → warp on top; odd → weft on top
        const warpOnTop = (xi + yi) % 2 === 0

        let bright = 0

        if (inWarp && inWeft) {
          // Intersection — upper thread casts a slight shadow on lower
          bright = warpOnTop
            ? warpProfile * 13 - 3    // warp riding over weft
            : weftProfile * 11 - 3   // weft riding over warp
        } else if (inWarp) {
          bright = warpProfile * 15 - 5   // vertical thread, rounded top
        } else if (inWeft) {
          bright = weftProfile * 11 - 5   // horizontal thread, slightly flatter
        } else {
          bright = -14                    // gap: recessed shadow between threads
        }

        // Subtle warm grain — R channel varies slightly more than B
        const noise = (rand() - 0.5) * 5
        bright += noise

        const idx = (y * S + x) * 4
        d[idx]     = Math.min(255, Math.max(0, bR + bright))
        d[idx + 1] = Math.min(255, Math.max(0, bG + bright * 0.96))
        d[idx + 2] = Math.min(255, Math.max(0, bB + bright * 0.88))
        d[idx + 3] = 255
      }
    }

    ctx.putImageData(imgData, 0, 0)

    // Fine surface fibres — very sparse, very low opacity
    for (let i = 0; i < 800; i++) {
      const x   = rand() * S
      const y   = rand() * S
      const len = 1 + rand() * 4
      const ang = rand() * Math.PI
      const op  = 0.03 + rand() * 0.06
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      ctx.strokeStyle = `rgba(190,178,162,${op.toFixed(3)})`
      ctx.lineWidth   = 0.4
      ctx.lineCap     = 'round'
      ctx.beginPath()
      ctx.moveTo(-len / 2, 0)
      ctx.lineTo( len / 2, 0)
      ctx.stroke()
      ctx.restore()
    }

    const dataURL = canvas.toDataURL('image/png')
    document.documentElement.style.setProperty('--linen-tex', `url("${dataURL}")`)

    return () => document.documentElement.style.removeProperty('--linen-tex')
  }, [threadSize, gap, periods])
}
