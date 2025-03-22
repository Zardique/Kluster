import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import GameBoard2D from './GameBoard2D';
import PlayerInfo from './PlayerInfo';
import Lobby from './Lobby';
import { Stone, Player } from '../types';
import { useMultiplayer } from '../context/MultiplayerContext';
import useDeviceDetect from '../hooks/useDeviceDetect';
import './ModernUI.css';

// Game constants
const PLAY_AREA_RADIUS = 250;
const STONE_RADIUS = 25;
const STONE_HEIGHT = 10;
const INITIAL_STONES_PER_PLAYER = 12;
const PLAYER_COLORS = ['#6e8efb', '#f6d365'];

// Sound effects - moved outside component to avoid recreation
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

const Game: React.FC = () => {
  // Device detection for responsive design
  const { isMobile } = useDeviceDetect();
  
  // Game state
  const [stones, setStones] = useState<Stone[]>([]);
  const [players, setPlayers] = useState<Player[]>([
    { id: 0, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 1' },
    { id: 1, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 2' }
  ]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [showLobby, setShowLobby] = useState(true);
  
  // Refs for values that don't trigger renders
  const lastPlacedStoneIdRef = useRef<string | null>(null);
  const processingClusterRef = useRef<boolean>(false);
  const soundsLoaded = useRef<boolean>(false);
  
  // Multiplayer context
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
    
    // Clean up sounds on unmount
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
  
  // Safely play a sound
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
  
  // Setup multiplayer event listeners
  useEffect(() => {
    if (!socket) return;
    
    const onStonePlaced = (data: { x: number, y: number, playerId: number }) => {
      // Only handle stone placement if it's from the other player
      if (data.playerId !== playerId) {
        handleStonePlace(data.x, data.y, true);
        
        // Play sound
        if (soundsLoaded.current) {
          playSound(GAME_SOUNDS.placeStone);
        }
      }
    };
    
    const onStonesClustered = (data: { clusteredStones: Stone[] }) => {
      if (!processingClusterRef.current) {
        const clusterIds = data.clusteredStones.map(stone => stone.id);
        handleCluster(clusterIds, true);
      }
    };
    
    const onGameStateUpdated = (data: { gameState: any }) => {
      const { stones, players, currentPlayer, gameOver, winner } = data.gameState;
      setStones(stones);
      setPlayers(players);
      setCurrentPlayer(currentPlayer);
      setGameOver(gameOver);
      setWinner(winner);
    };
    
    const onGameEnded = (data: { winner: number }) => {
      setGameOver(true);
      setWinner(data.winner);
      
      if (soundsLoaded.current) {
        playSound(GAME_SOUNDS.gameOver);
      }
    };
    
    const onRematchAccepted = () => {
      resetGame();
    };
    
    // Set up event listeners
    socket.on('stone_placed', onStonePlaced);
    socket.on('stones_clustered', onStonesClustered);
    socket.on('game_state_updated', onGameStateUpdated);
    socket.on('game_ended', onGameEnded);
    socket.on('rematch_accepted', onRematchAccepted);
    
    // Clean up event listeners
    return () => {
      socket.off('stone_placed', onStonePlaced);
      socket.off('stones_clustered', onStonesClustered);
      socket.off('game_state_updated', onGameStateUpdated);
      socket.off('game_ended', onGameEnded);
      socket.off('rematch_accepted', onRematchAccepted);
    };
  }, [socket, playerId, playSound]);
  
  // Handle stone placement
  const handleStonePlace = useCallback((x: number, y: number, fromServer = false) => {
    // If it's not our turn and not from the server, don't allow placement
    if (!fromServer && playerId !== null && currentPlayer !== playerId) {
      console.log("Not your turn", playerId, currentPlayer);
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
      onEdge: false // Simplified for the TAG version
    };
    
    // Add stone to the board
    setStones(prevStones => [...prevStones, newStone]);
    lastPlacedStoneIdRef.current = newStone.id;
    
    // Play stone placement sound
    if (!fromServer && soundsLoaded.current) {
      playSound(GAME_SOUNDS.placeStone);
    }
    
    // Update player stones
    setPlayers(prevPlayers => {
      const newPlayers = prevPlayers.map((player, idx) => {
        if (idx === currentPlayer) {
          return {
            ...player,
            stonesLeft: Math.max(0, player.stonesLeft - 1)
          };
        }
        return player;
      });
      
      return newPlayers;
    });
    
    // Check for game over
    if (players[currentPlayer].stonesLeft <= 1) {
      setTimeout(() => {
        setGameOver(true);
        setWinner(currentPlayer);
        
        if (soundsLoaded.current) {
          playSound(GAME_SOUNDS.gameOver);
        }
        
        if (playerId !== null && isInRoom) {
          notifyGameOver(currentPlayer);
        }
      }, 300);
    } else {
      // Switch to next player
      const nextPlayer = (currentPlayer + 1) % players.length;
      setCurrentPlayer(nextPlayer);
      
      // Update multiplayer state
      if (!fromServer && playerId !== null && isInRoom) {
        // Send stone placement event
        emitPlaceStone(x, y);
        
        // Update game state
        setTimeout(() => {
          const gameState = {
            stones: [...stones, newStone],
            players: players.map((player, idx) => {
              if (idx === currentPlayer) {
                return {
                  ...player,
                  stonesLeft: player.stonesLeft - 1
                };
              }
              return player;
            }),
            currentPlayer: nextPlayer,
            gameOver: players[currentPlayer].stonesLeft <= 1,
            winner: players[currentPlayer].stonesLeft <= 1 ? currentPlayer : null
          };
          
          updateGameState(gameState);
        }, 50);
      }
    }
  }, [currentPlayer, players, stones, playerId, isInRoom, emitPlaceStone, 
      updateGameState, notifyGameOver, playSound]);
  
  // Handle clustered stones
  const handleCluster = useCallback((clusteredStoneIds: string[], fromServer = false) => {
    if (clusteredStoneIds.length === 0) return;
    
    // Prevent duplicate processing
    processingClusterRef.current = true;
    
    // Find the clustered stones
    const clusteredStones = stones.filter(stone => 
      clusteredStoneIds.includes(stone.id)
    );
    
    // Last player who placed a stone
    const lastPlayerIndex = currentPlayer === 0 ? 1 : 0;
    
    // Create a set for faster lookups
    const clusteredStoneIdsSet = new Set(clusteredStoneIds);
    
    // Update the stones list - remove clustered stones
    setStones(prevStones => {
      const updatedStones = prevStones.filter(stone => !clusteredStoneIdsSet.has(stone.id));
      
      // Update player stones
      setPlayers(prevPlayers => {
        const updatedPlayers = [...prevPlayers];
        
        // Add clustered stones to the last player
        updatedPlayers[lastPlayerIndex] = {
          ...updatedPlayers[lastPlayerIndex],
          stonesLeft: updatedPlayers[lastPlayerIndex].stonesLeft + clusteredStones.length
        };
        
        // Notify multiplayer
        if (playerId !== null && isInRoom && !fromServer) {
          notifyCluster(clusteredStones);
          
          // Update game state
          updateGameState({
            stones: updatedStones,
            players: updatedPlayers,
            currentPlayer,
            gameOver,
            winner
          });
        }
        
        // Check for game over
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
    
    // Reset processing flag
    setTimeout(() => {
      processingClusterRef.current = false;
    }, 700);
  }, [currentPlayer, playerId, isInRoom, notifyCluster, updateGameState, 
      gameOver, winner, playSound, soundsLoaded, stones]);
  
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
    lastPlacedStoneIdRef.current = null;
    processingClusterRef.current = false;
    
    // Request rematch if in multiplayer
    if (playerId !== null && isInRoom) {
      requestRematch();
    }
  }, [playerId, isInRoom, requestRematch]);
  
  // Handle starting the game from lobby
  const handleStartGame = useCallback(() => {
    setShowLobby(false);
  }, []);
  
  // Memoize values for performance
  const isMyTurn = useMemo(() => 
    playerId === null || playerId === currentPlayer, 
    [playerId, currentPlayer]
  );
  
  // Debug logging
  useEffect(() => {
    console.log("Current player:", currentPlayer, "My Player ID:", playerId, "Is my turn:", isMyTurn);
  }, [currentPlayer, playerId, isMyTurn]);
  
  // Adjust layout based on device
  const gameContentClass = useMemo(() => 
    isMobile ? "game-content game-content-mobile" : "game-content", 
    [isMobile]
  );
  
  // If user is on mobile, show a message instead of the game
  if (isMobile) {
    return (
      <div className="modern-container">
        <div className="mobile-restriction">
          <h2>Desktop Only Game</h2>
          <p>Sorry, Kluster is currently optimized for desktop browsers only.</p>
          <p>Please visit this page on a desktop or laptop computer for the best experience.</p>
          <div className="mobile-restriction-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </div>
        </div>
      </div>
    );
  }
  
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
      
      {/* Game content */}
      {(!showLobby || isGameStarted) && (
        <div className={gameContentClass}>
          {/* Game board */}
          <div className="board-wrapper">
            <div 
              className="board-glow" 
              style={{ 
                background: currentPlayer === 0 
                  ? 'rgba(110, 142, 251, 0.3)' 
                  : 'rgba(246, 211, 101, 0.3)' 
              }}
            ></div>
            <GameBoard2D
              stones={stones}
              playAreaRadius={isMobile ? PLAY_AREA_RADIUS * 0.8 : PLAY_AREA_RADIUS}
              onStonePlace={handleStonePlace}
              onCluster={handleCluster}
              currentPlayer={players[currentPlayer]}
              gameOver={gameOver}
              isMobile={isMobile}
            />
          </div>
          
          {/* Player info */}
          <PlayerInfo
            players={players}
            currentPlayer={currentPlayer}
            gameOver={false}
            winner={null}
            onReset={resetGame}
            myPlayerId={playerId}
            isMobile={isMobile}
          />
        </div>
      )}
      
      {/* Game over popup */}
      {gameOver && (
        <div className="game-over-overlay">
          <div className={isMobile ? "game-over-popup mobile-popup" : "game-over-popup"}>
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