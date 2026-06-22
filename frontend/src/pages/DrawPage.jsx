import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import Roulette from '../components/Roulette'
import ResultModal from '../components/ResultModal'
import PrizeListDisplay from '../components/PrizeListDisplay'
import PrizeLegend from '../components/PrizeLegend'
import { useSound } from '../hooks/useSound'

// ボタンフェーズの定義
const PHASE = { IDLE: 'idle', SPINNING: 'spinning', STOPPING: 'stopping', RESULT: 'result' }

export default function DrawPage() {
  const { prizes, totalDrawCount, fetchState, pickWinner, confirmDraw, loading } = useAppStore()
  const [phase, setPhase] = useState(PHASE.IDLE)
  const [pendingPrize, setPendingPrize] = useState(null)   // ルーレットの停止目標
  const pendingPrizeRef = useRef(null)                     // 常に最新値を保持
  const [resultPrize, setResultPrize] = useState(null)     // 結果表示用
  const [resultCount, setResultCount] = useState(0)
  // Rouletteコンポーネントのcanvas要素を受け取るref
  const canvasRef = useRef(null)
  const { startDrumroll, stopDrumroll, playWin, playLose } = useSound()

  useEffect(() => { fetchState() }, [fetchState])

  // ポーリングで他端末の状態を同期（5秒ごと）
  useEffect(() => {
    const id = setInterval(() => {
      if (phase === PHASE.IDLE) fetchState()
    }, 5000)
    return () => clearInterval(id)
  }, [phase, fetchState])

  const handleStart = useCallback(() => {
    if (phase !== PHASE.IDLE) return
    const canvas = canvasRef.current
    if (!canvas?._startSpin) return

    setPhase(PHASE.SPINNING)
    canvas._startSpin()

    // 最初の景品の音声設定を使用
    const soundType = prizes.length > 0 ? (prizes[0].drainrollSound || 'default') : 'default'
    startDrumroll(soundType)
  }, [phase, startDrumroll, prizes])

  const handleStop = useCallback(async () => {
    if (phase !== PHASE.SPINNING) return
    setPhase(PHASE.STOPPING)
    stopDrumroll()

    try {
      // サーバーで当選者を決定
      const { prize, nextCount } = await pickWinner()
      pendingPrizeRef.current = prize   // ref を先に更新
      setPendingPrize(prize)
      // アニメーション完了は Roulette の onAnimationComplete で受け取る
    } catch (e) {
      console.error(e)
      setPhase(PHASE.SPINNING)
      startDrumroll()
    }
  }, [phase, stopDrumroll, pickWinner, startDrumroll])

  // アニメーション完了コールバック
  // ref 経由で prize を読むことで、useCallback の再生成タイミングに依存しない
  const handleAnimationComplete = useCallback(async () => {
    const prize = pendingPrizeRef.current
    if (!prize) return

    try {
      const data = await confirmDraw(prize.id)
      setResultPrize(prize)
      setResultCount(data.totalDrawCount)
      setPhase(PHASE.RESULT)
      pendingPrizeRef.current = null
      setPendingPrize(null)

      // 当選音の再生（景品の設定に基づく）
      const allPrizes = useAppStore.getState().prizes
      const sorted = [...allPrizes].sort((a, b) => a.weight - b.weight)
      const rank = sorted.findIndex(p => p.id === prize.id)
      const isLose = prize.weight === Math.max(...allPrizes.map(p => p.weight))

      if (isLose) {
        playLose(prize.loseSound || 'buzz')
      } else if (rank < 2) {
        playWin(prize.winSound || 'fanfare')
      } else {
        playWin(prize.winSound || 'fanfare')
      }
    } catch (e) {
      console.error(e)
      setPhase(PHASE.IDLE)
    }
  }, [confirmDraw, playWin, playLose])

  const handleCloseResult = () => {
    setResultPrize(null)
    setPhase(PHASE.IDLE)
    fetchState()
  }

  const availablePrizes = prizes.filter(p => p.remaining > 0)

  // ボタンの表示テキスト
  const btnLabel = {
    [PHASE.IDLE]: 'START',
    [PHASE.SPINNING]: 'STOP',
    [PHASE.STOPPING]: '減速中...',
    [PHASE.RESULT]: '次の抽選へ',
  }[phase]

  const btnColor = {
    [PHASE.IDLE]: 'from-green-500 to-emerald-600 hover:from-green-400 shadow-green-500/50',
    [PHASE.SPINNING]: 'from-red-500 to-rose-600 hover:from-red-400 shadow-red-500/50',
    [PHASE.STOPPING]: 'from-gray-500 to-gray-600 cursor-not-allowed shadow-gray-500/30',
    [PHASE.RESULT]: 'from-blue-500 to-indigo-600 hover:from-blue-400 shadow-blue-500/50',
  }[phase]

  const handleBtnClick = () => {
    if (phase === PHASE.IDLE) handleStart()
    else if (phase === PHASE.SPINNING) handleStop()
    else if (phase === PHASE.RESULT) handleCloseResult()
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#ffffff' }}>
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-300 bg-gray-50">
        <h1 className="text-xl font-black text-gray-900 tracking-wider">🎰 ルーレット抽選</h1>
        <div className="text-right">
          <p className="text-xs text-gray-600">累計抽選数</p>
          <p className="text-2xl font-black text-blue-600">{totalDrawCount}<span className="text-sm text-gray-600 ml-1">回</span></p>
        </div>
      </header>


      {/* ルーレット */}
      <div className="flex-1 flex flex-col items-center justify-center py-4 px-4">
        {/* ルーレット + ボタンを重ねる */}
        <div className="relative w-full max-w-[500px]">
          <Roulette
            prizes={prizes}
            pendingPrize={pendingPrize}
            onAnimationComplete={handleAnimationComplete}
            canvasRef={canvasRef}
          />

          {/* ルーレット中央のボタン */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              onClick={handleBtnClick}
              disabled={phase === PHASE.STOPPING || availablePrizes.length === 0}
              className={`btn-start pointer-events-auto w-32 h-32 rounded-full font-black text-lg text-white
                bg-gradient-to-b ${btnColor} shadow-2xl
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center text-center leading-tight`}
            >
              {availablePrizes.length === 0 ? '景品\nなし' : btnLabel}
            </button>
          </div>
        </div>

        {/* 景品凡例 */}
        <PrizeLegend prizes={prizes} />

        {availablePrizes.length === 0 && prizes.length > 0 && (
          <p className="mt-3 text-red-400 text-sm">全景品の在庫がなくなりました</p>
        )}
      </div>

      {/* 管理者リンク */}
      <footer className="text-center py-3 border-t border-slate-700">
        <a href="/admin" className="text-gray-500 text-xs hover:text-gray-300 transition-colors">
          管理画面
        </a>
      </footer>

      {/* 当選結果モーダル */}
      {resultPrize && (
        <ResultModal
          prize={resultPrize}
          prizes={prizes}
          totalCount={resultCount}
          onClose={handleCloseResult}
        />
      )}
    </div>
  )
}

