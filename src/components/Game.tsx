import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import GameBoard from './GameBoard';
import PlayerInfo from './PlayerInfo';
import Lobby from './Lobby';
import { Stone, Player } from '../types';
import { useMultiplayer } from '../context/MultiplayerContext';
import './ModernUI.css';

// Game constants
const PLAY_AREA_RADIUS = 250;
const STONE_RADIUS = 25;
const STONE_HEIGHT = 8;
const INITIAL_STONES_PER_PLAYER = 12;
const PLAYER_COLORS = ['#6e8efb', '#f6d365'];

// Create and preload sound effects - moved outside component to avoid recreation
const createAudio = (path: string) => {
  try {
    const audio = new Audio(path);
    audio.load();
    audio.volume = 0.2;
    return audio;
  } catch (e) {
    console.error(`Failed to load audio: ${path}`, e);
    return {
      play: () => Promise.resolve(),
      pause: () => {},
      currentTime: 0,
      volume: 0.2,
      load: () => {}
    } as HTMLAudioElement;
  }
};

// Game sounds - created once
const GAME_SOUNDS = {
  placeStone: createAudio('/sounds/place-stone.mp3'),
  gameOver: createAudio('/sounds/game-over.mp3')
};

// Check if we're in development mode (Vite sets this)
const isDevelopment = import.meta.env.DEV;

