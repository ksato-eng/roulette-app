import { useRef, useEffect, useCallback, useState } from 'react'

// イージングアウト（三次）
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// 高コントラストの文字色を返す
function getTextColor(hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1e293b' : '#ffffff'
}

// 重みに比例して各賞を何分割するかを決定（上限MAX_SPLITS）
const MAX_SPLITS = 8

function calcSplits(prizes) {
  const minWeight = Math.min(...prizes.map(p => p.weight))
  return prizes.map(p => ({
    prize: p,
    splits: Math.max(1, Math.min(MAX_SPLITS, Math.round(p.weight / minWeight))),
  }))
}

// ラウンドロビンでセグメントを配置し、同一賞が隣接しないよう分散させる
function spreadSegments(splitList) {
  // 分割数の多い賞から順にグループ化
  const groups = [...splitList]
    .sort((a, b) => b.splits - a.splits)
    .map(({ prize, splits }) => Array(splits).fill(prize))

  const result = []
  while (groups.some(g => g.length > 0)) {
    for (const g of groups) {
      if (g.length > 0) result.push(g.shift())
    }
  }
  return result
}

// セグメント情報を構築
// 各賞の占有角度は weight 比率で決まり、分割してもトータルは変わらない（確率不変）
function buildSegments(prizes) {
  if (prizes.length === 0) return []

  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0)
  const splitList = calcSplits(prizes)

  // 各「スロット」の sweepAngle を事前計算
  const slotMap = new Map(
    splitList.map(({ prize, splits }) => [
      prize.id,
      { sweepAngle: (prize.weight / totalWeight) * Math.PI * 2 / splits },
    ])
  )

  // 分散配置した賞の列を取得
  const arranged = spreadSegments(splitList)

  let currentAngle = 0
  return arranged.map(prize => {
    const { sweepAngle } = slotMap.get(prize.id)
    const seg = { prize, startAngle: currentAngle, sweepAngle }
    currentAngle += sweepAngle
    return seg
  })
}

