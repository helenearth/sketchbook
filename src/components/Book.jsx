import { useRef, useEffect, useState, useCallback, memo } from 'react'
import { flushSync } from 'react-dom'
import HTMLFlipBook from 'react-pageflip'
import { pages } from '../data/pages'
import { usePaperTexture } from '../hooks/usePaperTexture'
import './book.css'

// Page aspect ratio — 1 = square pages
const PAGE_AR = 1
// Vertical breathing room (top + bottom). Horizontal space is handled
// as a viewport percentage so the book fills the screen proportionally.
const V_MARGIN = 64        // px top + bottom combined headroom

function calcDims() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Rotate the landscape book 90° when the device is in portrait orientation
  // (phone/tablet held upright). matchMedia is more reliable than a viewport-
  // width breakpoint — a narrow desktop window won't accidentally trigger it.
  const shouldRotate = window.matchMedia('(orientation: portrait)').matches

  if (shouldRotate) {
    // Book renders landscape (2×pageW wide) but is visually rotated 90°.
    // After rotation: pageH → visual width, 2×pageW → visual height.
    // PAGE_AR = 1 → pageH = pageW. Fit both constraints:
    //   pageW ≤ vw * 0.80   (visual width after rotation — 80% of portrait width)
    //   2×pageW ≤ vh * 0.90 (visual height after rotation — 90% of portrait height)
    const pageW = Math.min(
      Math.floor(vw * 0.80),
      Math.floor(vh * 0.45)
    )
    return { width: pageW, height: pageW, shouldRotate: true }
  }

  // Landscape: each page = 40% of viewport width.
  // Both pages together fill 80% vw; the remaining 20% absorbs the
  // perspective overshoot of the 3D cover-flip animation so it never clips.
  // Height caps the page if the viewport is too short (e.g. ultrawide).
  const availH = vh - V_MARGIN
  let pageW = Math.floor(vw * 0.40)
  let pageH = Math.floor(pageW * PAGE_AR)
  if (pageH > availH) {
    pageH = availH
    pageW = Math.floor(pageH / PAGE_AR)
  }
  return { width: pageW, height: pageH, shouldRotate: false }
}

// ─── Page templates ───────────────────────────────────────────────────────────
// Wrapped in memo so only pages whose isLoaded flag changes get re-rendered
// when the loadedPages Set grows — prevents all 50 pages from re-rendering
// on every flip.

