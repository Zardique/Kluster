import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// For ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Log environment information
console.log('Node environment:', process.env.NODE_ENV);
console.log('Current directory:', __dirname);
console.log('Files in dist directory:');
try {
  const files = fs.readdirSync(path.join(__dirname, 'dist'));
  console.log(files);
} catch (error) {
  console.error('Error reading dist directory:', error);
}

// Add middleware to log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// For any request that doesn't match a static file, serve index.html
app.get('*', (req, res) => {
  console.log(`Serving index.html for: ${req.url}`);
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Game rooms storage
const gameRooms = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Create a new game room
  socket.on('create_room', () => {
    const roomId = generateRoomId();
    
    gameRooms.set(roomId, {
      id: roomId,
      players: [socket.id],
      gameState: {
        stones: [],
        currentPlayer: 0,
        players: [
          { id: 0, stonesLeft: 12, name: 'Player 1' },
          { id: 1, stonesLeft: 12, name: 'Player 2' }
        ],
        gameOver: false,
        winner: null
      }
    });
    
    socket.join(roomId);
    socket.emit('room_created', { roomId, playerId: 0 });
    console.log(`Room created: ${roomId}`);
  });
  
  // Join an existing game room
  socket.on('join_room', (roomId) => {
    const room = gameRooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    room.players.push(socket.id);
    socket.join(roomId);
    
    // Notify both players that the game can start
    io.to(roomId).emit('game_start', { gameState: room.gameState });
    socket.emit('room_joined', { roomId, playerId: 1 });
    console.log(`Player joined room: ${roomId}`);
  });
  
  // Handle stone placement
  socket.on('place_stone', ({ roomId, x, y, playerId }) => {
    const room = gameRooms.get(roomId);
    
    if (!room) return;
    
    // Only allow the current player to place a stone
    if (room.gameState.currentPlayer !== playerId) return;
    
    // Broadcast the stone placement to all players in the room
    io.to(roomId).emit('stone_placed', { x, y, playerId });
  });
  
  // Handle game state update
  socket.on('update_game_state', ({ roomId, gameState }) => {
    const room = gameRooms.get(roomId);
    
    if (!room) return;
    
    room.gameState = gameState;
    
    // Broadcast the updated game state to all players in the room
    io.to(roomId).emit('game_state_updated', { gameState });
  });
  
  // Handle clustering event
  socket.on('cluster_occurred', ({ roomId, clusteredStones }) => {
    io.to(roomId).emit('stones_clustered', { clusteredStones });
  });
  
  // Handle game over
  socket.on('game_over', ({ roomId, winner }) => {
    io.to(roomId).emit('game_ended', { winner });
  });
  
  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find and clean up any rooms the player was in
    for (const [roomId, room] of gameRooms.entries()) {
      if (room.players.includes(socket.id)) {
        // Notify the other player that their opponent left
        socket.to(roomId).emit('player_disconnected');
        
        // Remove the room
        gameRooms.delete(roomId);
        console.log(`Room deleted: ${roomId}`);
        break;
      }
    }
  });
  
  // Handle rematch request
  socket.on('request_rematch', ({ roomId }) => {
    const room = gameRooms.get(roomId);
    
    if (!room) return;
    
    // Reset the game state
    room.gameState = {
      stones: [],
      currentPlayer: 0,
      players: [
        { id: 0, stonesLeft: 12, name: 'Player 1' },
        { id: 1, stonesLeft: 12, name: 'Player 2' }
      ],
      gameOver: false,
      winner: null
    };
    
    // Notify both players about the rematch
    io.to(roomId).emit('rematch_accepted', { gameState: room.gameState });
  });
});

// Generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 