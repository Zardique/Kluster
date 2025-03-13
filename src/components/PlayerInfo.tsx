import React, { useState, useEffect } from 'react';
import { Player } from '../types';
import './ModernUI.css';

interface PlayerInfoProps {
  players: Player[];
  currentPlayer: number;
  gameOver: boolean;
  winner: number | null;
  onReset: () => void;
  myPlayerId?: number | null; // Optional prop to identify the current player in multiplayer mode
}

const PlayerInfo: React.FC<PlayerInfoProps> = ({
  players,
  currentPlayer,
  gameOver,
  winner,
  onReset,
  myPlayerId = null // Default to null for single-player mode
}) => {
  const [animatingPlayer, setAnimatingPlayer] = useState<number | null>(null);
  const [prevStonesLeft, setPrevStonesLeft] = useState<Record<number, number>>({});
  
  // Track changes in stones left to detect when a player receives clustered stones
  useEffect(() => {
    players.forEach(player => {
      const prevStones = prevStonesLeft[player.id] || player.stonesLeft;
      
      // If the player has more stones than before, they received clustered stones
      if (player.stonesLeft > prevStones) {
        setAnimatingPlayer(player.id);
        
        // Clear animation after a delay
        setTimeout(() => {
          setAnimatingPlayer(null);
        }, 1500);
      }
      
      // Update previous stones count
      setPrevStonesLeft(prev => ({
        ...prev,
        [player.id]: player.stonesLeft
      }));
    });
  }, [players, prevStonesLeft]);
  
  return (
    <div className="side-panel">
      <h2 className="game-title">Kluster</h2>
      
      <div className="player-cards">
        {players.map(player => (
          <div 
            key={player.id} 
            className={`player-card player-${player.id + 1} ${player.id === currentPlayer && !gameOver ? 'active' : ''} ${player.id === myPlayerId ? 'my-player' : ''}`}
          >
            <h3 className="player-name">
              {player.id === myPlayerId ? 'You' : 'Opponent'}
            </h3>
            <div className="stones-count">
              <span className={animatingPlayer === player.id ? 'count-changing' : ''}>
                {player.stonesLeft}
              </span>
            </div>
            <div className="stone-indicators">
              {Array.from({ length: Math.min(player.stonesLeft, 8) }).map((_, i) => (
                <div key={i} className="stone-indicator" />
              ))}
              {player.stonesLeft > 8 && <span>+{player.stonesLeft - 8}</span>}
            </div>
          </div>
        ))}
      </div>
      
      <div className="turn-indicator">
        <p className="turn-text">Current Turn</p>
        <p className={`player-turn player-${currentPlayer + 1}-turn`}>
          {myPlayerId !== null && currentPlayer === myPlayerId ? 'Your Turn' : 'Opponent\'s Turn'}
        </p>
        <p className="instruction">
          {myPlayerId !== null && currentPlayer === myPlayerId 
            ? 'Drag and drop a stone into the play area' 
            : 'Waiting for opponent to place a stone...'}
        </p>
      </div>
      
      <div className="game-rules">
        <h3 className="rules-title">Game Rules</h3>
        <ul className="rules-list">
          <li>Stones have magnetic properties and will cluster when close enough.</li>
          <li>If stones cluster during your turn, you must collect them all.</li>
          <li>The first player to place all their stones without causing a cluster wins.</li>
        </ul>
      </div>
    </div>
  );
};

const PLAYER_COLORS = ['#3498db', '#e74c3c']; // Blue for Player 1, Red for Player 2

export default PlayerInfo; 