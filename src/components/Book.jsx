import { useRef, useEffect, useState, useCallback, memo } from 'react'
import HTMLFlipBook from 'react-pageflip'
import { pages } from '../data/pages'
import { usePaperTexture } from '../hooks/usePaperTexture'
import './book.css'

// Page aspect ratio — 1 = square pages
const PAGE_AR = 1
const MARGIN  = 52         // px each side

function calcDims() {
  const availW = window.innerWidth  - MARGIN * 2
  const availH = window.innerHeight - MARGIN * 2
  let pageW = Math.floor(availW / 2)
  let pageH = Math.floor(pageW * PAGE_AR)
  if (pageH > availH) {
    pageH = availH
    pageW = Math.floor(pageH / PAGE_AR)
  }
  return { width: pageW, height: pageH }
}

// ─── Page templates ───────────────────────────────────────────────────────────
// Wrapped in memo so only pages whose isLoaded flag changes get re-rendered
// when the loadedPages Set grows — prevents all 50 pages from re-rendering
// on every flip.

const SketchPage = memo(function SketchPage({ page, pageNum, side, isLoaded }) {
  const gutterClass = side === 'left' ? 'gutter-left' : 'gutter-right'
  const numClass    = side === 'left' ? 'page-num-left' : 'page-num-right'

  if (page.type === 'blank') {
    return (
      <div className={`page-inner ${gutterClass}`}>
        <span className={`page-num ${numClass}`}>{pageNum}</span>
      </div>
    )
  }

  if (page.type === 'text') {
    return (
      <div className={`page-text-inner ${gutterClass}`}>
        <p className="page-prose">{page.text}</p>
        {page.attribution && (
          <p className="page-attribution">{page.attribution}</p>
        )}
        <span className={`page-num ${numClass}`}>{pageNum}</span>
      </div>
    )
  }

  if (page.type === 'multi') {
    return (
      <div className={`page-inner ${gutterClass}`}>
        <div className="multi-grid">
          {page.images.map((img, i) => (
            <div key={i} className="multi-cell">
              <img
                src={isLoaded ? img.src : undefined}
                alt={img.caption || ''}
                className="multi-img"
                draggable={false}
                decoding="async"
              />
              {img.caption && (
                <span className="multi-cell-caption">{img.caption}</span>
              )}
            </div>
          ))}
        </div>
        {page.caption && (
          <p className="page-caption">{page.caption}</p>
        )}
        <span className={`page-num ${numClass}`}>{pageNum}</span>
      </div>
    )
  }

  // default: sketch
  return (
    <div className={`page-inner ${gutterClass}`}>
      <div className="sketch-frame">
        <img
          src={isLoaded ? page.image : undefined}
          alt={page.caption || ''}
          className="sketch-img"
          draggable={false}
          decoding="async"
        />
      </div>
      {page.caption && (
        <p className="page-caption">{page.caption}</p>
      )}
      <span className={`page-num ${numClass}`}>{pageNum}</span>
    </div>
  )
})

// ─── Main component ───────────────────────────────────────────────────────────

export default function Book() {
  const bookRef     = useRef()
  const sceneRef    = useRef()
  const audioRef    = useRef(null)
  const [dims, setDims] = useState(calcDims)
  const [hintVisible, setHintVisible] = useState(true)
  // True when the cover is showing alone — removes the spread box-shadow
  const [atCover, setAtCover] = useState(true)

  // Lazy-load images: only decode pages close to the current position.
  // The Set grows monotonically (once loaded, always loaded) so already-
  // decoded images are never thrown away and can't flash blank on revisit.
  // Initial value: first 4 pages = first two spreads ready before open.
  const [loadedPages, setLoadedPages] = useState(() => new Set([1, 2, 3, 4]))

  // Generate and apply the paper fibre texture once on mount
  usePaperTexture(600)

  // Preload the page-turn audio
  useEffect(() => {
    audioRef.current = new Audio('/turnpage.m4a')
    audioRef.current.preload = 'auto'
  }, [])

  // Responsive sizing
  useEffect(() => {
    const onResize = () => setDims(calcDims())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Fade hint after 6 s
  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 6000)
    return () => clearTimeout(t)
  }, [])

  // Fires at flip START — play audio immediately so sound leads the animation
  const handleChangeState = useCallback((e) => {
    if (e.data === 'flipping') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(() => {})
      }
    }
  }, [])

  // Fires at flip END — update cover flag and eagerly load the surrounding
  // spreads so images are ready before the user reaches them.
  const handleFlip = useCallback((e) => {
    if (e?.data !== undefined) {
      const pg = e.data
      setAtCover(pg === 0 || pg === pages.length + 1)
      setLoadedPages(prev => {
        const next = new Set(prev)
        // Load 2 spreads behind and 3 spreads ahead of the landing page
        const from = Math.max(1, pg - 4)
        const to   = Math.min(pages.length, pg + 6)
        for (let i = from; i <= to; i++) next.add(i)
        return next
      })
    }
  }, [])

  // ── Trackpad / mouse-wheel flipping ──────────────────────────────────
  const lastFlip   = useRef(0)
  const accumDelta = useRef(0)

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const now = Date.now()

    // During cooldown, drain the accumulator so a continuing swipe gesture
    // doesn't build up and fire a second flip the instant cooldown expires.
    if (now - lastFlip.current < 550) {
      accumDelta.current = 0
      return
    }

    // Accumulate delta so slow trackpad swipes still register
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    accumDelta.current += d

    const THRESHOLD = 50
    if (accumDelta.current > THRESHOLD) {
      bookRef.current?.pageFlip().flipNext()
      lastFlip.current   = now
      accumDelta.current = 0
    } else if (accumDelta.current < -THRESHOLD) {
      bookRef.current?.pageFlip().flipPrev()
      lastFlip.current   = now
      accumDelta.current = 0
    }
  }, [])

  useEffect(() => {
    const el = sceneRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Page side helper ──────────────────────────────────────────────────
  // Child order: [cover(0), data[0](1) … data[49](50), back-cover(51)]
  // With showCover: cover shows alone; data[i] → child i+1
  // Even data-index → right page; odd data-index → left page
  const sideOf = (i) => (i % 2 === 0 ? 'right' : 'left')

  return (
    <>
      <div ref={sceneRef} className="book-scene">
        <HTMLFlipBook
          ref={bookRef}
          width={dims.width}
          height={dims.height}
          size="fixed"
          drawShadow
          maxShadowOpacity={0.38}
          showCover
          usePortrait={false}
          flippingTime={880}
          className={`sketchbook${atCover ? ' --at-cover' : ''}`}
          mobileScrollSupport={false}
          clickEventForward={false}
          useMouseEvents
          startPage={0}
          onFlip={handleFlip}
          onChangeState={handleChangeState}
        >
          {/* ── Front cover ── */}
          <div className="page page-cover" />

          {/* ── Content pages ── */}
          {pages.map((page, i) => (
            <div key={i} className="page">
              <SketchPage
                page={page}
                pageNum={i + 1}
                side={sideOf(i)}
                isLoaded={loadedPages.has(i + 1)}
              />
            </div>
          ))}

          {/* ── Back cover ── */}
          <div className="page page-cover" />

        </HTMLFlipBook>

      </div>

      <p className={`hint${hintVisible ? '' : ' hint-hidden'}`}>
        drag · swipe · click to turn
      </p>
    </>
  )
}
