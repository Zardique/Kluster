import React, { useState, useCallback, useEffect } from 'react';
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
  
  // Listen for stone placement events from the server
  useEffect(() => {
    if (!socket) return;
    
    socket.on('stone_placed', (data: { x: number, y: number, playerId: number }) => {
      // Only handle stone placement if it's from the other player
      if (data.playerId !== playerId) {
        handleStonePlace(data.x, data.y, true);
      }
    });
    
    socket.on('stones_clustered', (data: { clusteredStones: Stone[] }) => {
      // Handle clustering event
      handleCluster(data.clusteredStones);
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
  }, [socket, playerId]);
  
  // Handle stone placement
  const handleStonePlace = useCallback((x: number, y: number, fromServer = false) => {
    // If it's not our turn and not from the server, don't allow placement
    if (!fromServer && playerId !== null && currentPlayer !== playerId) {
      return;
    }
    
    // Create a new stone
    const newStone: Stone = {
      id: `stone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      x,
      y,
      radius: STONE_RADIUS,
      height: STONE_HEIGHT,
      player: players[currentPlayer],
      clustered: false,
      onEdge: false // Always flat placement
    };
    
    // Add the stone to the game
    setStones(prevStones => [...prevStones, newStone]);
    
    // Store the ID of the last placed stone
    setLastPlacedStoneId(newStone.id);
    
    // Update player's stones left
    setPlayers(prevPlayers => {
      const updatedPlayers = [...prevPlayers];
      updatedPlayers[currentPlayer] = {
        ...updatedPlayers[currentPlayer],
        stonesLeft: updatedPlayers[currentPlayer].stonesLeft - 1
      };
      
      // Check if the player has won
      if (updatedPlayers[currentPlayer].stonesLeft === 0) {
        setGameOver(true);
        setWinner(currentPlayer);
        
        // Notify other players about game over
        if (!fromServer && playerId !== null) {
          notifyGameOver(currentPlayer);
        }
      }
      
      return updatedPlayers;
    });
    
    // Change the turn
    setCurrentPlayer(prevPlayer => (prevPlayer + 1) % players.length);
    
    // If this is our move, emit it to the server
    if (!fromServer && playerId !== null && isInRoom) {
      emitPlaceStone(x, y);
      
      // Update the game state on the server
      updateGameState({
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
        gameOver: gameOver,
        winner: winner
      });
    }
  }, [currentPlayer, players, stones, playerId, isInRoom, emitPlaceStone, updateGameState, notifyGameOver, gameOver, winner]);
  
  // Handle clustered stones
  const handleCluster = useCallback((clusteredStones: Stone[]) => {
    if (clusteredStones.length === 0) return;
    
    // Find the player who placed the last stone
    const lastPlayerIndex = currentPlayer === 0 ? 1 : 0; // Previous player
    
    // Count clustered stones
    let clusteredStonesCount = clusteredStones.length;
    
    // Remove clustered stones from the board
    setStones(prevStones => 
      prevStones.filter(stone => !clusteredStones.includes(stone))
    );
    
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
    
    // Notify other players about the clustering
    if (playerId !== null && isInRoom) {
      notifyCluster(clusteredStones);
      
      // Update the game state on the server
      updateGameState({
        stones: stones.filter(stone => !clusteredStones.includes(stone)),
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
  }, [currentPlayer, players, stones, playerId, isInRoom, notifyCluster, updateGameState, gameOver, winner]);
  
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
      
      {/* Game over popup overlay */}
      {gameOver && (
        <div className="game-over-overlay">
          <div className="game-over-popup">
            <h2 className="game-over-title">Game Over!</h2>
            {winner !== null && (
              <p className="winner-text">
                {winner === playerId ? 'You win!' : `${players[winner].name} wins!`}
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