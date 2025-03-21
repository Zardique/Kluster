import React, { useState, useCallback, useEffect, useRef } from 'react';
import GameBoard from './GameBoard';
import PlayerInfo from './PlayerInfo';
import Lobby from './Lobby';
import { Stone, Player } from '../types';
import { useMultiplayer } from '../context/MultiplayerContext';
import './ModernUI.css';

const PLAY_AREA_RADIUS = 250;
const STONE_RADIUS = 25;
const STONE_HEIGHT = 8; // Height of the stone when placed flat
const INITIAL_STONES_PER_PLAYER = 12; // 24 stones divided equally between 2 players
const PLAYER_COLORS = ['#6e8efb', '#f6d365']; // Updated colors to match our modern UI

// Create and preload sound effects
const createAudio = (path: string) => {
  try {
    const audio = new Audio(path);
    audio.load();
    audio.volume = 0.2; // Lower volume for milder sounds
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

// Game sounds
const GAME_SOUNDS = {
  placeStone: createAudio('/sounds/place-stone.mp3'),
  gameOver: createAudio('/sounds/game-over.mp3')
};

// Check if we're in development mode (Vite sets this)
const isDevelopment = import.meta.env.DEV;

const Game: React.FC = () => {
  // Game state
  const [stones, setStones] = useState<Stone[]>([]);
  const [players, setPlayers] = useState<Player[]>([
    { id: 0, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 1' },
    { id: 1, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 2' }
  ]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [lastPlacedStoneId, setLastPlacedStoneId] = useState<string | null>(null);
  const [showLobby, setShowLobby] = useState(true);
  const [processingCluster, setProcessingCluster] = useState(false);
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
    
    socket.on('stone_placed', (data: { x: number, y: number, playerId: number }) => {
      // Only handle stone placement if it's from the other player
      if (data.playerId !== playerId) {
        handleStonePlace(data.x, data.y, true);
        
        // Play stone placement sound when the opponent places a stone
        if (soundsLoaded.current) {
          playSound(GAME_SOUNDS.placeStone);
        }
      }
    });
    
    socket.on('stones_clustered', (data: { clusteredStones: Stone[] }) => {
      console.log('Received stones_clustered event:', data.clusteredStones);
      // Only process if we're not already processing a cluster
      // and if the event wasn't triggered by us
      if (!processingCluster) {
        handleCluster(data.clusteredStones, true);
      }
    });
    
    socket.on('game_state_updated', (data: { gameState: any }) => {
      // Update the game state
      setStones(data.gameState.stones);
      setPlayers(data.gameState.players);
      setCurrentPlayer(data.gameState.currentPlayer);
      setGameOver(data.gameState.gameOver);
      setWinner(data.gameState.winner);
    });
    
    socket.on('game_ended', (data: { winner: number }) => {
      // Handle game over
      setGameOver(true);
      setWinner(data.winner);
      
      // Play game over sound
      if (soundsLoaded.current) {
        playSound(GAME_SOUNDS.gameOver);
      }
    });
    
    socket.on('rematch_accepted', (data: { gameState: any }) => {
      // Reset the game state
      resetGame();
    });
    
    return () => {
      socket.off('stone_placed');
      socket.off('stones_clustered');
      socket.off('game_state_updated');
      socket.off('game_ended');
      socket.off('rematch_accepted');
    };
  }, [socket, playerId, processingCluster, playSound, soundsLoaded]);
  
  // Handle stone placement
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
    
    // Add the stone to the board
    setStones(prevStones => [...prevStones, newStone]);
    setLastPlacedStoneId(newStone.id);
    
    // Play stone placement sound for local placements
    if (!fromServer && soundsLoaded.current) {
      playSound(GAME_SOUNDS.placeStone);
    }
    
    // Update the current player's stones left and check for win
    let gameEnded = false;
    let winningPlayer: number | null = null;
    
    setPlayers(prevPlayers => {
      const updatedPlayers = [...prevPlayers];
      updatedPlayers[currentPlayer] = {
        ...updatedPlayers[currentPlayer],
        stonesLeft: updatedPlayers[currentPlayer].stonesLeft - 1
      };
      
      // Check if current player has placed all stones
      if (updatedPlayers[currentPlayer].stonesLeft === 0) {
        gameEnded = true;
        winningPlayer = currentPlayer;
      }
      
      return updatedPlayers;
    });
    
    // If the game has ended after this move
    if (gameEnded && winningPlayer !== null) {
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
    } else {
      // Switch to the next player
      setCurrentPlayer(prevPlayer => (prevPlayer + 1) % players.length);
    }
    
    // If this is our move, emit it to the server
    if (!fromServer && playerId !== null && isInRoom) {
      emitPlaceStone(x, y);
      
      // Update the game state on the server
      updateGameState({
        stones: [...stones, newStone],
        currentPlayer: gameEnded ? currentPlayer : (currentPlayer + 1) % players.length,
        players: players.map((player, idx) => {
          if (idx === currentPlayer) {
            return {
              ...player,
              stonesLeft: player.stonesLeft - 1
            };
          }
          return player;
        }),
        gameOver: gameEnded,
        winner: gameEnded ? winningPlayer : null
      });
    }
  }, [currentPlayer, players, stones, playerId, isInRoom, emitPlaceStone, updateGameState, notifyGameOver, playSound, soundsLoaded]);
  
  // Handle clustered stones
  const handleCluster = useCallback((clusteredStones: Stone[], fromServer = false) => {
    if (clusteredStones.length === 0) return;
    
    console.log('Handling cluster:', clusteredStones, 'fromServer:', fromServer);
    
    // Set processing flag to prevent duplicate processing
    setProcessingCluster(true);
    
    // Find the player who placed the last stone
    const lastPlayerIndex = currentPlayer === 0 ? 1 : 0; // Previous player
    
    // Count clustered stones
    let clusteredStonesCount = clusteredStones.length;
    
    // Remove clustered stones from the board with stoneIds
    setStones(prevStones => {
      const stoneIdsToRemove = new Set(clusteredStones.map(s => s.id));
      return prevStones.filter(stone => !stoneIdsToRemove.has(stone.id));
    });
    
    // Update the player who placed the last stone - they get all clustered stones
    setPlayers(prevPlayers => {
      const updatedPlayers = [...prevPlayers];
      
      // Add the clustered stones to the player who placed the last stone
      updatedPlayers[lastPlayerIndex] = {
        ...updatedPlayers[lastPlayerIndex],
        stonesLeft: updatedPlayers[lastPlayerIndex].stonesLeft + clusteredStonesCount
      };
      
      return updatedPlayers;
    });
    
    // Notify other players about the clustering only if this is a local event
    if (playerId !== null && isInRoom && !fromServer) {
      console.log('Notifying server about cluster:', clusteredStones);
      notifyCluster(clusteredStones);
      
      // Update the game state on the server
      updateGameState({
        stones: stones.filter(stone => !clusteredStones.some(cs => cs.id === stone.id)),
        currentPlayer: currentPlayer,
        players: players.map((player, idx) => {
          if (idx === lastPlayerIndex) {
            return {
              ...player,
              stonesLeft: player.stonesLeft + clusteredStonesCount
            };
          }
          return player;
        }),
        gameOver: gameOver,
        winner: winner
      });
    }
    
    // Reset processing flag after a short delay
    setTimeout(() => {
      setProcessingCluster(false);
      
      // After processing the cluster, check if any player now has 0 stones left
      setPlayers(prevPlayers => {
        const hasWinner = checkGameOver(prevPlayers);
        return prevPlayers;
      });
    }, 1000); // Give time for animation to complete
  }, [currentPlayer, players, stones, playerId, isInRoom, notifyCluster, updateGameState, gameOver, winner, checkGameOver]);
  
  // Reset game state
  const resetGame = useCallback(() => {
    setStones([]);
    setPlayers([
      { id: 0, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 1' },
      { id: 1, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 2' }
    ]);
    setCurrentPlayer(0);
    setGameOver(false);
    setWinner(null);
    setLastPlacedStoneId(null);
    
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
              isMyTurn={playerId === null || playerId === currentPlayer}
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

export default Game; 