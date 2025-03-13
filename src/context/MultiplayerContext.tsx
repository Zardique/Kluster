import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Stone, Player } from '../types';

// Define the server URL based on environment
const SERVER_URL = import.meta.env.PROD 
  ? window.location.origin
  : 'http://localhost:3001';

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
  clearError: () => void;
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
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [reconnectTimer, setReconnectTimer] = useState<NodeJS.Timeout | null>(null);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initialize socket connection
  useEffect(() => {
    let newSocket: Socket | null = null;
    
    try {
      // Create socket connection
      newSocket = io(SERVER_URL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000
      });
      
      // Connection events
      newSocket.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        setError(null);
        setConnectionAttempts(0);
        
        // Clear any reconnect timers
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          setReconnectTimer(null);
        }
      });
      
      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setIsConnected(false);
        setError(`Connection error: ${err.message}`);
        
        // Increment connection attempts
        setConnectionAttempts(prev => prev + 1);
        
        // If we've tried too many times, stop trying
        if (connectionAttempts >= 5) {
          setError('Failed to connect to server after multiple attempts. Please try again later.');
          newSocket?.close();
        }
      });
      
      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
        setIsInRoom(false);
        setIsGameStarted(false);
        setOpponentConnected(false);
        
        if (reason === 'io server disconnect') {
          // The server has forcefully disconnected the socket
          setError('Disconnected by server. Please refresh the page.');
        } else {
          // Set a reconnect timer
          const timer = setTimeout(() => {
            newSocket?.connect();
          }, 3000);
          setReconnectTimer(timer);
        }
      });
      
      newSocket.on('error', (data: { message: string }) => {
        console.error('Socket error:', data.message);
        setError(data.message);
      });
      
      setSocket(newSocket);
    } catch (err) {
      console.error('Error initializing socket:', err);
      setError('Failed to initialize connection. Please refresh the page.');
    }
    
    // Cleanup on unmount
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      
      if (newSocket) {
        newSocket.off('connect');
        newSocket.off('connect_error');
        newSocket.off('disconnect');
        newSocket.off('error');
        newSocket.disconnect();
      }
    };
  }, [connectionAttempts, reconnectTimer]);
  
  // Set up event listeners when socket changes
  useEffect(() => {
    if (!socket) return;
    
    // Room creation response
    const handleRoomCreated = (data: { roomId: string, playerId: number }) => {
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setIsInRoom(true);
      setIsHost(true);
    };
    
    // Room joining response
    const handleRoomJoined = (data: { roomId: string, playerId: number }) => {
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setIsInRoom(true);
      setOpponentConnected(true);
    };
    
    // Game start notification
    const handleGameStart = () => {
      setIsGameStarted(true);
      setOpponentConnected(true);
    };
    
    // Player disconnection
    const handlePlayerDisconnected = () => {
      setOpponentConnected(false);
      setError('Opponent disconnected');
    };
    
    // Rematch accepted
    const handleRematchAccepted = () => {
      setIsGameStarted(true);
      setError(null);
    };
    
    // Register event handlers
    socket.on('room_created', handleRoomCreated);
    socket.on('room_joined', handleRoomJoined);
    socket.on('game_start', handleGameStart);
    socket.on('player_disconnected', handlePlayerDisconnected);
    socket.on('rematch_accepted', handleRematchAccepted);
    
    // Cleanup event handlers
    return () => {
      socket.off('room_created', handleRoomCreated);
      socket.off('room_joined', handleRoomJoined);
      socket.off('game_start', handleGameStart);
      socket.off('player_disconnected', handlePlayerDisconnected);
      socket.off('rematch_accepted', handleRematchAccepted);
    };
  }, [socket]);
  
  // Create a new room
  const createRoom = useCallback(() => {
    if (!socket || !isConnected) {
      setError('Not connected to server');
      return;
    }
    
    try {
      socket.emit('create_room');
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Failed to create room');
    }
  }, [socket, isConnected]);
  
  // Join an existing room
  const joinRoom = useCallback((roomIdToJoin: string) => {
    if (!socket || !isConnected) {
      setError('Not connected to server');
      return;
    }
    
    if (!roomIdToJoin || roomIdToJoin.trim() === '') {
      setError('Room ID cannot be empty');
      return;
    }
    
    try {
      socket.emit('join_room', roomIdToJoin);
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join room');
    }
  }, [socket, isConnected]);
  
  // Leave the current room
  const leaveRoom = useCallback(() => {
    if (!socket || !isConnected || !roomId) {
      setError('Not in a room');
      return;
    }
    
    try {
      // Reset local state
      setRoomId(null);
      setPlayerId(null);
      setIsInRoom(false);
      setIsHost(false);
      setIsGameStarted(false);
      setOpponentConnected(false);
      setError(null);
    } catch (err) {
      console.error('Error leaving room:', err);
      setError('Failed to leave room');
    }
  }, [socket, isConnected, roomId]);
  
  // Place a stone on the board
  const placeStone = useCallback((x: number, y: number) => {
    if (!socket || !isConnected || !roomId || playerId === null) {
      setError('Not in a game');
      return;
    }
    
    try {
      socket.emit('place_stone', { roomId, x, y, playerId });
    } catch (err) {
      console.error('Error placing stone:', err);
      setError('Failed to place stone');
    }
  }, [socket, isConnected, roomId, playerId]);
  
  // Update the game state
  const updateGameState = useCallback((gameState: any) => {
    if (!socket || !isConnected || !roomId) {
      setError('Not in a game');
      return;
    }
    
    try {
      socket.emit('update_game_state', { roomId, gameState });
    } catch (err) {
      console.error('Error updating game state:', err);
      setError('Failed to update game state');
    }
  }, [socket, isConnected, roomId]);
  
  // Notify about clustered stones
  const notifyCluster = useCallback((clusteredStones: Stone[]) => {
    if (!socket || !isConnected || !roomId) {
      setError('Not in a game');
      return;
    }
    
    try {
      socket.emit('cluster_occurred', { roomId, clusteredStones });
    } catch (err) {
      console.error('Error notifying cluster:', err);
      setError('Failed to notify cluster');
    }
  }, [socket, isConnected, roomId]);
  
  // Notify about game over
  const notifyGameOver = useCallback((winner: number) => {
    if (!socket || !isConnected || !roomId) {
      setError('Not in a game');
      return;
    }
    
    try {
      socket.emit('game_over', { roomId, winner });
    } catch (err) {
      console.error('Error notifying game over:', err);
      setError('Failed to notify game over');
    }
  }, [socket, isConnected, roomId]);
  
  // Request a rematch
  const requestRematch = useCallback(() => {
    if (!socket || !isConnected || !roomId) {
      setError('Not in a game');
      return;
    }
    
    try {
      socket.emit('request_rematch', { roomId });
    } catch (err) {
      console.error('Error requesting rematch:', err);
      setError('Failed to request rematch');
    }
  }, [socket, isConnected, roomId]);
  
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
    error,
    clearError
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