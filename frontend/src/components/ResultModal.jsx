import Confetti from './Confetti'

// 上位賞かどうかを判定（ファンファーレ・紙吹雪の条件）
function isTopPrize(prize, prizes) {
  if (!prize || prizes.length === 0) return false
  const sorted = [...prizes].sort((a, b) => a.weight - b.weight)
  const rank = sorted.findIndex(p => p.id === prize.id)
  return rank < 2  // 上位2種類を「上位賞」とみなす
}

export default function ResultModal({ prize, prizes, totalCount, onClose }) {
  if (!prize) return null

  const isTop = isTopPrize(prize, prizes)
  const isLose = prize.weight === Math.max(...prizes.map(p => p.weight))

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <Confetti active={isTop} />

      <div
        className="relative max-w-sm w-full rounded-2xl p-8 text-center shadow-2xl"
        style={{
          background: `linear-gradient(135deg, ${prize.color}22, #1e293b)`,
          border: `3px solid ${prize.color}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 上位賞の光演出 */}
        {isTop && (
          <div
            className="absolute inset-0 rounded-2xl prize-shine pointer-events-none"
            style={{ mixBlendMode: 'screen' }}
          />
        )}

        {/* 絵文字 */}
        <div className="text-6xl mb-4">
          {isLose ? '😅' : isTop ? '🎉' : '🎊'}
        </div>

        <p className="text-gray-400 text-sm mb-2">第 {totalCount} 回目の抽選</p>

        <h2 className="text-2xl font-black text-white mb-1">
          {isLose ? 'またの機会に！' : '当選おめでとう！'}
        </h2>

        <div
          className="text-5xl font-black my-6 py-4 rounded-xl"
          style={{ color: prize.color, textShadow: `0 0 20px ${prize.color}88` }}
        >
          {prize.name}
        </div>

        {isTop && (
          <p className="text-yellow-300 text-sm font-bold mb-4 animate-pulse">
            ✨ おめでとうございます！ ✨
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full py-4 rounded-xl font-black text-lg text-white transition-transform active:scale-95"
          style={{ background: prize.color }}
        >
          次の抽選へ
        </button>

        <p className="text-gray-500 text-xs mt-3">画面をタップしても閉じます</p>
      </div>
    </div>
  )
}
