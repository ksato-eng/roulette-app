import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

const ADMIN_PASSWORD = 'admin1234'

const DEFAULT_COLORS = [
  '#FFD700', '#C0C0C0', '#CD7F32', '#4CAF50',
  '#2196F3', '#9C27B0', '#FF5722', '#00BCD4',
  '#FF9800', '#9CA3AF',
]

// 音声選択肢
const SOUND_OPTIONS = {
  drainrollSound: [
    { value: 'default', label: 'ドラムロール（デフォルト）' },
    { value: 'electronic', label: 'ドラムロール（電子音）' },
    { value: 'synth', label: 'ドラムロール（シンセ）' },
  ],
  winSound: [
    { value: 'fanfare', label: 'ファンファーレ（デフォルト）' },
    { value: 'bell', label: 'ベル音' },
    { value: 'chime', label: 'チャイム' },
    { value: 'sparkle', label: 'キラキラ音' },
  ],
  loseSound: [
    { value: 'buzz', label: 'ブザー（デフォルト）' },
    { value: 'sad', label: '悲しい音' },
    { value: 'fail', label: 'エラー音' },
  ]
}

function PrizeForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    initialCount: 10,
    remaining: 10,
    weight: 10,
    color: '#808080',
    timeSlots: [],
    triggerAtCount: '',
    drainrollSound: 'default',
    winSound: 'fanfare',
    loseSound: 'buzz',
    ...initial,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAddTimeSlot = () => {
    if (form.timeSlots.length < 3) {
      set('timeSlots', [...form.timeSlots, { unlockTime: '09:00', untilTime: '10:00' }])
    }
  }

  const handleUpdateTimeSlot = (idx, slot) => {
    const updated = [...form.timeSlots]
    updated[idx] = slot
    set('timeSlots', updated)
  }

  const handleRemoveTimeSlot = (idx) => {
    set('timeSlots', form.timeSlots.filter((_, i) => i !== idx))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      initialCount: Number(form.initialCount),
      remaining: Number(form.remaining),
      weight: Number(form.weight),
      triggerAtCount: form.triggerAtCount ? Number(form.triggerAtCount) : null,
      timeSlots: form.timeSlots,
      drainrollSound: form.drainrollSound || 'default',
      winSound: form.winSound || 'fanfare',
      loseSound: form.loseSound || 'buzz',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-700 rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* 基本情報 */}
        <label className="col-span-2">
          <span className="text-xs text-gray-400">賞名 *</span>
          <input className="inp" value={form.name} onChange={e => set('name', e.target.value)} required />
        </label>
        <label>
          <span className="text-xs text-gray-400">初期数量</span>
          <input type="number" min="1" className="inp" value={form.initialCount}
            onChange={e => { set('initialCount', e.target.value); if (!initial) set('remaining', e.target.value) }} />
        </label>
        <label>
          <span className="text-xs text-gray-400">残数量</span>
          <input type="number" min="0" className="inp" value={form.remaining}
            onChange={e => set('remaining', e.target.value)} />
        </label>
        <label>
          <span className="text-xs text-gray-400">重み（大=出やすい）</span>
          <input type="number" min="0.1" step="0.1" className="inp" value={form.weight}
            onChange={e => set('weight', e.target.value)} />
          <span className="text-xs text-gray-500 mt-1 block">💡 例: 1等=1, 2等=3, 3等=10, ハズレ=60</span>
        </label>

        {/* 色選択 */}
        <label className="col-span-2">
          <span className="text-xs text-gray-400">色</span>
          <div className="flex gap-2 items-center mt-1">
            <input type="color" value={form.color} onChange={e => set('color', e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
            <div className="flex flex-wrap gap-1">
              {DEFAULT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => set('color', c)}
                  className="w-5 h-5 rounded-full border-2"
                  style={{ background: c, borderColor: form.color === c ? 'white' : 'transparent' }} />
              ))}
            </div>
          </div>
        </label>

        {/* 確定当選 */}
        <label className="col-span-2">
          <span className="text-xs text-gray-400">〇人目で必ず当選</span>
          <input type="number" min="1" placeholder="例: 100" className="inp"
            value={form.triggerAtCount || ''} onChange={e => set('triggerAtCount', e.target.value)} />
          <span className="text-xs text-gray-500 mt-1 block">💡 100 と入力すると、100人目の抽選でこの景品が確定当選</span>
        </label>
      </div>

      {/* 複数時間帯設定 */}
      <div className="border-t border-slate-600 pt-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400 block">⏰ 時間帯による解放設定（最大3個）</span>
          <button type="button" onClick={handleAddTimeSlot} disabled={form.timeSlots.length >= 3}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded">
            + 追加
          </button>
        </div>
        <span className="text-xs text-gray-500 block mb-2">例：午前10:00～11:00、午後14:00～15:00に出すように設定できます</span>

        {form.timeSlots.length === 0 ? (
          <p className="text-xs text-gray-500 italic">設定なし（常に有効）</p>
        ) : (
          <div className="space-y-2">
            {form.timeSlots.map((slot, idx) => (
              <div key={idx} className="flex gap-2 items-end bg-slate-600 p-2 rounded">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-1">開始時刻</label>
                  <input type="time" className="inp" value={slot.unlockTime || ''}
                    onChange={e => handleUpdateTimeSlot(idx, { ...slot, unlockTime: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-1">終了時刻</label>
                  <input type="time" className="inp" value={slot.untilTime || ''}
                    onChange={e => handleUpdateTimeSlot(idx, { ...slot, untilTime: e.target.value })} />
                </div>
                <button type="button" onClick={() => handleRemoveTimeSlot(idx)}
                  className="px-2 py-1 bg-red-900/60 hover:bg-red-700 text-red-300 rounded text-xs font-bold">
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 音声設定 */}
      <div className="border-t border-slate-600 pt-3 space-y-2">
        <label className="col-span-2 block">
          <span className="text-xs text-gray-400">🔊 ドラムロール音</span>
          <select value={form.drainrollSound} onChange={e => set('drainrollSound', e.target.value)}
            className="inp">
            {SOUND_OPTIONS.drainrollSound.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block">
          <span className="text-xs text-gray-400">🎉 当選音</span>
          <select value={form.winSound} onChange={e => set('winSound', e.target.value)}
            className="inp">
            {SOUND_OPTIONS.winSound.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block">
          <span className="text-xs text-gray-400">😅 ハズレ音</span>
          <select value={form.loseSound} onChange={e => set('loseSound', e.target.value)}
            className="inp">
            {SOUND_OPTIONS.loseSound.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2 pt-2 border-t border-slate-600">
        <button type="submit"
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm">
          保存
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg text-sm">
          キャンセル
        </button>
      </div>
    </form>
  )
}

function PrizeRow({ prize, onEdit, onDelete }) {
  let timeSlots = []
  try {
    timeSlots = prize.timeSlots ? JSON.parse(prize.timeSlots) : []
  } catch (e) {}

  return (
    <div className="flex items-center gap-3 bg-slate-700 rounded-lg px-3 py-2">
      <div className="w-4 h-4 rounded-full shrink-0" style={{ background: prize.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white">{prize.name}</span>
          {prize.triggerAtCount && (
            <span className="text-xs bg-yellow-500/20 text-yellow-300 px-1.5 rounded">
              {prize.triggerAtCount}人目
            </span>
          )}
          {timeSlots.length > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 rounded">
              {timeSlots.map(s => `${s.unlockTime}${s.untilTime ? `〜${s.untilTime}` : ''}`).join(', ')}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          残{prize.remaining}/{prize.initialCount}個 · 重み{prize.weight}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={() => onEdit(prize)}
          className="text-xs px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-white">編集</button>
        <button onClick={() => onDelete(prize.id)}
          className="text-xs px-2 py-1 bg-red-900/60 hover:bg-red-700 rounded text-red-300">削除</button>
      </div>
    </div>
  )
}

function exportCSV(history) {
  const header = '抽選番号,日時,当選賞\n'
  const rows = history.map(h => `${h.count},${h.drawnAt},${h.prizeName}`).join('\n')
  const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `roulette_history_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)
  const { prizes, history, totalDrawCount, loading, fetchState, createPrize, updatePrize, deletePrize, clearHistory, resetAll } = useAppStore()
  const [editingPrize, setEditingPrize] = useState(null)  // null | prize | 'new'
  const [activeTab, setActiveTab] = useState('prizes')

  useEffect(() => {
    if (authed) fetchState()
  }, [authed])

  const handleLogin = (e) => {
    e.preventDefault()
    if (pwInput === ADMIN_PASSWORD) {
      setAuthed(true)
    } else {
      setPwError(true)
      setPwInput('')
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-8 shadow-xl">
          <h1 className="text-2xl font-black text-white text-center mb-6">🔐 管理画面</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="パスワード"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false) }}
              className="inp"
              autoFocus
            />
            {pwError && <p className="text-red-400 text-sm">パスワードが違います</p>}
            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl">
              ログイン
            </button>
          </form>
          <p className="text-gray-500 text-xs text-center mt-4">初期パスワード: admin1234</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900">⚙️ 管理画面</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">累計 <strong className="text-blue-600">{totalDrawCount}</strong> 回</span>
          <a href="/" className="text-xs text-gray-700 hover:text-blue-600 border border-gray-400 hover:border-blue-500 px-2 py-1 rounded transition-colors">
            ← 抽選へ
          </a>
        </div>
      </header>

      {/* タブ */}
      <div className="flex border-b border-gray-300 bg-gray-50">
        {[['prizes', '景品管理'], ['history', '抽選履歴'], ['danger', 'リセット']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              activeTab === id ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto p-4">

        {/* 景品管理タブ */}
        {activeTab === 'prizes' && (
          <div className="space-y-3">
            {/* 説明 */}
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-4">
              <h3 className="font-bold text-blue-900 text-sm mb-2">📖 設定ガイド</h3>
              <ul className="text-xs text-gray-800 space-y-1">
                <li>✓ <strong>重み</strong> - 数字が大きいほど当選しやすい（例：ハズレ=60, 3等=10, 2等=3, 1等=1）</li>
                <li>✓ <strong>〇人目で当選</strong> - 指定した抽選回数で必ずその景品が当選</li>
                <li>✓ <strong>時間帯設定</strong> - 特定時間のみ景品を有効化（例：イベント盛り上げ用）</li>
              </ul>
            </div>

            <button
              onClick={() => setEditingPrize('new')}
              className="w-full py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl"
            >
              + 景品を追加
            </button>

            {editingPrize === 'new' && (
              <PrizeForm
                onSave={async (data) => { await createPrize(data); setEditingPrize(null) }}
                onCancel={() => setEditingPrize(null)}
              />
            )}

            {loading && <p className="text-center text-gray-600 py-4">読み込み中...</p>}

            {prizes.map(p => (
              <div key={p.id}>
                {editingPrize?.id === p.id ? (
                  <PrizeForm
                    initial={p}
                    onSave={async (data) => { await updatePrize(p.id, data); setEditingPrize(null) }}
                    onCancel={() => setEditingPrize(null)}
                  />
                ) : (
                  <PrizeRow
                    prize={p}
                    onEdit={setEditingPrize}
                    onDelete={async (id) => {
                      if (confirm(`「${p.name}」を削除しますか？`)) await deletePrize(id)
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* 抽選履歴タブ */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {/* 説明 */}
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-4">
              <h3 className="font-bold text-blue-900 text-sm mb-2">📊 抽選履歴について</h3>
              <ul className="text-xs text-gray-800 space-y-1">
                <li>✓ すべての抽選結果が記録されます</li>
                <li>✓ CSVエクスポートで Excel に取り込み可能</li>
                <li>✓ リセット時に履歴のみクリアすることも可能</li>
              </ul>
            </div>

            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-700">全{history.length}件</p>
              <button onClick={() => exportCSV(history)}
                className="text-sm px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg font-bold text-white">
                CSVエクスポート
              </button>
            </div>

            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {history.length === 0 && (
                <p className="text-center text-gray-600 py-8">履歴がありません</p>
              )}
              {history.map(h => (
                <div key={h.id} className="flex items-center gap-3 bg-slate-700 rounded-lg px-3 py-2">
                  <span className="text-gray-400 text-sm w-12 text-right shrink-0">#{h.count}</span>
                  <span className="font-bold flex-1 text-white">{h.prizeName}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(h.drawnAt).toLocaleString('ja-JP', {
                      month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* リセットタブ */}
        {activeTab === 'danger' && (
          <div className="space-y-4 py-4">
            {/* 説明 */}
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
              <h3 className="font-bold text-red-900 text-sm mb-2">📋 リセット操作について</h3>
              <ul className="text-xs text-gray-800 space-y-1">
                <li>✓ <strong>履歴のみクリア</strong> - 抽選記録だけ削除（景品在庫は変わらない）</li>
                <li>✓ <strong>全データリセット</strong> - 在庫・履歴・累計回数すべてを初期値に戻す</li>
                <li>❌ 操作は元に戻せません。本当に必要な場合だけ実行してください</li>
              </ul>
            </div>

            <div className="bg-slate-800 rounded-xl p-4 space-y-3">
              <h2 className="font-bold text-yellow-400">⚠️ 危険な操作</h2>
              <p className="text-sm text-gray-400">操作は元に戻せません。慎重に実行してください。</p>

              <button
                onClick={async () => {
                  if (confirm('履歴のみクリアしますか？（景品の残数はリセットしません）')) {
                    await clearHistory()
                    alert('履歴をクリアしました')
                  }
                }}
                className="w-full py-3 bg-orange-700/60 hover:bg-orange-600 text-white font-bold rounded-xl"
              >
                履歴のみクリア
              </button>

              <button
                onClick={async () => {
                  if (confirm('全データをリセットしますか？\n・景品在庫を初期値に戻す\n・抽選履歴を全削除\n・累計回数をリセット')) {
                    await resetAll()
                    alert('リセット完了しました')
                  }
                }}
                className="w-full py-3 bg-red-700/80 hover:bg-red-600 text-white font-bold rounded-xl"
              >
                全データリセット
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
