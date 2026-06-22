# 🎰 ルーレット式抽選アプリ

PC・スマートフォン両対応のルーレット式抽選 Web アプリです。

## 機能

### 抽選画面（参加者向け）
- Canvas ベースのアニメーション付きルーレット
- START/STOP ボタンで直感的に操作
- 当選結果の演出（ファンファーレ、紙吹雪）
- Web Audio API による効果音

### 管理画面（管理者向け）
- 景品の追加・編集・削除
- 「〇人目で当選」トリガー設定
- 時間帯による景品解放設定
- 抽選履歴一覧・CSV エクスポート
- 全データリセット機能

### 複数端末対応
- 同一 URL で全端末がリアルタイム同期
- 在庫数・当選履歴が即座に共有

---

## 📱 アクセス

| 画面 | URL |
|------|-----|
| 抽選画面 | `https://roulette-app.up.railway.app/` |
| 管理画面 | `https://roulette-app.up.railway.app/admin` |

**管理画面パスワード：** `admin1234`

---

## 🚀 ローカル開発

### 必要環境
- Node.js 22+

### インストール・起動

```bash
# バックエンド
cd backend
npm install
node server.js

# フロントエンド（別ターミナル）
cd frontend
npm install
npm run dev
```

アクセス：
- 抽選画面: http://localhost:5173
- 管理画面: http://localhost:5173/admin

---

## 🛠️ 技術スタック

**フロントエンド**
- React 18
- Vite
- Tailwind CSS
- Zustand（状態管理）

**バックエンド**
- Node.js + Express
- SQLite（node:sqlite）
- REST API

**デプロイ**
- Railway

---

## 📝 ライセンス

MIT License

---

## ⚡ 拡張機能のアイデア

- [ ] 音声ガイド（読み上げ）
- [ ] 景品画像の表示
- [ ] SNS シェア機能
- [ ] 当選者の名前表示
- [ ] 不正防止（IP チェック）
- [ ] リーダーボード

---

**開発者：** Claude Code  
**更新日：** 2026-06-22
