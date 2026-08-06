import express from 'express'
import cors from 'cors'
import { DatabaseSync } from 'node:sqlite'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const app = express()
const PORT = process.env.PORT || 3001
const __dirname = dirname(fileURLToPath(import.meta.url))

app.use(cors())
app.use(express.json())

// フロントエンドのビルド済みファイルを静的ファイルとして提供
const distPath = join(__dirname, '../frontend/dist')
console.log(`📁 Serving static files from: ${distPath}`)

// ファイルが存在するか確認
import { existsSync } from 'node:fs'
if (!existsSync(distPath)) {
  console.warn(`⚠️  Warning: dist directory not found at ${distPath}`)
} else {
  console.log(`✅ dist directory found`)
}

app.use(express.static(distPath))

// 音声ファイルを public フォルダから提供
const publicPath = join(__dirname, 'public')
app.use('/sounds', express.static(join(publicPath, 'sounds')))

// node:sqlite（Node 22.5+ 組み込み、Node 24 で安定）
const db = new DatabaseSync('roulette.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS prizes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initialCount INTEGER NOT NULL DEFAULT 1,
    remaining INTEGER NOT NULL DEFAULT 1,
    weight REAL NOT NULL DEFAULT 10,
    color TEXT DEFAULT '#808080',
    timeSlots TEXT DEFAULT '[]',
    triggerAtCount INTEGER
  );

  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    prizeName TEXT NOT NULL,
    drawnAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reset_snapshots (
    id TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL,
    prizesData TEXT NOT NULL,
    historyData TEXT NOT NULL,
    settingsData TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reset_history (
    id TEXT PRIMARY KEY,
    snapshotId TEXT NOT NULL,
    resetAt TEXT NOT NULL
  );
`)

// マイグレーション：古いスキーマから新しいスキーマへ
try {
  const testPrize = db.prepare("SELECT timeSlots FROM prizes LIMIT 1").get()
  // timeSlots カラムが存在したら、既に新スキーマ
} catch (e) {
  // 古いスキーマのため、カラムを追加
  try {
    db.exec(`
      ALTER TABLE prizes ADD COLUMN timeSlots TEXT DEFAULT '[]';
      ALTER TABLE prizes ADD COLUMN drainrollSound TEXT DEFAULT 'default';
      ALTER TABLE prizes ADD COLUMN winSound TEXT DEFAULT 'fanfare';
      ALTER TABLE prizes ADD COLUMN loseSound TEXT DEFAULT 'buzz';
    `)

    // 既存データの unlockTime/untilTime を timeSlots に変換
    const oldPrizes = db.prepare("SELECT id, unlockTime, untilTime FROM prizes").all()
    const updateStmt = db.prepare("UPDATE prizes SET timeSlots = ? WHERE id = ?")

    oldPrizes.forEach(p => {
      if (p.unlockTime) {
        const timeSlot = {
          unlockTime: p.unlockTime,
          untilTime: p.untilTime || null
        }
        updateStmt.run(JSON.stringify([timeSlot]), p.id)
      }
    })

    console.log('✅ Migration complete: unlockTime/untilTime → timeSlots')
  } catch (migrationErr) {
    console.log('ℹ️  Migration already applied or schema is up to date')
  }
}

// Settings の初期化
const initCount = db.prepare("SELECT value FROM settings WHERE key='totalDrawCount'").get()
if (!initCount) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('totalDrawCount', '0')").run()
}

const soundSettings = db.prepare("SELECT value FROM settings WHERE key='soundConfig'").get()
if (!soundSettings) {
  const defaultSounds = JSON.stringify({
    drainrollSound: 'default',
    winSound: 'fanfare',
    loseSound: 'buzz'
  })
  db.prepare("INSERT INTO settings (key, value) VALUES ('soundConfig', ?)").run(defaultSounds)
}

const resultSettings = db.prepare("SELECT value FROM settings WHERE key='resultConfig'").get()
if (!resultSettings) {
  const defaultResult = JSON.stringify({
    loseTitle: 'またの機会に！',
    winTitle: '当選おめでとう！',
    topPrizeMessage: '✨ おめでとうございます！ ✨',
    closeButtonText: '次の抽選へ',
    tapToCloseText: '画面をタップしても閉じます'
  })
  db.prepare("INSERT INTO settings (key, value) VALUES ('resultConfig', ?)").run(defaultResult)
}

// デフォルト景品の追加（テーブルが空の場合）
const prizeCount = db.prepare("SELECT COUNT(*) as cnt FROM prizes").get()
if (prizeCount.cnt === 0) {
  const defaults = [
    { name: '1等', initialCount: 2, weight: 1, color: '#FFD700' },
    { name: '2等', initialCount: 5, weight: 3, color: '#C0C0C0' },
    { name: '3等', initialCount: 20, weight: 10, color: '#CD7F32' },
    { name: 'ハズレ', initialCount: 200, weight: 60, color: '#9CA3AF' },
  ]
  const ins = db.prepare(
    "INSERT INTO prizes (id, name, initialCount, remaining, weight, color) VALUES (?, ?, ?, ?, ?, ?)"
  )
  defaults.forEach(p => ins.run(uuidv4(), p.name, p.initialCount, p.initialCount, p.weight, p.color))
}

// 現在時刻が景品の公開時間内かを確認（複数時間帯対応）
function isPrizeAvailable(prize) {
  let timeSlots = []
  try {
    timeSlots = prize.timeSlots ? JSON.parse(prize.timeSlots) : []
  } catch (e) {
    return true
  }

  // 時間帯が設定されていない場合は常に有効
  if (timeSlots.length === 0) return true

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // いずれかの時間帯に当てはまればtrue
  return timeSlots.some(slot => {
    if (!slot.unlockTime) return true
    const [uh, um] = slot.unlockTime.split(':').map(Number)
    const unlockMinutes = uh * 60 + um
    if (nowMinutes < unlockMinutes) return false
    if (slot.untilTime) {
      const [th, tm] = slot.untilTime.split(':').map(Number)
      const untilMinutes = th * 60 + tm
      if (nowMinutes >= untilMinutes) return false
    }
    return true
  })
}

// 抽選ロジック：次の当選賞を決定
function pickWinner(prizes, nextCount) {
  // triggerAtCountによる強制当選チェック
  const triggered = prizes.find(
    p => p.remaining > 0 && p.triggerAtCount === nextCount && isPrizeAvailable(p)
  )
  if (triggered) return triggered

  // 有効な景品のフィルタリング
  const available = prizes.filter(p => p.remaining > 0 && isPrizeAvailable(p))
  if (available.length === 0) return null

  // 重み付き抽選
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0)
  let rand = Math.random() * totalWeight
  for (const prize of available) {
    rand -= prize.weight
    if (rand <= 0) return prize
  }
  return available[available.length - 1]
}

// ── データ正規化（古い形式を新しい形式に変換） ──────────────────────────

function normalizePrize(prize) {
  const normalized = { ...prize }

  // timeSlots のデフォルト化
  if (!normalized.timeSlots) {
    normalized.timeSlots = '[]'
  }

  // 古い音声設定を削除（共通設定に移行）
  delete normalized.drainrollSound
  delete normalized.winSound
  delete normalized.loseSound

  return normalized
}

// ── API エンドポイント ──────────────────────────────────────────────

// 全体状態の取得
app.get('/api/state', (req, res) => {
  const prizes = db.prepare("SELECT * FROM prizes ORDER BY weight ASC").all().map(normalizePrize)
  const countRow = db.prepare("SELECT value FROM settings WHERE key='totalDrawCount'").get()
  const history = db.prepare("SELECT * FROM history ORDER BY count DESC LIMIT 200").all()

  let soundConfig = { drainrollSound: 'default', winSound: 'fanfare', loseSound: 'buzz' }
  const soundRow = db.prepare("SELECT value FROM settings WHERE key='soundConfig'").get()
  if (soundRow) {
    try {
      soundConfig = JSON.parse(soundRow.value)
    } catch (e) {}
  }

  let resultConfig = {
    loseTitle: 'またの機会に！',
    winTitle: '当選おめでとう！',
    topPrizeMessage: '✨ おめでとうございます！ ✨',
    closeButtonText: '次の抽選へ',
    tapToCloseText: '画面をタップしても閉じます'
  }
  const resultRow = db.prepare("SELECT value FROM settings WHERE key='resultConfig'").get()
  if (resultRow) {
    try {
      resultConfig = JSON.parse(resultRow.value)
    } catch (e) {}
  }

  res.json({ prizes, totalDrawCount: parseInt(countRow.value), history, soundConfig, resultConfig })
})

// 抽選実行（当選者を決定して返す）
app.post('/api/draw/pick', (req, res) => {
  const prizes = db.prepare("SELECT * FROM prizes").all()
  const countRow = db.prepare("SELECT value FROM settings WHERE key='totalDrawCount'").get()
  const nextCount = parseInt(countRow.value) + 1

  const winner = pickWinner(prizes, nextCount)
  if (!winner) return res.status(400).json({ error: '景品がありません' })

  res.json({ prize: winner, nextCount })
})

// 抽選の確定（アニメーション完了後に呼ぶ）
app.post('/api/draw/confirm', (req, res) => {
  const { prizeId } = req.body
  const prize = db.prepare("SELECT * FROM prizes WHERE id=?").get(prizeId)
  if (!prize) return res.status(404).json({ error: '景品が見つかりません' })
  if (prize.remaining <= 0) return res.status(400).json({ error: '在庫なし' })

  db.prepare("UPDATE prizes SET remaining = remaining - 1 WHERE id=?").run(prizeId)
  db.prepare("UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key='totalDrawCount'").run()

  const newCountRow = db.prepare("SELECT value FROM settings WHERE key='totalDrawCount'").get()
  const newCount = parseInt(newCountRow.value)

  db.prepare("INSERT INTO history (id, count, prizeName, drawnAt) VALUES (?, ?, ?, ?)").run(
    uuidv4(), newCount, prize.name, new Date().toISOString()
  )

  const updatedPrizes = db.prepare("SELECT * FROM prizes ORDER BY weight ASC").all().map(normalizePrize)
  res.json({ success: true, totalDrawCount: newCount, prizes: updatedPrizes })
})

// ── 景品管理 ──────────────────────────────────────────────────────

app.get('/api/prizes', (req, res) => {
  res.json(db.prepare("SELECT * FROM prizes ORDER BY weight ASC").all().map(normalizePrize))
})

app.post('/api/prizes', (req, res) => {
  const { name, initialCount, weight, color, timeSlots, triggerAtCount } = req.body
  const id = uuidv4()
  db.prepare(
    "INSERT INTO prizes (id, name, initialCount, remaining, weight, color, timeSlots, triggerAtCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, name, initialCount, initialCount, weight, color || '#808080',
    JSON.stringify(timeSlots || []), triggerAtCount || null
  )
  res.json({ id, name, initialCount, remaining: initialCount, weight, color })
})

app.put('/api/prizes/:id', (req, res) => {
  const { name, initialCount, remaining, weight, color, timeSlots, triggerAtCount } = req.body
  db.prepare(
    "UPDATE prizes SET name=?, initialCount=?, remaining=?, weight=?, color=?, timeSlots=?, triggerAtCount=? WHERE id=?"
  ).run(
    name, initialCount, remaining, weight, color,
    JSON.stringify(timeSlots || []), triggerAtCount || null,
    req.params.id
  )
  res.json({ success: true })
})

app.delete('/api/prizes/:id', (req, res) => {
  db.prepare("DELETE FROM prizes WHERE id=?").run(req.params.id)
  res.json({ success: true })
})

// 共通音声設定
app.get('/api/sound-config', (req, res) => {
  let soundConfig = { drainrollSound: 'default', winSound: 'fanfare', loseSound: 'buzz' }
  const soundRow = db.prepare("SELECT value FROM settings WHERE key='soundConfig'").get()
  if (soundRow) {
    try {
      soundConfig = JSON.parse(soundRow.value)
    } catch (e) {}
  }
  res.json(soundConfig)
})

app.post('/api/sound-config', (req, res) => {
  const { drainrollSound, winSound, loseSound } = req.body
  const soundConfig = JSON.stringify({
    drainrollSound: drainrollSound || 'default',
    winSound: winSound || 'fanfare',
    loseSound: loseSound || 'buzz'
  })
  db.prepare("UPDATE settings SET value=? WHERE key='soundConfig'").run(soundConfig)
  res.json({ success: true })
})

// 抽選結果テキスト設定
app.get('/api/result-config', (req, res) => {
  let resultConfig = {
    loseTitle: 'またの機会に！',
    winTitle: '当選おめでとう！',
    topPrizeMessage: '✨ おめでとうございます！ ✨',
    closeButtonText: '次の抽選へ',
    tapToCloseText: '画面をタップしても閉じます'
  }
  const resultRow = db.prepare("SELECT value FROM settings WHERE key='resultConfig'").get()
  if (resultRow) {
    try {
      resultConfig = JSON.parse(resultRow.value)
    } catch (e) {}
  }
  res.json(resultConfig)
})

app.post('/api/result-config', (req, res) => {
  const { loseTitle, winTitle, topPrizeMessage, closeButtonText, tapToCloseText } = req.body
  const resultConfig = JSON.stringify({
    loseTitle: loseTitle || 'またの機会に！',
    winTitle: winTitle || '当選おめでとう！',
    topPrizeMessage: topPrizeMessage || '✨ おめでとうございます！ ✨',
    closeButtonText: closeButtonText || '次の抽選へ',
    tapToCloseText: tapToCloseText || '画面をタップしても閉じます'
  })
  db.prepare("UPDATE settings SET value=? WHERE key='resultConfig'").run(resultConfig)
  res.json({ success: true })
})

// ── 履歴・リセット ────────────────────────────────────────────────

app.get('/api/history', (req, res) => {
  res.json(db.prepare("SELECT * FROM history ORDER BY count DESC").all())
})

app.delete('/api/history', (req, res) => {
  db.prepare("DELETE FROM history").run()
  db.prepare("UPDATE settings SET value='0' WHERE key='totalDrawCount'").run()
  res.json({ success: true })
})

app.post('/api/reset', (req, res) => {
  const timestamp = new Date().toISOString()
  console.log(`🔴 RESET REQUEST RECEIVED at ${timestamp}`)
  console.log(`   Stack trace:`, new Error().stack)

  // リセット前にスナップショットを保存
  const snapshotId = uuidv4()
  const prizes = db.prepare("SELECT * FROM prizes").all()
  const history = db.prepare("SELECT * FROM history").all()
  const allSettings = db.prepare("SELECT * FROM settings").all()

  const snapshotData = {
    prizes,
    history,
    settings: Object.fromEntries(allSettings.map(s => [s.key, s.value]))
  }

  db.prepare(
    "INSERT INTO reset_snapshots (id, createdAt, prizesData, historyData, settingsData) VALUES (?, ?, ?, ?, ?)"
  ).run(
    snapshotId,
    new Date().toISOString(),
    JSON.stringify(prizes),
    JSON.stringify(history),
    JSON.stringify(allSettings.map(s => ({ key: s.key, value: s.value })))
  )

  // リセット履歴を記録
  db.prepare("INSERT INTO reset_history (id, snapshotId, resetAt) VALUES (?, ?, ?)").run(
    uuidv4(),
    snapshotId,
    new Date().toISOString()
  )

  // 10回分より古いスナップショットを削除
  const oldSnapshots = db.prepare(`
    SELECT s.id
    FROM reset_snapshots s
    LEFT JOIN reset_history h ON s.id = h.snapshotId
    ORDER BY h.resetAt DESC
    LIMIT -1 OFFSET 10
  `).all()

  oldSnapshots.forEach(s => {
    db.prepare("DELETE FROM reset_snapshots WHERE id = ?").run(s.id)
  })

  // 実際にリセット
  db.prepare("UPDATE prizes SET remaining = initialCount").run()
  db.prepare("DELETE FROM history").run()
  db.prepare("UPDATE settings SET value='0' WHERE key='totalDrawCount'").run()

  const completedAt = new Date().toISOString()
  console.log(`✅ RESET COMPLETED at ${completedAt}. Snapshot ID: ${snapshotId}`)
  res.json({ success: true, snapshotId, resetAt: completedAt })
})

// リセット履歴を取得（最新10回分）
app.get('/api/reset-history', (req, res) => {
  const history = db.prepare(`
    SELECT h.id, h.snapshotId, h.resetAt, s.createdAt
    FROM reset_history h
    JOIN reset_snapshots s ON h.snapshotId = s.id
    ORDER BY h.resetAt DESC
    LIMIT 10
  `).all()
  res.json(history)
})

// スナップショットから復元
app.post('/api/restore/:snapshotId', (req, res) => {
  const { snapshotId } = req.params
  const snapshot = db.prepare("SELECT * FROM reset_snapshots WHERE id = ?").get(snapshotId)

  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' })
  }

  try {
    const prizes = JSON.parse(snapshot.prizesData)
    const history = JSON.parse(snapshot.historyData)
    const settings = JSON.parse(snapshot.settingsData)

    // すべての prizes を削除して再挿入
    db.prepare("DELETE FROM prizes").run()
    const prizeStmt = db.prepare(
      "INSERT INTO prizes (id, name, initialCount, remaining, weight, color, timeSlots, triggerAtCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    prizes.forEach(p => {
      prizeStmt.run(p.id, p.name, p.initialCount, p.remaining, p.weight, p.color, p.timeSlots || '[]', p.triggerAtCount || null)
    })

    // 履歴を削除して再挿入
    db.prepare("DELETE FROM history").run()
    const histStmt = db.prepare("INSERT INTO history (id, count, prizeName, drawnAt) VALUES (?, ?, ?, ?)")
    history.forEach(h => {
      histStmt.run(h.id, h.count, h.prizeName, h.drawnAt)
    })

    // 設定を復元
    settings.forEach(s => {
      db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(s.value, s.key)
    })

    console.log(`↩️  Restored from snapshot: ${snapshotId}`)
    res.json({ success: true })
  } catch (e) {
    console.error('Restore error:', e)
    res.status(500).json({ error: 'Failed to restore snapshot' })
  }
})

// SPA のフォールバック：API 以外のパスは index.html を返す
app.get('*', (req, res) => {
  const indexPath = join(distPath, 'index.html')
  if (existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    console.error(`❌ index.html not found at ${indexPath}`)
    res.status(404).json({ error: 'Frontend build not found. Please check build process.' })
  }
})

app.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`)
})