const SketchPage = memo(function SketchPage({ page, pageNum, side, isLoaded }) {
  const gutterClass = side === 'left' ? 'gutter-left' : 'gutter-right'

  if (page.type === 'blank') {
    return (
      <div className={`page-inner ${gutterClass}`}>
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
    </div>
  )
})

// ─── Main component ───────────────────────────────────────────────────────────

export default function Book() {
  const bookRef     = useRef()
  const sceneRef    = useRef()
  const audioRef        = useRef(null)   // page turn
  const openAudioRef    = useRef(null)   // cover opens
  const closeAudioRef   = useRef(null)   // cover closes
  const flipDirectionRef = useRef('forward') // 'forward' | 'backward'
  const currentPageRef   = useRef(0)         // persists page index across resize remounts
  const [dims, setDims] = useState(calcDims)
  const [hintVisible, setHintVisible] = useState(true)
  // True when the cover is showing alone — controls page-shading overlay suppression.
  const [atCover, setAtCover] = useState(true)
  // Controls which cover is showing (for overlay suppression logic).
  const [coverSide, setCoverSide] = useState('front') // 'front' | 'back'
  // Controls the drop-shadow element independently from atCover.
  // 'front'/'back' = half-width shadow under the visible cover.
  // 'open' = full-width shadow under the open spread.
  // Deliberately lags behind atCover: switches to 'open' only at flip END so
  // the full-width shadow never pops in while the opposite page is still empty.
  const [shadowMode, setShadowMode] = useState('front') // 'front' | 'back' | 'open'

  // Lazy-load images: only decode pages close to the current position.
  // The Set grows monotonically (once loaded, always loaded) so already-
  // decoded images are never thrown away and can't flash blank on revisit.
  // Initial value: first 4 pages = first two spreads ready before open.
  const [loadedPages, setLoadedPages] = useState(() => new Set([1, 2, 3, 4]))

  // Generate and apply the paper fibre texture once on mount
  usePaperTexture(600)

  // Preload audio
  useEffect(() => {
    audioRef.current = new Audio('/PageTurn2.m4a')
    audioRef.current.preload = 'auto'
    openAudioRef.current = new Audio('/BookOpen2.m4a')
    openAudioRef.current.preload = 'auto'
    closeAudioRef.current = new Audio('/BookClose.m4a')
    closeAudioRef.current.preload = 'auto'
  }, [])

  // Responsive sizing — recalculate on resize and on device orientation change.
  // react-pageflip does not live-resize its page elements when width/height props
  // change; it only applies them on mount. The key prop on HTMLFlipBook forces a
  // full remount whenever dims settle. The debounce (200 ms) prevents remounting
  // on every pixel during a window drag — only fires after the user stops resizing.
  useEffect(() => {
    let timer
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setDims(calcDims()), 200)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  // Fade hint after 6 s
  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 6000)
    return () => clearTimeout(t)
  }, [])

  // Fires at flip START — play audio immediately so sound leads the animation.
  // Also synchronously update overlay/shadow state before the first animation frame:
  //
  //   Closing to a cover → coverSide + correct shadowMode only.
  //     atCover deliberately stays false so the relevant overlay (right page when
  //     front cover closes, left page when back cover closes) remains visible during
  //     the animation. handleFlip sets atCover=true (transition:none) at flip END.
  //
  //   Opening from a cover → atCover=false + shadowMode='transition'.
  //     Overlays begin fading in as the cover lifts.
  //     shadowMode switches to 'transition' so the book-shadow disappears entirely
  //     during the animation (nothing can bleed onto the revealed content page).
  //     It advances to 'open' only at flip END (handleFlip).
  const handleChangeState = useCallback((e) => {
    if (e.data === 'flipping') {
      const pg = bookRef.current?.pageFlip()?.getCurrentPageIndex()
      const isLastSpread  = pg >= pages.length - 1
      const isFirstSpread = pg <= 1
      const isAtCover     = pg === 0 || pg >= pages.length
      const isClosing = (isLastSpread  && flipDirectionRef.current === 'forward') ||
                        (isFirstSpread && flipDirectionRef.current === 'backward')
      const isOpening = isAtCover && !isClosing
      const sfx = isClosing ? closeAudioRef.current
                : isOpening ? openAudioRef.current
                : audioRef.current
      if (sfx) {
        sfx.currentTime = 0
        sfx.play().catch(() => {})
      }
      if (isFirstSpread || isLastSpread) {
        flushSync(() => {
          if (isClosing) {
            const side = (isLastSpread && flipDirectionRef.current === 'forward') ? 'back' : 'front'
            // Do NOT setAtCover(true) here — overlays remain visible during the animation.
            setCoverSide(side)
            setShadowMode(side)   // position shadow on the correct half immediately
          } else {
            setAtCover(false)        // overlays fade in during the animation
            setShadowMode('transition') // suppress book-shadow entirely during cover-open animation
          }
        })
      }
    }
  }, [])

  // Fires at flip END — update cover/shadow flags and eagerly load surrounding spreads.
  const handleFlip = useCallback((e) => {
    if (e?.data !== undefined) {
      const pg = e.data
      currentPageRef.current = pg          // remember position for resize remounts
      const nowAtCover = pg === 0 || pg === pages.length + 1
      setAtCover(nowAtCover)
      if (pg === 0) {
        setCoverSide('front')
        setShadowMode('front')
      } else if (pg === pages.length + 1) {
        setCoverSide('back')
        setShadowMode('back')
      } else {
        // Landed on a content spread — expand shadow to full width now that
        // both pages are visible and the animation is complete.
        setShadowMode('open')
      }
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
      flipDirectionRef.current = 'forward'
      bookRef.current?.pageFlip().flipNext()
      lastFlip.current   = now
      accumDelta.current = 0
    } else if (accumDelta.current < -THRESHOLD) {
      flipDirectionRef.current = 'backward'
      bookRef.current?.pageFlip().flipPrev()
      lastFlip.current   = now
      accumDelta.current = 0
    }
  }, [])

  // Stamp flip direction from pointer position.
  // Non-rotated: right half = forward, left = backward.
  // Rotated 90°: the original right page appears at the bottom, so
  //              bottom half = forward, top half = backward.
  // Runs before react-pageflip's own mousedown handler so the direction is
  // always set before handleChangeState fires.
  const handlePointerDown = useCallback((e) => {
    const rect = sceneRef.current?.getBoundingClientRect()
    if (!rect) return
    flipDirectionRef.current = dims.shouldRotate
      ? (e.clientY >= rect.top  + rect.height / 2 ? 'forward' : 'backward')
      : (e.clientX >= rect.left + rect.width  / 2 ? 'forward' : 'backward')
  }, [dims.shouldRotate])

  useEffect(() => {
    const el = sceneRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('pointerdown', handlePointerDown)
    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [handleWheel, handlePointerDown])

  // ── Page side helper ──────────────────────────────────────────────────
  // Child order: [cover(0), data[0](1) … data[49](50), back-cover(51)]
  // With showCover: cover shows alone; data[i] → child i+1
  // Even data-index → right page; odd data-index → left page
  const sideOf = (i) => (i % 2 === 0 ? 'right' : 'left')

  return (
    <>
      <div
        ref={sceneRef}
        className={`book-scene${dims.shouldRotate ? ' book-scene--rotated' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Shadow sits behind the book — positioned to match only the visible area */}
        <div
          aria-hidden="true"
          className={`book-shadow book-shadow--${shadowMode}`}
        />
        <HTMLFlipBook
          key={`${dims.width}x${dims.height}`}
          ref={bookRef}
          width={dims.width}
          height={dims.height}
          size="fixed"
          drawShadow={true}
          maxShadowOpacity={0.4}
          showCover
          usePortrait={false}
          flippingTime={880}
          className={`sketchbook${atCover ? ' --at-cover' : ''}${shadowMode === 'open' ? ' --shadow-open' : ''}`}
          mobileScrollSupport={false}
          clickEventForward={false}
          useMouseEvents
          startPage={currentPageRef.current}
          onFlip={handleFlip}
          onChangeState={handleChangeState}
        >
          {/* ── Front cover ── */}
          <div className="page page-cover page-cover--front" />

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
          <div className="page page-cover page-cover--back" />

        </HTMLFlipBook>

      </div>

      <p className={`hint${hintVisible ? '' : ' hint-hidden'}`}>
        drag · swipe · click to turn
      </p>
    </>
  )
}
