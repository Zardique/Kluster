import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import GameBoard3D from './GameBoard3D';
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
        const clusterIds = data.clusteredStones.map(stone => stone.id);
        handleCluster(clusterIds, true);
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
  
  // Handle stone placement for 3D board
  const handleStonePlace = useCallback((x: number, y: number, fromServer = false) => {
    // If it's not our turn and not from the server, don't allow placement
    if (!fromServer && playerId !== null && currentPlayer !== playerId) {
      return;
    }
    
    // Create a new stone with unique ID
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
    
    // Add stone to the board and update state
    setStones(prevStones => [...prevStones, newStone]);
    lastPlacedStoneIdRef.current = newStone.id;
    
    // Play stone placement sound for local placements
    if (!fromServer && soundsLoaded.current) {
      playSound(GAME_SOUNDS.placeStone);
    }
    
    // Update player stones and check for win
    setPlayers(prevPlayers => {
      const newPlayers = prevPlayers.map((player, idx) => {
        if (idx === currentPlayer) {
          return {
            ...player,
            stonesLeft: Math.max(0, player.stonesLeft - 1) // Ensure we don't go negative
          };
        }
        return player;
      });
      
      // Check if the current player has placed all their stones
      const isGameOver = newPlayers[currentPlayer].stonesLeft === 0;
      
      // If game is over, handle it
      if (isGameOver) {
        setTimeout(() => {
          setGameOver(true);
          setWinner(currentPlayer);
          
          if (soundsLoaded.current) {
            playSound(GAME_SOUNDS.gameOver);
          }
          
          if (playerId !== null && isInRoom) {
            notifyGameOver(currentPlayer);
          }
        }, 300); // Small delay to ensure UI updates properly
      } else {
        // Switch to the next player with a small delay to ensure state updates
        setTimeout(() => {
          setCurrentPlayer(current => (current + 1) % players.length);
        }, 100);
      }
      
      return newPlayers;
    });
    
    // If this is our move, emit it to the server
    if (!fromServer && playerId !== null && isInRoom) {
      // Emit the stone placement event
      emitPlaceStone(x, y);
      
      // Update the game state on the server (after our local state has updated)
      setTimeout(() => {
        // Get the latest state
        const serverGameState = {
          stones: [...stones, newStone],
          currentPlayer: (currentPlayer + 1) % players.length,
          players: players.map((player, idx) => {
            if (idx === currentPlayer) {
              return {
                ...player,
                stonesLeft: player.stonesLeft - 1
              };
            }
            return player;
          }),
          gameOver: players[currentPlayer].stonesLeft === 1, // Will be 0 after this move
          winner: players[currentPlayer].stonesLeft === 1 ? currentPlayer : null
        };
        
        updateGameState(serverGameState);
      }, 50);
    }
  }, [currentPlayer, players, stones, playerId, isInRoom, emitPlaceStone, 
      updateGameState, notifyGameOver, playSound, soundsLoaded]);
  
  // Handle clustered stones for 3D board
  const handleCluster = useCallback((clusteredStoneIds: string[], fromServer = false) => {
    if (clusteredStoneIds.length === 0) return;
    
    // Set processing flag to prevent duplicate processing
    processingClusterRef.current = true;
    
    // Find the clustered stones objects from IDs
    const clusteredStones = stones.filter(stone => 
      clusteredStoneIds.includes(stone.id)
    );
    
    // Find the player who placed the last stone (previous player)
    const lastPlayerIndex = currentPlayer === 0 ? 1 : 0;
    
    // Create a set of IDs for faster lookups
    const clusteredStoneIdsSet = new Set(clusteredStoneIds);
    
    // Update the stones list - remove clustered stones
    setStones(prevStones => {
      const updatedStones = prevStones.filter(stone => !clusteredStoneIdsSet.has(stone.id));
      
      // Update player stones - give clustered stones to the last player
      setPlayers(prevPlayers => {
        const updatedPlayers = [...prevPlayers];
        
        // Add the clustered stones count to the player who placed the last stone
        updatedPlayers[lastPlayerIndex] = {
          ...updatedPlayers[lastPlayerIndex],
          stonesLeft: updatedPlayers[lastPlayerIndex].stonesLeft + clusteredStones.length
        };
        
        // Notify other players about the clustering if this is a local event
        if (playerId !== null && isInRoom && !fromServer) {
          notifyCluster(clusteredStones);
          
          // Update the game state on the server
          updateGameState({
            stones: updatedStones,
            players: updatedPlayers,
            currentPlayer,
            gameOver,
            winner
          });
        }
        
        // After updating players, check if anyone has 0 stones left
        setTimeout(() => {
          const playerWithNoStones = updatedPlayers.findIndex(p => p.stonesLeft === 0);
          if (playerWithNoStones !== -1) {
            setGameOver(true);
            setWinner(playerWithNoStones);
            
            if (soundsLoaded.current) {
              playSound(GAME_SOUNDS.gameOver);
            }
            
            if (playerId !== null && isInRoom) {
              notifyGameOver(playerWithNoStones);
            }
          }
        }, 100);
        
        return updatedPlayers;
      });
      
      return updatedStones;
    });
    
    // Reset processing flag after the animation duration
    setTimeout(() => {
      processingClusterRef.current = false;
    }, 700); // Slightly longer than animation duration for safety
  }, [currentPlayer, playerId, isInRoom, notifyCluster, updateGameState, 
      gameOver, winner, playSound, soundsLoaded, stones]);
  
  // Update stone positions based on 3D board physics
  const updateStonePositions = useCallback((updates: { id: string; x: number; y: number }[]) => {
    setStones(prevStones => {
      // Create a map for faster lookups
      const updatesMap = new Map(
        updates.map(update => [update.id, { x: update.x, y: update.y }])
      );
      
      // Update stones with new positions
      return prevStones.map(stone => {
        const update = updatesMap.get(stone.id);
        if (update) {
          return { ...stone, x: update.x, y: update.y };
        }
        return stone;
      });
    });
  }, []);
  
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
            <GameBoard3D
              stones={stones}
              playAreaRadius={PLAY_AREA_RADIUS}
              onStonePlace={handleStonePlace}
              onCluster={handleCluster}
              updateStonePositions={updateStonePositions}
              currentPlayer={players[currentPlayer]}
              gameOver={gameOver}
              placementMode="flat"
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