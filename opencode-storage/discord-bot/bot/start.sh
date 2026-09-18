#!/bin/bash

cd "$(dirname "$0")"

echo ""
echo "   ╔══════════════════════════════════════╗"
echo "   ║       🚀 KS Bot Starting...         ║"
echo "   ║   Owner: KS Warrior (@ks_warrior_pro)║"
echo "   ║   Server: KS Hub                     ║"
echo "   ╚══════════════════════════════════════╝"
echo ""

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Install it from: https://nodejs.org"
    exit 1
fi

echo "🔹 Node.js: $(node -v)"

if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Create .env with:"
    echo "  TOKEN=your_bot_token"
    echo "  CLIENT_ID=your_bot_client_id"
    echo "  GUILD_ID=your_server_id"
    echo "  OWNER_ID=your_user_id"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "🚀 Launching KS Bot..."
echo ""

while true; do
    node index.js
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        echo ""
        echo "Bot stopped gracefully."
        break
    fi
    echo ""
    echo "❌ Bot crashed (exit code: $EXIT_CODE)"
    echo "🔄 Restarting in 5 seconds... (Ctrl+C to stop)"
    sleep 5
done