#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== バックエンド起動 ==="
cd "$ROOT/backend"
npm install
node server.js &
BACKEND_PID=$!
echo "バックエンドPID: $BACKEND_PID"

echo "=== フロントエンド起動 ==="
cd "$ROOT/frontend"
npm install
npm run dev &
FRONTEND_PID=$!

echo ""
echo "起動完了！"
echo "  抽選画面: http://localhost:5173"
echo "  管理画面: http://localhost:5173/admin  (パスワード: admin1234)"
echo ""
echo "終了するには Ctrl+C を押してください"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '停止しました'" EXIT
wait
