import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { Stone, Player } from '../types';

// Define the server URL based on environment
const SERVER_URL = import.meta.env.DEV 
  ? 'http://localhost:3001' 
  : window.location.origin;

// Define the context types
interface MultiplayerContextType {
  socket: Socket | null;
  roomId: string | null;
  playerId: number | null;
  isConnected: boolean;
  isHost: boolean;
  isInRoom: boolean;
  isGameStarted: boolean;
  opponentConnected: boolean;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  placeStone: (x: number, y: number) => void;
  updateGameState: (gameState: any) => void;
  notifyCluster: (clusteredStones: Stone[]) => void;
  notifyGameOver: (winner: number) => void;
  requestRematch: () => void;
  error: string | null;
}

// Create the context
const MultiplayerContext = createContext<MultiplayerContextType | null>(null);

// Create a provider component
export const MultiplayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isInRoom, setIsInRoom] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SERVER_URL);
    
    newSocket.on('connect', () => {
      setIsConnected(true);
      setError(null);
    });
    
    newSocket.on('disconnect', () => {
      setIsConnected(false);
      setIsInRoom(false);
      setIsGameStarted(false);
      setOpponentConnected(false);
    });
    
    newSocket.on('error', (data: { message: string }) => {
      setError(data.message);
    });
    
    setSocket(newSocket);
    
    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);
  
  // Set up event listeners when socket changes
  useEffect(() => {
    if (!socket) return;
    
    // Room creation response
    socket.on('room_created', (data: { roomId: string, playerId: number }) => {
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setIsInRoom(true);
      setIsHost(true);
    });
    
    // Room joining response
    socket.on('room_joined', (data: { roomId: string, playerId: number }) => {
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setIsInRoom(true);
      setOpponentConnected(true);
    });
    
    // Game start notification
    socket.on('game_start', () => {
      setIsGameStarted(true);
      setOpponentConnected(true);
    });
    
    // Player disconnection
    socket.on('player_disconnected', () => {
      setOpponentConnected(false);
      setError('Opponent disconnected');
    });
    
    // Rematch accepted
    socket.on('rematch_accepted', () => {
      setIsGameStarted(true);
      setError(null);
    });
    
    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('game_start');
      socket.off('player_disconnected');
      socket.off('rematch_accepted');
    };
  }, [socket]);
  
  // Create a new room
  const createRoom = () => {
    if (!socket || !isConnected) return;
    socket.emit('create_room');
  };
  
  // Join an existing room
  const joinRoom = (roomIdToJoin: string) => {
    if (!socket || !isConnected) return;
    socket.emit('join_room', roomIdToJoin);
  };
  
  // Leave the current room
  const leaveRoom = () => {
    if (!socket || !isConnected || !roomId) return;
    
    // No need to emit anything, just disconnect from the room
    setRoomId(null);
    setPlayerId(null);
    setIsInRoom(false);
    setIsHost(false);
    setIsGameStarted(false);
    setOpponentConnected(false);
  };
  
  // Place a stone on the board
  const placeStone = (x: number, y: number) => {
    if (!socket || !isConnected || !roomId || playerId === null) return;
    
    socket.emit('place_stone', { roomId, x, y, playerId });
  };
  
  // Update the game state
  const updateGameState = (gameState: any) => {
    if (!socket || !isConnected || !roomId) return;
    
    socket.emit('update_game_state', { roomId, gameState });
  };
  
  // Notify about clustered stones
  const notifyCluster = (clusteredStones: Stone[]) => {
    if (!socket || !isConnected || !roomId) return;
    
    socket.emit('cluster_occurred', { roomId, clusteredStones });
  };
  
  // Notify about game over
  const notifyGameOver = (winner: number) => {
    if (!socket || !isConnected || !roomId) return;
    
    socket.emit('game_over', { roomId, winner });
  };
  
  // Request a rematch
  const requestRematch = () => {
    if (!socket || !isConnected || !roomId) return;
    
    socket.emit('request_rematch', { roomId });
  };
  
  // Context value
  const value: MultiplayerContextType = {
    socket,
    roomId,
    playerId,
    isConnected,
    isHost,
    isInRoom,
    isGameStarted,
    opponentConnected,
    createRoom,
    joinRoom,
    leaveRoom,
    placeStone,
    updateGameState,
    notifyCluster,
    notifyGameOver,
    requestRematch,
    error
  };
  
  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  );
};

// Custom hook for using the multiplayer context
export const useMultiplayer = () => {
  const context = useContext(MultiplayerContext);
  
  if (!context) {
    throw new Error('useMultiplayer must be used within a MultiplayerProvider');
  }
  
  return context;
};

export default MultiplayerContext; 