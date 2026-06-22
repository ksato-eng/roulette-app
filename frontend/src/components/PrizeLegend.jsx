// ルーレット下部に表示する景品凡例パネル
export default function PrizeLegend({ prizes }) {
  const available = prizes.filter(p => p.remaining > 0)
  const exhausted = prizes.filter(p => p.remaining === 0)

  return (
    <div className="w-full max-w-[500px] mx-auto mt-3 px-1">
      {/* 残りあり */}
      <div className="flex flex-wrap gap-2 justify-center">
        {available.map(p => (
          <div
            key={p.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold"
            style={{ background: `${p.color}20`, border: `2px solid ${p.color}` }}
          >
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
            <span style={{ color: p.color }}>{p.name}</span>
            <span style={{ color: '#1a202c' }} className="font-normal text-xs">残{p.remaining}</span>
          </div>
        ))}
      </div>

      {/* 在庫切れ */}
      {exhausted.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {exhausted.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs opacity-60"
              style={{ border: '1px solid #cbd5e1', color: '#64748b' }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-400" />
              <span>{p.name}</span>
              <span>在庫切れ</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
