import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import pkg from 'pg'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { Pool } = pkg
const app = express()
const PORT = process.env.PORT || 3001
const __dirname = dirname(fileURLToPath(import.meta.url))

// Neon PostgreSQL接続
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:password@localhost:5432/neondb',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
})

// 接続テスト
pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err)
})

app.use(cors())
app.use(express.json())

// フロントエンドのビルド済みファイルを静的ファイルとして提供
const distPath = join(__dirname, '../frontend/dist')
console.log(`📁 Serving static files from: ${distPath}`)

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

// テーブル初期化
async function initializeDatabase() {
  try {
    // テーブル作成
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prizes (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        "initialCount" INTEGER NOT NULL DEFAULT 1,
        remaining INTEGER NOT NULL DEFAULT 1,
        weight REAL NOT NULL DEFAULT 10,
        color VARCHAR(50) DEFAULT '#808080',
        "timeSlots" TEXT DEFAULT '[]',
        "triggerAtCount" INTEGER,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS history (
        id UUID PRIMARY KEY,
        count INTEGER NOT NULL,
        "prizeName" VARCHAR(255) NOT NULL,
        "drawnAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reset_snapshots (
        id UUID PRIMARY KEY,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "prizesData" TEXT NOT NULL,
        "historyData" TEXT NOT NULL,
        "settingsData" TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reset_history (
        id UUID PRIMARY KEY,
        "snapshotId" UUID NOT NULL REFERENCES reset_snapshots(id),
        "resetAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Settings の初期化
    const initCount = await pool.query("SELECT value FROM settings WHERE key='totalDrawCount'")
    if (initCount.rows.length === 0) {
      await pool.query("INSERT INTO settings (key, value) VALUES ('totalDrawCount', '0')")
    }

    const soundSettings = await pool.query("SELECT value FROM settings WHERE key='soundConfig'")
    if (soundSettings.rows.length === 0) {
      const defaultSounds = JSON.stringify({
        drainrollSound: 'default',
        winSound: 'fanfare',
        loseSound: 'buzz'
      })
      await pool.query("INSERT INTO settings (key, value) VALUES ('soundConfig', $1)", [defaultSounds])
    }

    const resultSettings = await pool.query("SELECT value FROM settings WHERE key='resultConfig'")
    if (resultSettings.rows.length === 0) {
      const defaultResult = JSON.stringify({
        loseTitle: 'またの機会に！',
        winTitle: '当選おめでとう！',
        topPrizeMessage: '✨ おめでとうございます！ ✨',
        closeButtonText: '次の抽選へ',
        tapToCloseText: '画面をタップしても閉じます'
      })
      await pool.query("INSERT INTO settings (key, value) VALUES ('resultConfig', $1)", [defaultResult])
    }

    // デフォルト景品の追加
    const prizeCount = await pool.query("SELECT COUNT(*) as cnt FROM prizes")
    if (parseInt(prizeCount.rows[0].cnt) === 0) {
      const defaults = [
        { name: '1等', initialCount: 2, weight: 1, color: '#FFD700' },
        { name: '2等', initialCount: 5, weight: 3, color: '#C0C0C0' },
        { name: '3等', initialCount: 20, weight: 10, color: '#CD7F32' },
        { name: 'ハズレ', initialCount: 200, weight: 60, color: '#9CA3AF' },
      ]
      for (const p of defaults) {
        await pool.query(
          'INSERT INTO prizes (id, name, "initialCount", remaining, weight, color) VALUES ($1, $2, $3, $4, $5, $6)',
          [uuidv4(), p.name, p.initialCount, p.initialCount, p.weight, p.color]
        )
      }
    }

    console.log('✅ Database initialized successfully')
  } catch (error) {
    console.error('Database initialization error:', error)
  }
}

// 現在時刻が景品の公開時間内かを確認
function isPrizeAvailable(prize) {
  let timeSlots = []
  try {
    timeSlots = prize.timeSlots ? JSON.parse(prize.timeSlots) : []
  } catch (e) {
    return true
  }

  if (timeSlots.length === 0) return true

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

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

// 抽選ロジック
function pickWinner(prizes, nextCount) {
  const triggered = prizes.find(
    p => p.remaining > 0 && p.triggerAtCount === nextCount && isPrizeAvailable(p)
  )
  if (triggered) return triggered

  const available = prizes.filter(p => p.remaining > 0 && isPrizeAvailable(p))
  if (available.length === 0) return null

  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0)
  let rand = Math.random() * totalWeight
  for (const prize of available) {
    rand -= prize.weight
    if (rand <= 0) return prize
  }
  return available[available.length - 1]
}

// データ正規化
function normalizePrize(prize) {
  return prize
}

// ── API エンドポイント ──

// 全体状態の取得
app.get('/api/state', async (req, res) => {
  try {
    const prizes = await pool.query("SELECT * FROM prizes ORDER BY weight ASC")
    const countRow = await pool.query("SELECT value FROM settings WHERE key='totalDrawCount'")
    const history = await pool.query("SELECT * FROM history ORDER BY count DESC LIMIT 200")

    let soundConfig = { drainrollSound: 'default', winSound: 'fanfare', loseSound: 'buzz' }
    const soundRow = await pool.query("SELECT value FROM settings WHERE key='soundConfig'")
    if (soundRow.rows.length > 0) {
      try {
        soundConfig = JSON.parse(soundRow.rows[0].value)
      } catch (e) {}
    }

    let resultConfig = {
      loseTitle: 'またの機会に！',
      winTitle: '当選おめでとう！',
      topPrizeMessage: '✨ おめでとうございます！ ✨',
      closeButtonText: '次の抽選へ',
      tapToCloseText: '画面をタップしても閉じます'
    }
    const resultRow = await pool.query("SELECT value FROM settings WHERE key='resultConfig'")
    if (resultRow.rows.length > 0) {
      try {
        resultConfig = JSON.parse(resultRow.rows[0].value)
      } catch (e) {}
    }

    res.json({
      prizes: prizes.rows.map(normalizePrize),
      totalDrawCount: parseInt(countRow.rows[0].value),
      history: history.rows,
      soundConfig,
      resultConfig
    })
  } catch (error) {
    console.error('Error in /api/state:', error)
    res.status(500).json({ error: error.message })
  }
})

// 抽選実行
app.post('/api/draw/pick', async (req, res) => {
  try {
    const prizes = await pool.query("SELECT * FROM prizes")
    const countRow = await pool.query("SELECT value FROM settings WHERE key='totalDrawCount'")
    const nextCount = parseInt(countRow.rows[0].value) + 1

    const winner = pickWinner(prizes.rows, nextCount)
    if (!winner) return res.status(400).json({ error: '景品がありません' })

    res.json({ prize: winner, nextCount })
  } catch (error) {
    console.error('Error in /api/draw/pick:', error)
    res.status(500).json({ error: error.message })
  }
})

// 抽選の確定
app.post('/api/draw/confirm', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { prizeId } = req.body

    const prize = await client.query("SELECT * FROM prizes WHERE id=$1", [prizeId])
    if (prize.rows.length === 0) return res.status(404).json({ error: '景品が見つかりません' })
    if (prize.rows[0].remaining <= 0) return res.status(400).json({ error: '在庫なし' })

    await client.query("UPDATE prizes SET remaining = remaining - 1 WHERE id=$1", [prizeId])
    await client.query("UPDATE settings SET value = (CAST(value AS INTEGER) + 1)::TEXT WHERE key='totalDrawCount'")

    const newCountRow = await client.query("SELECT value FROM settings WHERE key='totalDrawCount'")
    const newCount = parseInt(newCountRow.rows[0].value)

    await client.query(
      "INSERT INTO history (id, count, \"prizeName\", \"drawnAt\") VALUES ($1, $2, $3, $4)",
      [uuidv4(), newCount, prize.rows[0].name, new Date().toISOString()]
    )

    const updatedPrizes = await client.query("SELECT * FROM prizes ORDER BY weight ASC")

    await client.query('COMMIT')
    res.json({ success: true, totalDrawCount: newCount, prizes: updatedPrizes.rows.map(normalizePrize) })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error in /api/draw/confirm:', error)
    res.status(500).json({ error: error.message })
  } finally {
    client.release()
  }
})

// 景品管理
app.get('/api/prizes', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM prizes ORDER BY weight ASC")
    res.json(result.rows.map(normalizePrize))
  } catch (error) {
    console.error('Error in /api/prizes:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/prizes', async (req, res) => {
  try {
    const { name, initialCount, weight, color, timeSlots, triggerAtCount } = req.body
    const id = uuidv4()
    await pool.query(
      'INSERT INTO prizes (id, name, "initialCount", remaining, weight, color, "timeSlots", "triggerAtCount") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, name, initialCount, initialCount, weight, color || '#808080', JSON.stringify(timeSlots || []), triggerAtCount || null]
    )
    res.json({ id, name, initialCount, remaining: initialCount, weight, color })
  } catch (error) {
    console.error('Error in POST /api/prizes:', error)
    res.status(500).json({ error: error.message })
  }
})

app.put('/api/prizes/:id', async (req, res) => {
  try {
    const { name, initialCount, remaining, weight, color, timeSlots, triggerAtCount } = req.body
    await pool.query(
      'UPDATE prizes SET name=$1, "initialCount"=$2, remaining=$3, weight=$4, color=$5, "timeSlots"=$6, "triggerAtCount"=$7 WHERE id=$8',
      [name, initialCount, remaining, weight, color, JSON.stringify(timeSlots || []), triggerAtCount || null, req.params.id]
    )
    res.json({ success: true })
  } catch (error) {
    console.error('Error in PUT /api/prizes:', error)
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/prizes/:id', async (req, res) => {
  try {
    await pool.query("DELETE FROM prizes WHERE id=$1", [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/prizes:', error)
    res.status(500).json({ error: error.message })
  }
})

// 音声設定
app.get('/api/sound-config', async (req, res) => {
  try {
    let soundConfig = { drainrollSound: 'default', winSound: 'fanfare', loseSound: 'buzz' }
    const soundRow = await pool.query("SELECT value FROM settings WHERE key='soundConfig'")
    if (soundRow.rows.length > 0) {
      try {
        soundConfig = JSON.parse(soundRow.rows[0].value)
      } catch (e) {}
    }
    res.json(soundConfig)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/sound-config', async (req, res) => {
  try {
    const { drainrollSound, winSound, loseSound } = req.body
    const soundConfig = JSON.stringify({
      drainrollSound: drainrollSound || 'default',
      winSound: winSound || 'fanfare',
      loseSound: loseSound || 'buzz'
    })
    await pool.query("UPDATE settings SET value=$1 WHERE key='soundConfig'", [soundConfig])
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 抽選結果テキスト設定
app.get('/api/result-config', async (req, res) => {
  try {
    let resultConfig = {
      loseTitle: 'またの機会に！',
      winTitle: '当選おめでとう！',
      topPrizeMessage: '✨ おめでとうございます！ ✨',
      closeButtonText: '次の抽選へ',
      tapToCloseText: '画面をタップしても閉じます'
    }
    const resultRow = await pool.query("SELECT value FROM settings WHERE key='resultConfig'")
    if (resultRow.rows.length > 0) {
      try {
        resultConfig = JSON.parse(resultRow.rows[0].value)
      } catch (e) {}
    }
    res.json(resultConfig)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/result-config', async (req, res) => {
  try {
    const { loseTitle, winTitle, topPrizeMessage, closeButtonText, tapToCloseText } = req.body
    const resultConfig = JSON.stringify({
      loseTitle: loseTitle || 'またの機会に！',
      winTitle: winTitle || '当選おめでとう！',
      topPrizeMessage: topPrizeMessage || '✨ おめでとうございます！ ✨',
      closeButtonText: closeButtonText || '次の抽選へ',
      tapToCloseText: tapToCloseText || '画面をタップしても閉じます'
    })
    await pool.query("UPDATE settings SET value=$1 WHERE key='resultConfig'", [resultConfig])
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 履歴・リセット
app.get('/api/history', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM history ORDER BY count DESC")
    res.json(result.rows)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/history', async (req, res) => {
  try {
    await pool.query("DELETE FROM history")
    await pool.query("UPDATE settings SET value='0' WHERE key='totalDrawCount'")
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/reset', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const timestamp = new Date().toISOString()
    console.log(`🔴 RESET REQUEST RECEIVED at ${timestamp}`)

    // スナップショット保存
    const snapshotId = uuidv4()
    const prizes = await client.query("SELECT * FROM prizes")
    const history = await client.query("SELECT * FROM history")
    const settings = await client.query("SELECT * FROM settings")

    await client.query(
      'INSERT INTO reset_snapshots (id, "createdAt", "prizesData", "historyData", "settingsData") VALUES ($1, $2, $3, $4, $5)',
      [snapshotId, timestamp, JSON.stringify(prizes.rows), JSON.stringify(history.rows), JSON.stringify(settings.rows)]
    )

    // リセット履歴記録
    await client.query(
      'INSERT INTO reset_history (id, "snapshotId", "resetAt") VALUES ($1, $2, $3)',
      [uuidv4(), snapshotId, timestamp]
    )

    // 古いスナップショット削除
    const oldSnapshots = await client.query(`
      SELECT s.id FROM reset_snapshots s
      LEFT JOIN reset_history h ON s.id = h."snapshotId"
      ORDER BY h."resetAt" DESC
      LIMIT -1 OFFSET 10
    `)
    for (const s of oldSnapshots.rows) {
      await client.query("DELETE FROM reset_snapshots WHERE id = $1", [s.id])
    }

    // リセット実行
    await client.query("UPDATE prizes SET remaining = \"initialCount\"")
    await client.query("DELETE FROM history")
    await client.query("UPDATE settings SET value='0' WHERE key='totalDrawCount'")

    await client.query('COMMIT')
    res.json({ success: true, snapshotId, resetAt: timestamp })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error in /api/reset:', error)
    res.status(500).json({ error: error.message })
  } finally {
    client.release()
  }
})

// リセット履歴取得
app.get('/api/reset-history', async (req, res) => {
  try {
    const history = await pool.query(`
      SELECT h.id, h."snapshotId", h."resetAt", s."createdAt"
      FROM reset_history h
      JOIN reset_snapshots s ON h."snapshotId" = s.id
      ORDER BY h."resetAt" DESC
      LIMIT 10
    `)
    res.json(history.rows)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// スナップショットから復元
app.post('/api/restore/:snapshotId', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { snapshotId } = req.params
    const snapshot = await client.query("SELECT * FROM reset_snapshots WHERE id = $1", [snapshotId])

    if (snapshot.rows.length === 0) {
      return res.status(404).json({ error: 'Snapshot not found' })
    }

    const prizes = JSON.parse(snapshot.rows[0].prizesData)
    const history = JSON.parse(snapshot.rows[0].historyData)
    const settings = JSON.parse(snapshot.rows[0].settingsData)

    // 景品復元
    await client.query("DELETE FROM prizes")
    for (const p of prizes) {
      await client.query(
        'INSERT INTO prizes (id, name, "initialCount", remaining, weight, color, "timeSlots", "triggerAtCount") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [p.id, p.name, p.initialCount, p.remaining, p.weight, p.color, p.timeSlots || '[]', p.triggerAtCount || null]
      )
    }

    // 履歴復元
    await client.query("DELETE FROM history")
    for (const h of history) {
      await client.query(
        'INSERT INTO history (id, count, "prizeName", "drawnAt") VALUES ($1, $2, $3, $4)',
        [h.id, h.count, h.prizeName, h.drawnAt]
      )
    }

    // 設定復元
    for (const s of settings) {
      await client.query("UPDATE settings SET value = $1 WHERE key = $2", [s.value, s.key])
    }

    await client.query('COMMIT')
    console.log(`↩️  Restored from snapshot: ${snapshotId}`)
    res.json({ success: true })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Restore error:', error)
    res.status(500).json({ error: error.message })
  } finally {
    client.release()
  }
})

// SPA のフォールバック
app.get('*', (req, res) => {
  const indexPath = join(distPath, 'index.html')
  if (existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    console.error(`❌ index.html not found at ${indexPath}`)
    res.status(404).json({ error: 'Frontend build not found' })
  }
})

// サーバー起動
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ サーバー起動: http://0.0.0.0:${PORT}`)
    console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Neon PostgreSQL' : 'Local PostgreSQL'}`)
  })
})
