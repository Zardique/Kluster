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

// Log environment information only in development
if (process.env.NODE_ENV !== 'production') {
  console.log('Node environment:', process.env.NODE_ENV);
  console.log('Current directory:', __dirname);
  try {
    const files = fs.readdirSync(path.join(__dirname, 'dist'));
    console.log('Files in dist directory:', files);
  } catch (error) {
    console.error('Error reading dist directory:', error);
  }
}

// Add middleware to log requests (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });
}

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// For any request that doesn't match a static file, serve index.html
app.get('*', (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Serving index.html for: ${req.url}`);
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Game rooms storage
const gameRooms = new Map();

// Room cleanup interval (check for inactive rooms every 30 minutes)
const ROOM_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const ROOM_INACTIVE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours

// Set up room cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of gameRooms.entries()) {
    // If the room has been inactive for too long, remove it
    if (room.lastActivity && now - room.lastActivity > ROOM_INACTIVE_THRESHOLD) {
      gameRooms.delete(roomId);
      console.log(`Removed inactive room: ${roomId}`);
    }
  }
}, ROOM_CLEANUP_INTERVAL);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Create a new game room
  socket.on('create_room', () => {
    try {
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
        },
        lastActivity: Date.now()
      });
      
      socket.join(roomId);
      socket.emit('room_created', { roomId, playerId: 0 });
      console.log(`Room created: ${roomId}`);
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('error', { message: 'Failed to create room' });
    }
  });
  
  // Join an existing game room
  socket.on('join_room', (roomId) => {
    try {
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
      room.lastActivity = Date.now();
      socket.join(roomId);
      
      // Notify both players that the game can start
      io.to(roomId).emit('game_start', { gameState: room.gameState });
      socket.emit('room_joined', { roomId, playerId: 1 });
      console.log(`Player joined room: ${roomId}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  
  // Handle stone placement
  socket.on('place_stone', ({ roomId, x, y, playerId }) => {
    try {
      const room = gameRooms.get(roomId);
      
      if (!room) return;
      
      // Only allow the current player to place a stone
      if (room.gameState.currentPlayer !== playerId) return;
      
      room.lastActivity = Date.now();
      
      // Broadcast the stone placement to all players in the room
      io.to(roomId).emit('stone_placed', { x, y, playerId });
    } catch (error) {
      console.error('Error placing stone:', error);
    }
  });
  
  // Handle game state update
  socket.on('update_game_state', ({ roomId, gameState }) => {
    try {
      const room = gameRooms.get(roomId);
      
      if (!room) return;
      
      room.gameState = gameState;
      room.lastActivity = Date.now();
      
      // Broadcast the updated game state to all players in the room
      io.to(roomId).emit('game_state_updated', { gameState });
    } catch (error) {
      console.error('Error updating game state:', error);
    }
  });
  
  // Handle clustering event
  socket.on('cluster_occurred', ({ roomId, clusteredStones }) => {
    try {
      const room = gameRooms.get(roomId);
      if (room) {
        room.lastActivity = Date.now();
        
        console.log(`Cluster occurred in room ${roomId}, ${clusteredStones.length} stones clustered`);
        
        // Broadcast to all clients EXCEPT the sender
        socket.to(roomId).emit('stones_clustered', { clusteredStones });
      }
    } catch (error) {
      console.error('Error handling cluster:', error);
    }
  });
  
  // Handle game over
  socket.on('game_over', ({ roomId, winner }) => {
    try {
      const room = gameRooms.get(roomId);
      if (room) {
        room.lastActivity = Date.now();
        io.to(roomId).emit('game_ended', { winner });
      }
    } catch (error) {
      console.error('Error handling game over:', error);
    }
  });
  
  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    try {
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
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
  
  // Handle rematch request
  socket.on('request_rematch', ({ roomId }) => {
    try {
      const room = gameRooms.get(roomId);
      
      if (!room) return;
      
      room.lastActivity = Date.now();
      
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
    } catch (error) {
      console.error('Error handling rematch request:', error);
    }
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