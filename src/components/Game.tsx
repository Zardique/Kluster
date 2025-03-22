import React, { useState, useEffect, useCallback, useRef } from 'react';
import GameBoard from './GameBoard';
import PlayerInfo from './PlayerInfo';
import { Stone, Player } from '../types';
import { useMultiplayer } from '../context/MultiplayerContext';
import useDeviceDetect from '../hooks/useDeviceDetect';
import { standardizeStone, stoneIdToString } from '../utils/stoneUtils';
import './ModernUI.css';

interface GameProps {
  isMultiplayer?: boolean;
}

const Game: React.FC<GameProps> = ({ isMultiplayer = false }) => {
  const { isMobile } = useDeviceDetect();
  const [stones, setStones] = useState<Stone[]>([]);
  const [players, setPlayers] = useState<Player[]>([
    { id: 0, stonesLeft: 12, name: 'Player 1' },
    { id: 1, stonesLeft: 12, name: 'Player 2' }
  ]);
  const [currentPlayerId, setCurrentPlayerId] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [animatingStones, setAnimatingStones] = useState<Stone[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [placementMode, setPlacementMode] = useState<'flat' | 'edge'>('flat');
  
  // Multiplayer context
  const multiplayer = useMultiplayer();
  
  // Track if component is mounted
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Get current player
  const currentPlayer = players[currentPlayerId];
  
  // Handle mobile restriction
  if (isMobile) {
    return (
      <div className="desktop-only-message">
        <div className="desktop-only-content">
          <h2>Desktop Only Game</h2>
          <p>Kluster is currently optimized for desktop browsers.</p>
          <p>Please visit us from a desktop or laptop computer for the best experience.</p>
          <div className="computer-icon">💻</div>
        </div>
      </div>
    );
  }
  
  // Initialize multiplayer game state
  useEffect(() => {
    if (isMultiplayer && multiplayer) {
      multiplayer.socket?.on('game_state_updated', ({ gameState }) => {
        if (isMounted.current) {
          setStones(gameState.stones);
          setPlayers(gameState.players);
          setCurrentPlayerId(gameState.currentPlayer);
          setGameOver(gameState.gameOver);
          
          if (gameState.winner !== null) {
            setWinner(gameState.players[gameState.winner]);
          }
        }
      });
      
      multiplayer.socket?.on('game_start', ({ gameState }) => {
        if (isMounted.current) {
          setStones(gameState.stones);
          setPlayers(gameState.players);
          setCurrentPlayerId(gameState.currentPlayer);
          setGameOver(gameState.gameOver);
          setWinner(null);
        }
      });
      
      multiplayer.socket?.on('stone_placed', ({ x, y, playerId }) => {
        if (isMounted.current) {
          // Only add the stone if it's from the other player
          // (our own stones are added directly)
          if (multiplayer.playerId !== null && playerId !== multiplayer.playerId) {
            const stone = standardizeStone({ x, y, playerId });
            setStones(prev => [...prev, stone]);
          }
        }
      });
      
      multiplayer.socket?.on('stones_clustered', ({ clusteredStones, magneticFields }) => {
        if (isMounted.current) {
          console.log("Received cluster notification from server", clusteredStones);
          
          // Set animating stones for visual effect
          setAnimatingStones(clusteredStones);
          setIsAnimating(true);
          
          // Display magnetic fields for visualization (can be implemented in GameBoard)
          // This will show the invisible magnetic fields that caused the clustering
          
          // After animation completes, remove the stones
          setTimeout(() => {
            if (isMounted.current) {
              // Remove clustered stones using coordinates instead of IDs
              const clusterKeys = new Set(clusteredStones.map(s => `${s.x},${s.y}`));
              setStones(prev => prev.filter(s => !clusterKeys.has(`${s.x},${s.y}`)));
              
              // Reset animation state
              setAnimatingStones([]);
              setIsAnimating(false);
            }
          }, 800); // Animation duration
        }
      });
      
      multiplayer.socket?.on('game_ended', ({ winner }) => {
        if (isMounted.current) {
          setGameOver(true);
          setWinner(players[winner]);
        }
      });
      
      multiplayer.socket?.on('rematch_accepted', ({ gameState }) => {
        if (isMounted.current) {
          setStones(gameState.stones);
          setPlayers(gameState.players);
          setCurrentPlayerId(gameState.currentPlayer);
          setGameOver(gameState.gameOver);
          setWinner(null);
        }
      });
      
      multiplayer.socket?.on('player_disconnected', () => {
        if (isMounted.current) {
          setGameOver(true);
          alert('Your opponent has disconnected');
        }
      });
      
      return () => {
        multiplayer.socket?.off('game_state_updated');
        multiplayer.socket?.off('game_start');
        multiplayer.socket?.off('stone_placed');
        multiplayer.socket?.off('stones_clustered');
        multiplayer.socket?.off('game_ended');
        multiplayer.socket?.off('rematch_accepted');
        multiplayer.socket?.off('player_disconnected');
      };
    }
  }, [isMultiplayer, multiplayer]);
  
  // Check for game over (when a player has placed all their stones)
  useEffect(() => {
    if (!gameOver && !isAnimating) {
      // Check if any player has no stones left
      players.forEach(player => {
        if (player.stonesLeft <= 0) {
          setGameOver(true);
          setWinner(player);
          
          if (isMultiplayer && multiplayer && multiplayer.roomId) {
            // Ensure we're passing a number, not a Player object
            const winnerPlayerId: number = player.id;
            multiplayer.notifyGameOver(winnerPlayerId);
          }
        }
      });
    }
  }, [players, gameOver, isAnimating, isMultiplayer, multiplayer]);
  
  // Handle stone placement
  const handleStonePlaced = useCallback((x: number, y: number) => {
    if (gameOver || isAnimating) return;
    
    // Add stone with standardized properties
    const newStone = standardizeStone({ 
      x, 
      y, 
      playerId: currentPlayerId, 
      id: Math.floor(Math.random() * 10000) // Use numeric ID
    });
    setStones(prev => [...prev, newStone]);
    
    // In multiplayer, notify the server
    if (isMultiplayer && multiplayer && multiplayer.roomId) {
      multiplayer.placeStone(x, y);
    } else {
      // For single player, advance turn after placing stone
      // In multiplayer, turns will be managed by the server
      setCurrentPlayerId(prev => (prev + 1) % 2);
      
      // Update player stones left
      setPlayers(prev => prev.map(player => 
        player.id === currentPlayerId 
          ? { ...player, stonesLeft: player.stonesLeft - 1 }
          : player
      ));
    }
  }, [currentPlayerId, gameOver, isAnimating, isMultiplayer, multiplayer]);
  
  // Handle reset game
  const handleResetGame = () => {
    setStones([]);
    setPlayers([
      { id: 0, stonesLeft: 12, name: 'Player 1' },
      { id: 1, stonesLeft: 12, name: 'Player 2' }
    ]);
    setCurrentPlayerId(0);
    setGameOver(false);
    setWinner(null);
    
    // For multiplayer, request a rematch
    if (isMultiplayer && multiplayer && multiplayer.roomId) {
      multiplayer.requestRematch();
    }
  };
  
  // Determine if it's the player's turn in multiplayer
  const isMyTurn = !isMultiplayer || 
    (multiplayer?.playerId !== null && typeof multiplayer?.playerId === 'number' && 
     currentPlayerId === multiplayer.playerId);
  
  return (
    <div className={`game-container ${isAnimating ? 'animating' : ''}`}>
      <div className={`game-content ${isMobile ? 'game-content-mobile' : ''}`}>
        <div className="board-container">
          <GameBoard
            stones={stones}
            currentPlayer={currentPlayer}
            onStonePlaced={handleStonePlaced}
            onClustered={() => {}} // Clustering is now managed by the server
            placementMode={placementMode}
            isMyTurn={isMyTurn}
            animatingStones={animatingStones}
            isMobile={isMobile}
          />
        </div>
        
        <div className={`player-container ${isMobile ? 'player-container-mobile' : ''}`}>
          <PlayerInfo
            players={players}
            currentPlayerId={currentPlayerId}
            gameOver={gameOver}
            winner={winner}
            onReset={handleResetGame}
            isMultiplayer={isMultiplayer}
            isMyTurn={isMyTurn}
            isMobile={isMobile}
          />
          
          <div className="game-controls">
            <button 
              className="control-button" 
              onClick={() => setShowRules(!showRules)}
            >
              {showRules ? 'Hide Rules' : 'Show Rules'}
            </button>
            <button 
              className="control-button" 
              onClick={() => setPlacementMode(prev => prev === 'flat' ? 'edge' : 'flat')}
            >
              Stone Style: {placementMode === 'flat' ? 'Flat' : 'Edge'}
            </button>
          </div>
        </div>
      </div>
      
      {showRules && (
        <div className="rules-popup">
          <div className="rules-content">
            <h2>Kluster Game Rules</h2>
            <ul>
              <li>Players take turns placing magnetic stones on the board.</li>
              <li>Each stone has a magnetic field that extends beyond its visible edge.</li>
              <li>When the magnetic fields of two or more stones overlap significantly, they cluster and are removed from the board.</li>
              <li>If your stones cluster during your turn, they are removed and counted against your total.</li>
              <li>The first player to place all their stones without causing a cluster wins!</li>
            </ul>
            <button 
              className="close-button"
              onClick={() => setShowRules(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game; 