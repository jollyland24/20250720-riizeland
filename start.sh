#!/bin/bash

echo "🚀 Starting RIIZE Interactive Experience"
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start backend server in background
echo "🔧 Starting backend server..."
npm start &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 3

# Start frontend server
echo "🌐 Starting frontend server..."
python3 -m http.server 8000 &
FRONTEND_PID=$!

echo ""
echo "✅ Servers started successfully!"
echo "================================"
echo "🔧 Backend:  http://localhost:3001"
echo "🌐 Frontend: http://localhost:8000"
echo ""
echo "📋 To test the setup:"
echo "   1. Open http://localhost:8000 in your browser"
echo "   2. Click the camera button (📷)"
echo "   3. Allow camera access"
echo "   4. Click the red photo button (📸)"
echo "   5. Wait for AI processing"
echo ""
echo "⚠️  Press Ctrl+C to stop both servers"

# Wait for any key press to stop
wait