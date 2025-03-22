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

// Constants for magnetic simulation
const STONE_RADIUS = 25; // Visual radius of the stone
const MAGNETIC_FIELD_RADIUS = STONE_RADIUS * 2.5; // Magnetic field extends 2.5x beyond stone's visible radius (optimal range from 1.5-3x)
const PHYSICAL_CONTACT_THRESHOLD = STONE_RADIUS * 2 * 0.9; // Stones cluster when they physically overlap by 10%
const ATTRACTION_FACTOR = 1.5; // How strongly stones are attracted to each other

// Check if stones form a cluster based on magnetic field physics
const checkClustering = (stones) => {
  if (stones.length < 2) return { hasClusters: false, clusters: [] };
  
  // Track which stones belong to which player
  const playerStones = {};
  stones.forEach((stone, index) => {
    const playerId = stone.playerId;
    if (!playerStones[playerId]) {
      playerStones[playerId] = [];
    }
    playerStones[playerId].push({ stone, index });
  });
  
  // Build a graph based on physical contact (not just magnetic field interaction)
  const graph = {};
  stones.forEach((stone, i) => {
    graph[i] = [];
    
    // Only check clustering between stones of the same player
    const playerId = stone.playerId;
    if (playerStones[playerId]) {
      playerStones[playerId].forEach(({ stone: otherStone, index: j }) => {
        if (i !== j) {
          const dx = stone.x - otherStone.x;
          const dy = stone.y - otherStone.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Stones cluster only when they physically touch or overlap
          if (distance < PHYSICAL_CONTACT_THRESHOLD) {
            graph[i].push(j);
          }
        }
      });
    }
  });
  
  // Find connected components (clusters) using DFS
  const visited = new Set();
  const clusters = [];
  
  const dfs = (node, cluster) => {
    visited.add(node);
    cluster.push(node);
    
    for (const neighbor of graph[node]) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, cluster);
      }
    }
  };
  
  for (let i = 0; i < stones.length; i++) {
    if (!visited.has(i)) {
      const cluster = [];
      dfs(i, cluster);
      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }
  }
  
  // Create a mapping of magnetic field data for visualization
  const magneticFields = stones.map(stone => ({
    x: stone.x,
    y: stone.y,
    radius: MAGNETIC_FIELD_RADIUS,
    playerId: stone.playerId,
    id: stone.id // Include ID for tracking
  }));
  
  return {
    hasClusters: clusters.length > 0,
    clusters: clusters.map(cluster => cluster.map(index => ({
      ...stones[index],
      clustered: true // Mark the stone as clustered for client-side handling
    }))),
    magneticFields
  };
};

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

// Generate a random room ID
const generateRoomId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

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
  socket.on('place_stone', ({ roomId, x, y }) => {
    try {
      const room = gameRooms.get(roomId);
      
      if (!room || room.gameState.gameOver) return;
      
      room.lastActivity = Date.now();
      
      // Determine which player is making the move
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex === -1 || playerIndex !== room.gameState.currentPlayer) return;
      
      // Create a new stone with standard properties
      const newStone = {
        x,
        y,
        playerId: playerIndex,
        player: room.gameState.players[playerIndex], // Add player object for backward compatibility
        id: Math.floor(Math.random() * 10000), // Add a unique numeric id
        radius: STONE_RADIUS,
        clustered: false
      };
      
      // Add the new stone to the game state
      room.gameState.stones.push(newStone);
      
      // Emit to all clients in the room
      io.to(roomId).emit('stone_placed', {
        x,
        y,
        playerId: playerIndex,
        id: newStone.id,
        radius: newStone.radius
      });
      
      // Check for clustering with existing stones
      const clusterResult = checkClustering(room.gameState.stones);
      
      if (clusterResult.hasClusters) {
        console.log('Clusters detected!', clusterResult.clusters);
        
        // Collect all stones from all clusters
        const clusteredStones = clusterResult.clusters.flat();
        
        // Notify clients to show clustering animation
        io.to(roomId).emit('stones_clustered', {
          clusteredStones,
          // Include information about the magnetic fields for visualization
          magneticFields: clusterResult.magneticFields
        });
        
        // Add stones to player inventory
        room.gameState.players[playerIndex].stonesLeft += clusteredStones.length;
        
        // Remove clustered stones from the board
        room.gameState.stones = room.gameState.stones.filter(stone => {
          return !clusteredStones.some(
            clusteredStone => 
              clusteredStone.x === stone.x && 
              clusteredStone.y === stone.y && 
              clusteredStone.playerId === stone.playerId
          );
        });
      } else {
        // If no clustering, move to the next player's turn
        room.gameState.currentPlayer = (room.gameState.currentPlayer + 1) % 2;
        
        // Decrement stones left for the current player
        const player = room.gameState.players[playerIndex];
        player.stonesLeft--;
        
        // Check for game over (player has no stones left)
        if (player.stonesLeft <= 0) {
          room.gameState.gameOver = true;
          room.gameState.winner = room.gameState.players[playerIndex]; // Return player object as winner
          io.to(roomId).emit('game_ended', { winner: room.gameState.players[playerIndex] });
        }
      }
      
      // Update game state after clustering
      io.to(roomId).emit('game_state_updated', { gameState: room.gameState });
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
  
  // Handle game over
  socket.on('game_over', ({ roomId, winner }) => {
    try {
      const room = gameRooms.get(roomId);
      if (room) {
        room.lastActivity = Date.now();
        room.gameState.gameOver = true;
        room.gameState.winner = winner;
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

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 