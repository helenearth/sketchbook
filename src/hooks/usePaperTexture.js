import { useEffect } from 'react'

/**
 * Generates a realistic cartridge-paper fibre texture on a canvas and
 * exposes it as --paper-tex on :root for all .page elements to pick up.
 *
 * What makes it look like the reference photo:
 *  – Dense mat of very short (2–10 px), randomly-angled fibre strokes
 *  – Each fibre has extremely low opacity so they layer without muddying
 *  – No large circular speckles (those read as terrazzo, not paper)
 *  – Fine sub-pixel pixel noise for grain feel
 *  – Tiny bright specular flecks where the surface catches light
 */
export function usePaperTexture(size = 512) {
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width  = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    // ── 1. Base paper colour ───────────────────────────────────────────────
    ctx.fillStyle = '#F1EEE8'
    ctx.fillRect(0, 0, size, size)

    // ── 2. Dense fibre mat ─────────────────────────────────────────────────
    // Emulate cold-press cartridge: thousands of short, interlocking strokes
    // at near-random angles with very low opacity so they blend naturally.
    const FIBRE_PASSES = [
      { count: 7000, minLen: 2,  maxLen: 8,  minOp: 0.012, maxOp: 0.038, colour: '105,96,82',  minW: 0.2, maxW: 0.55 },
      { count: 3500, minLen: 1,  maxLen: 5,  minOp: 0.018, maxOp: 0.050, colour: '80,70,58',   minW: 0.15,maxW: 0.40 },
      { count: 1800, minLen: 3,  maxLen: 12, minOp: 0.008, maxOp: 0.022, colour: '130,120,104',minW: 0.25,maxW: 0.65 },
    ]

    for (const pass of FIBRE_PASSES) {
      for (let i = 0; i < pass.count; i++) {
        const x   = Math.random() * size
        const y   = Math.random() * size
        const len = pass.minLen + Math.random() * (pass.maxLen - pass.minLen)
        // Paper fibres are mostly horizontal/vertical with rare diagonals
        const ang = Math.random() * Math.PI
        const op  = pass.minOp + Math.random() * (pass.maxOp - pass.minOp)
        const w   = pass.minW  + Math.random() * (pass.maxW  - pass.minW)
        // Slight curvature to look organic rather than ruled
        const sag = (Math.random() - 0.5) * len * 0.25

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(ang)
        ctx.strokeStyle = `rgba(${pass.colour},${op.toFixed(3)})`
        ctx.lineWidth   = w
        ctx.lineCap     = 'round'
        ctx.beginPath()
        ctx.moveTo(-len / 2, 0)
        ctx.quadraticCurveTo(0, sag, len / 2, 0)
        ctx.stroke()
        ctx.restore()
      }
    }

    // ── 3. Micro specular flecks — tiny, very bright ───────────────────────
    // In the reference photo, small bright points suggest surface micro-bumps
    // catching light. Keep these tiny (r < 1.5) and numerous.
    for (let i = 0; i < 2200; i++) {
      const x  = Math.random() * size
      const y  = Math.random() * size
      const r  = 0.3 + Math.random() * 1.2
      const op = 0.04 + Math.random() * 0.10
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,253,250,${op.toFixed(3)})`
      ctx.fill()
    }

    // ── 4. Fine pixel-level grain ──────────────────────────────────────────
    // A gentle ±5 luminance jitter to break up any digital regularity
    const imgData = ctx.getImageData(0, 0, size, size)
    const d       = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      const n  = (Math.random() - 0.5) * 7
      d[i]     = Math.max(218, Math.min(255, d[i]     + n))
      d[i + 1] = Math.max(214, Math.min(253, d[i + 1] + n * 0.92))
      d[i + 2] = Math.max(204, Math.min(246, d[i + 2] + n * 0.80))
    }
    ctx.putImageData(imgData, 0, 0)

    // ── 5. Expose as CSS custom property ──────────────────────────────────
    const dataURL = canvas.toDataURL('image/png')
    document.documentElement.style.setProperty(
      '--paper-tex',
      `url("${dataURL}")`
    )
  }, [size])
}
