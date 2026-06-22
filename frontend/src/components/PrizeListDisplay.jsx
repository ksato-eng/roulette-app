export default function PrizeListDisplay({ prizes }) {
  const available = prizes.filter(p => p.remaining > 0)

  return (
    <div className="flex flex-wrap gap-2 justify-center px-2">
      {prizes.map(p => (
        <div
          key={p.id}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-opacity ${
            p.remaining === 0 ? 'opacity-30' : 'opacity-100'
          }`}
          style={{ background: `${p.color}20`, border: `2px solid ${p.color}`, color: p.color }}
        >
          <span>{p.name}</span>
          <span className="text-gray-700 text-xs">
            残り<span className="font-black text-base">{p.remaining}</span>個
          </span>
        </div>
      ))}
      {available.length === 0 && (
        <p className="text-gray-600 text-sm">景品がありません</p>
      )}
    </div>
  )
}
