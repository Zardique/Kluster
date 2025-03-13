#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Kluster deployment process..."

# Install client dependencies
echo "📦 Installing client dependencies..."
npm install

# Build client
echo "🔨 Building client..."
npm run build

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install

# Build server
echo "🔨 Building server..."
npm run build
cd ..

# Create a production directory
echo "📁 Creating production directory..."
mkdir -p dist-prod

# Copy client build to production directory
echo "📋 Copying client build..."
cp -r dist/* dist-prod/

# Copy server build to production directory
echo "📋 Copying server build..."
mkdir -p dist-prod/server
cp -r server/dist/* dist-prod/server/
cp server/package.json dist-prod/server/

# Create a package.json for production
echo "📝 Creating production package.json..."
cat > dist-prod/package.json << EOL
{
  "name": "kluster-game",
  "version": "1.0.0",
  "description": "Kluster - A magnetic stone clustering game",
  "main": "server/index.js",
  "type": "module",
  "scripts": {
    "start": "cd server && node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "cors": "^2.8.5"
  }
}
EOL

# Create a README for production
echo "📝 Creating production README..."
cat > dist-prod/README.md << EOL
# Kluster Game

A multiplayer magnetic stone clustering game.

## How to run

1. Install dependencies: \`npm install\`
2. Start the server: \`npm start\`
3. Open your browser to \`http://localhost:3001\`

## Game Rules

- Stones have magnetic properties and will cluster when close enough.
- If stones cluster during your turn, you must collect them all.
- The first player to place all their stones without causing a cluster wins.
EOL

echo "✅ Deployment build complete! The production build is in the dist-prod directory."
echo "🎮 To run the game:"
echo "   1. cd dist-prod"
echo "   2. npm install"
echo "   3. npm start"
echo "   4. Open your browser to http://localhost:3001" 