// ポインター（上 = -π/2）が指しているセグメントを返す
function getSegmentAtPointer(segments, rotation) {
  // ポインターは上（-π/2）に固定。ホイールがrotation分回転している
  // 非回転系でのポインター角度 = -π/2 - rotation
  const pointerAngle = ((-Math.PI / 2 - rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  return segments.find(seg => {
    const end = seg.startAngle + seg.sweepAngle
    return pointerAngle >= seg.startAngle && pointerAngle < end
  }) || segments[0]
}

// 目標セグメントに停止するための目標回転角を計算
function calcTargetRotation(currentRotation, targetSeg, minExtraSpins = 5) {
  const segCenter = targetSeg.startAngle + targetSeg.sweepAngle / 2
  // rotation = -π/2 - segCenter (+ 2πk) でポインターがセグメント中央を指す
  let target = -Math.PI / 2 - segCenter
  // 現在位置より十分先（最低minExtraSpins回転分）になるよう調整
  while (target < currentRotation + Math.PI * 2 * minExtraSpins) {
    target += Math.PI * 2
  }
  // セグメント内でランダムなオフセット（中央±30%）
  const jitter = (Math.random() - 0.5) * targetSeg.sweepAngle * 0.6
  return target + jitter
}

const SPIN_VELOCITY = 0.25      // rad/frame、回転中の速度
const DECEL_DURATION = 4000     // ms、減速時間

export default function Roulette({ prizes, pendingPrize, onAnimationComplete, canvasRef: externalCanvasRef }) {
  const internalRef = useRef(null)
  const canvasRef = externalCanvasRef || internalRef

  // コールバックを ref で保持して、RAFループが常に最新版を呼べるようにする
  const onAnimationCompleteRef = useRef(onAnimationComplete)
  useEffect(() => { onAnimationCompleteRef.current = onAnimationComplete }, [onAnimationComplete])
  const stateRef = useRef({
    rotation: 0,
    velocity: 0,
    phase: 'idle',       // idle | spinning | decelerating | done
    targetRotation: 0,
    decelStartRotation: 0,
    decelStartTime: 0,
    rafId: null,
  })
  const segmentsRef = useRef([])
  const [size, setSize] = useState(400)

  // canvasサイズをコンテナに合わせてリサイズ
  useEffect(() => {
    const el = canvasRef.current?.parentElement
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      setSize(Math.min(w, 500))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // セグメント情報を景品リストから構築
  useEffect(() => {
    segmentsRef.current = buildSegments(prizes.filter(p => p.remaining > 0))
  }, [prizes])

  // ルーレット描画
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    const segments = segmentsRef.current
    const { rotation } = s

    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const r = cx * 0.88

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (segments.length === 0) {
      ctx.fillStyle = '#334155'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#94a3b8'
      ctx.font = `bold ${r * 0.12}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('景品なし', cx, cy)
      drawPointer(ctx, cx, cy, r)
      return
    }

    // ── ホイール描画 ──
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rotation)

    // 外縁の影
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 20

    segments.forEach(seg => {
      const { startAngle: sa, sweepAngle: sw, prize: p } = seg

      // セクション
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, r, sa, sa + sw)
      ctx.closePath()
      ctx.fillStyle = p.color
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.shadowBlur = 0

      // テキスト描画（セグメント幅に応じて表示量を調整）
      const arcLen = r * sw  // 外周の弧の長さ（px相当）
      if (arcLen >= 18) {
        const textAngle = sa + sw / 2
        const textColor = getTextColor(p.color)

        ctx.save()
        ctx.rotate(textAngle)
        ctx.fillStyle = textColor
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        if (arcLen >= 48) {
          // 広いセグメント：賞名 + 残数を2行表示
          const fontSize = Math.min(15, arcLen / 5)
          ctx.translate(r * 0.65, 0)
          ctx.rotate(Math.PI / 2)
          ctx.font = `bold ${fontSize}px sans-serif`
          ctx.fillText(p.name, 0, -fontSize * 0.65)
          ctx.font = `${fontSize * 0.78}px sans-serif`
          ctx.fillText(`残${p.remaining}`, 0, fontSize * 0.72)
        } else {
          // 狭いセグメント：賞名のみ、外縁寄りに配置
          const fontSize = Math.min(12, arcLen / 3.5)
          ctx.translate(r * 0.72, 0)
          ctx.rotate(Math.PI / 2)
          ctx.font = `bold ${fontSize}px sans-serif`
          ctx.fillText(p.name, 0, 0)
        }
        ctx.restore()
      }
    })

    // 中央の丸
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.14)
    grad.addColorStop(0, '#f1f5f9')
    grad.addColorStop(1, '#94a3b8')
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.restore()

    // ── 外枠リング ──
    ctx.beginPath()
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2)
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 4
    ctx.stroke()

    // ── ポインター（上に固定三角） ──
    drawPointer(ctx, cx, cy, r)
  }, [])

  function drawPointer(ctx, cx, cy, r) {
    const px = cx
    const py = cy - r - 2
    const pw = 18
    const ph = 30

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(px, py + ph)
    ctx.lineTo(px - pw / 2, py + ph + 8)
    ctx.lineTo(px + pw / 2, py + ph + 8)
    ctx.closePath()
    ctx.fillStyle = '#ef4444'
    ctx.shadowColor = 'rgba(239,68,68,0.8)'
    ctx.shadowBlur = 12
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }

  // アニメーションループ
  const animate = useCallback(() => {
    const s = stateRef.current
    const now = performance.now()

    if (s.phase === 'spinning') {
      s.rotation += SPIN_VELOCITY

    } else if (s.phase === 'decelerating') {
      const elapsed = now - s.decelStartTime
      const t = Math.min(elapsed / DECEL_DURATION, 1)
      const eased = easeOutCubic(t)
      s.rotation = s.decelStartRotation + (s.targetRotation - s.decelStartRotation) * eased

      if (t >= 1) {
        s.phase = 'done'
        s.rotation = s.targetRotation
        draw()
        // ref 経由で呼ぶことで、RAF ループが古いクロージャを参照しても最新のコールバックが実行される
        onAnimationCompleteRef.current?.()
        return
      }
    }

    draw()
    s.rafId = requestAnimationFrame(animate)
  }, [draw])

  // 外部から制御: spinning開始
  const startSpin = useCallback(() => {
    const s = stateRef.current
    cancelAnimationFrame(s.rafId)
    s.phase = 'spinning'
    s.velocity = SPIN_VELOCITY
    s.rafId = requestAnimationFrame(animate)
  }, [animate])

  // 外部から制御: 目標セグメントへ減速停止
  const stopSpin = useCallback((targetPrize) => {
    const s = stateRef.current
    if (s.phase !== 'spinning') return

    const segments = segmentsRef.current
    const targetSeg = targetPrize
      ? segments.find(seg => seg.prize.id === targetPrize.id) || segments[0]
      : getSegmentAtPointer(segments, s.rotation)

    s.phase = 'decelerating'
    s.decelStartRotation = s.rotation
    s.decelStartTime = performance.now()
    s.targetRotation = calcTargetRotation(s.rotation, targetSeg)
  }, [])

  // propsでpendingPrizeが渡されたら停止処理へ
  useEffect(() => {
    if (pendingPrize) {
      stopSpin(pendingPrize)
    }
  }, [pendingPrize, stopSpin])

  // 初回描画
  useEffect(() => {
    draw()
  }, [draw, size, prizes])

  // クリーンアップ
  useEffect(() => {
    return () => cancelAnimationFrame(stateRef.current.rafId)
  }, [])

  return (
    <div className="relative w-full flex justify-center items-center">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="max-w-full"
      />
      {/* startSpin / stopSpin を外部から呼べるよう ref に格納 */}
      <RouletteControls canvasRef={canvasRef} startSpin={startSpin} stopSpin={stopSpin} />
    </div>
  )
}

// 親コンポーネントが startSpin/stopSpin を呼べるよう橋渡しする
function RouletteControls({ canvasRef, startSpin, stopSpin }) {
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current._startSpin = startSpin
      canvasRef.current._stopSpin = stopSpin
    }
  }, [canvasRef, startSpin, stopSpin])
  return null
}

// 外部からcanvasを通じて呼び出すユーティリティ
export function getRouletteControls(canvasEl) {
  return {
    startSpin: canvasEl?._startSpin,
    stopSpin: canvasEl?._stopSpin,
  }
}