const Game: React.FC = () => {
  // Game state - grouped related state
  const [stones, setStones] = useState<Stone[]>([]);
  const [players, setPlayers] = useState<Player[]>([
    { id: 0, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 1' },
    { id: 1, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 2' }
  ]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [showLobby, setShowLobby] = useState(true);
  
  // Optimization: Use refs for values that don't trigger renders
  const lastPlacedStoneIdRef = useRef<string | null>(null);
  const processingClusterRef = useRef<boolean>(false);
  const soundsLoaded = useRef<boolean>(false);
  
  // Get multiplayer context
  const {
    socket,
    playerId,
    isInRoom,
    isGameStarted,
    opponentConnected,
    placeStone: emitPlaceStone,
    updateGameState,
    notifyCluster,
    notifyGameOver,
    requestRematch
  } = useMultiplayer();
  
  // Preload sounds on component mount
  useEffect(() => {
    const loadSounds = async () => {
      try {
        // Force a load attempt on all sounds
        await Promise.all(Object.values(GAME_SOUNDS).map(sound => {
          if (typeof sound.load === 'function') {
            sound.load();
          }
          return Promise.resolve();
        }));
        soundsLoaded.current = true;
      } catch (e) {
        console.error("Failed to load game sounds:", e);
      }
    };
    
    loadSounds();
  }, []);
  
  // Safely play a sound with error handling
  const playSound = useCallback((sound: HTMLAudioElement) => {
    try {
      sound.currentTime = 0;
      const playPromise = sound.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.log("Error playing sound:", e);
        });
      }
    } catch (e) {
      console.error("Failed to play sound:", e);
    }
  }, []);
  
  // Check if any player has won (has 0 stones left)
  const checkGameOver = useCallback((updatedPlayers: Player[]) => {
    for (let i = 0; i < updatedPlayers.length; i++) {
      if (updatedPlayers[i].stonesLeft === 0) {
        setGameOver(true);
        setWinner(i);
        
        // Play game over sound
        if (soundsLoaded.current) {
          playSound(GAME_SOUNDS.gameOver);
        }
        
        // Notify other players about the game over
        if (playerId !== null && isInRoom) {
          notifyGameOver(i);
        }
        
        return true;
      }
    }
    return false;
  }, [playerId, isInRoom, notifyGameOver, playSound]);
  
  // Listen for stone placement events from the server
  useEffect(() => {
    if (!socket) return;
    
    const onStonePlaced = (data: { x: number, y: number, playerId: number }) => {
      // Only handle stone placement if it's from the other player
      if (data.playerId !== playerId) {
        handleStonePlace(data.x, data.y, true);
        
        // Play stone placement sound when the opponent places a stone
        if (soundsLoaded.current) {
          playSound(GAME_SOUNDS.placeStone);
        }
      }
    };
    
    const onStonesClustered = (data: { clusteredStones: Stone[] }) => {
      // Only process if we're not already processing a cluster
      // and if the event wasn't triggered by us
      if (!processingClusterRef.current) {
        handleCluster(data.clusteredStones, true);
      }
    };
    
    const onGameStateUpdated = (data: { gameState: any }) => {
      // Batch state updates to avoid multiple renders
      const { stones, players, currentPlayer, gameOver, winner } = data.gameState;
      
      // Use functional updates to ensure we're working with latest state
      setStones(stones);
      setPlayers(players);
      setCurrentPlayer(currentPlayer);
      setGameOver(gameOver);
      setWinner(winner);
    };
    
    const onGameEnded = (data: { winner: number }) => {
      // Handle game over
      setGameOver(true);
      setWinner(data.winner);
      
      // Play game over sound
      if (soundsLoaded.current) {
        playSound(GAME_SOUNDS.gameOver);
      }
    };
    
    const onRematchAccepted = () => {
      // Reset the game state
      resetGame();
    };
    
    // Set up event listeners
    socket.on('stone_placed', onStonePlaced);
    socket.on('stones_clustered', onStonesClustered);
    socket.on('game_state_updated', onGameStateUpdated);
    socket.on('game_ended', onGameEnded);
    socket.on('rematch_accepted', onRematchAccepted);
    
    // Clean up event listeners on unmount
    return () => {
      socket.off('stone_placed', onStonePlaced);
      socket.off('stones_clustered', onStonesClustered);
      socket.off('game_state_updated', onGameStateUpdated);
      socket.off('game_ended', onGameEnded);
      socket.off('rematch_accepted', onRematchAccepted);
    };
  }, [socket, playerId, playSound]);
  
  // Handle stone placement - optimized version
  const handleStonePlace = useCallback((x: number, y: number, fromServer = false) => {
    // If it's not our turn and not from the server, don't allow placement
    if (!fromServer && playerId !== null && currentPlayer !== playerId) {
      return;
    }
    
    // Create a new stone
    const newStone: Stone = {
      id: `stone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      x,
      y,
      radius: STONE_RADIUS,
      height: STONE_HEIGHT,
      player: players[currentPlayer],
      clustered: false,
      onEdge: Math.random() > 0.5 // 50% chance of being on edge
    };
    
    // Use function updates to ensure atomic state updates
    setStones(prevStones => [...prevStones, newStone]);
    lastPlacedStoneIdRef.current = newStone.id;
    
    // Play stone placement sound for local placements
    if (!fromServer && soundsLoaded.current) {
      playSound(GAME_SOUNDS.placeStone);
    }
    
    // Update the current player's stones left and check for win
    let gameEnded = false;
    let winningPlayer: number | null = null;
    
    // Use function update to ensure we work with the latest state
    setPlayers(prevPlayers => {
      const updatedPlayers = prevPlayers.map((player, idx) => {
        if (idx === currentPlayer) {
          const newStonesLeft = player.stonesLeft - 1;
          // Check if current player has placed all stones
          if (newStonesLeft === 0) {
            gameEnded = true;
            winningPlayer = currentPlayer;
          }
          return {
            ...player,
            stonesLeft: newStonesLeft
          };
        }
        return player;
      });
      
      // Schedule game over check after state update
      if (gameEnded && winningPlayer !== null) {
        // Use setTimeout to move this update to next tick to avoid state batching conflicts
        setTimeout(() => {
          setGameOver(true);
          setWinner(winningPlayer);
          
          // Play game over sound
          if (soundsLoaded.current) {
            playSound(GAME_SOUNDS.gameOver);
          }
          
          // Notify other players about the game over
          if (playerId !== null && isInRoom) {
            notifyGameOver(winningPlayer);
          }
        }, 0);
      } else {
        // Switch to the next player
        setTimeout(() => {
          setCurrentPlayer(prevPlayer => (prevPlayer + 1) % players.length);
        }, 0);
      }
      
      return updatedPlayers;
    });
    
    // If this is our move, emit it to the server
    if (!fromServer && playerId !== null && isInRoom) {
      emitPlaceStone(x, y);
      
      // Update the game state on the server - calculate new state to avoid stale values
      setStones(prevStones => {
        const newStones = [...prevStones, newStone];
        
        setPlayers(prevPlayers => {
          const updatedPlayers = prevPlayers.map((player, idx) => {
            if (idx === currentPlayer) {
              return {
                ...player,
                stonesLeft: player.stonesLeft - 1
              };
            }
            return player;
          });
          
          // Calculate next player or game over state
          const nextPlayer = gameEnded ? currentPlayer : (currentPlayer + 1) % players.length;
          
          // Update game state on server
          updateGameState({
            stones: newStones,
            currentPlayer: nextPlayer,
            players: updatedPlayers,
            gameOver: gameEnded,
            winner: gameEnded ? winningPlayer : null
          });
          
          return updatedPlayers;
        });
        
        return newStones;
      });
    }
  }, [currentPlayer, players, playerId, isInRoom, emitPlaceStone, updateGameState, notifyGameOver, playSound]);
  
  // Handle clustered stones - optimized for performance
  const handleCluster = useCallback((clusteredStones: Stone[], fromServer = false) => {
    if (clusteredStones.length === 0) return;
    
    // Set processing flag to prevent duplicate processing
    processingClusterRef.current = true;
    
    // Find the player who placed the last stone
    const lastPlayerIndex = currentPlayer === 0 ? 1 : 0; // Previous player
    
    // Count clustered stones
    const clusteredStonesCount = clusteredStones.length;
    
    // Remove clustered stones from the board with stoneIds - use Set for faster lookups
    const stoneIdsToRemove = new Set(clusteredStones.map(s => s.id));
    
    // Batch state updates to avoid multiple renders
    setStones(prevStones => {
      const filteredStones = prevStones.filter(stone => !stoneIdsToRemove.has(stone.id));
      
      setPlayers(prevPlayers => {
        // Update the player who placed the last stone - they get all clustered stones
        const updatedPlayers = prevPlayers.map((player, idx) => {
          if (idx === lastPlayerIndex) {
            return {
              ...player,
              stonesLeft: player.stonesLeft + clusteredStonesCount
            };
          }
          return player;
        });
        
        // Notify other players about the clustering only if this is a local event
        if (playerId !== null && isInRoom && !fromServer) {
          notifyCluster(clusteredStones);
          
          // Update the game state on the server
          updateGameState({
            stones: filteredStones,
            currentPlayer: currentPlayer,
            players: updatedPlayers,
            gameOver: gameOver,
            winner: winner
          });
        }
        
        return updatedPlayers;
      });
      
      return filteredStones;
    });
    
    // Reset processing flag after a short delay
    setTimeout(() => {
      processingClusterRef.current = false;
      
      // After processing the cluster, check if any player now has 0 stones left
      setPlayers(prevPlayers => {
        const hasWinner = checkGameOver(prevPlayers);
        return prevPlayers;
      });
    }, 600); // Match the animation duration for better synchronization
  }, [currentPlayer, playerId, isInRoom, notifyCluster, updateGameState, gameOver, winner, checkGameOver]);
  
  // Reset game state
  const resetGame = useCallback(() => {
    // Batch all state updates together for better performance
    setStones([]);
    setPlayers([
      { id: 0, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 1' },
      { id: 1, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 2' }
    ]);
    setCurrentPlayer(0);
    setGameOver(false);
    setWinner(null);
    lastPlacedStoneIdRef.current = null;
    processingClusterRef.current = false;
    
    // Request a rematch if in multiplayer mode
    if (playerId !== null && isInRoom) {
      requestRematch();
    }
  }, [playerId, isInRoom, requestRematch]);
  
  // Handle starting the game from the lobby
  const handleStartGame = useCallback(() => {
    setShowLobby(false);
  }, []);

  // Clean up sounds on component unmount
  useEffect(() => {
    return () => {
      try {
        Object.values(GAME_SOUNDS).forEach(sound => {
          if (typeof sound.pause === 'function') {
            sound.pause();
            sound.currentTime = 0;
          }
        });
      } catch (e) {
        console.error("Failed to clean up sounds:", e);
      }
    };
  }, []);
  
  // Memoize values to avoid unnecessary re-renders
  const isMyTurn = useMemo(() => 
    playerId === null || playerId === currentPlayer, 
    [playerId, currentPlayer]
  );
  
  return (
    <div className="modern-container">
      {/* Animated background elements */}
      <div className="bg-element bg-element-1"></div>
      <div className="bg-element bg-element-2"></div>
      <div className="bg-element bg-element-3"></div>
      
      {/* Show lobby if not in a game yet */}
      {showLobby && !isGameStarted && (
        <Lobby onStartGame={handleStartGame} />
      )}
      
      {/* Only show game content when not in lobby or game has started */}
      {(!showLobby || isGameStarted) && (
        <div className="game-content">
          {/* Game board on the left */}
          <div className="board-wrapper">
            <div 
              className="board-glow" 
              style={{ 
                background: currentPlayer === 0 
                  ? 'rgba(110, 142, 251, 0.3)' 
                  : 'rgba(246, 211, 101, 0.3)' 
              }}
            ></div>
            <GameBoard
              stones={stones}
              currentPlayer={players[currentPlayer]}
              onStonePlaced={handleStonePlace}
              onClustered={handleCluster}
              placementMode="flat"
              isMyTurn={isMyTurn}
            />
          </div>
          
          {/* Controls and info on the right */}
          <PlayerInfo
            players={players}
            currentPlayer={currentPlayer}
            gameOver={false} // Always false since we're using the popup now
            winner={null}
            onReset={resetGame}
            myPlayerId={playerId}
          />
        </div>
      )}
      
      {/* Game over popup overlay */}
      {gameOver && (
        <div className="game-over-overlay">
          <div className="game-over-popup">
            <h2 className="game-over-title">Game Over!</h2>
            {winner !== null && (
              <p className="winner-text">
                {winner === playerId ? 'You win!' : 'Opponent wins!'}
              </p>
            )}
            <button 
              className="reset-button"
              onClick={resetGame}
            >
              {isInRoom ? 'Request Rematch' : 'Play Again'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(Game); 