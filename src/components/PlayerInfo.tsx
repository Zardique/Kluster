import React, { useState, useEffect } from 'react';
import { Player } from '../types';
import './ModernUI.css';

interface PlayerInfoProps {
  players: Player[];
  currentPlayer: number;
  gameOver: boolean;
  winner: number | null;
  onReset: () => void;
  myPlayerId: number | null;
  isMobile?: boolean;
}

const PlayerInfo: React.FC<PlayerInfoProps> = ({
  players,
  currentPlayer,
  gameOver,
  winner,
  onReset,
  myPlayerId = null, // Default to null for single-player mode
  isMobile = false
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
  
  const cardClass = (player: Player, index: number) => {
    const isCurrentPlayer = index === currentPlayer;
    const isPlayerTurn = `player-card ${isCurrentPlayer ? 'active' : ''}`;
    const isThisPlayer = myPlayerId !== null && index === myPlayerId ? ' you' : '';
    const isAnimating = animatingPlayer === index ? ' receiving' : '';
    
    return `${isPlayerTurn}${isThisPlayer}${isAnimating}`;
  };
  
  // Adjust content based on device
  const rulesList = isMobile ? (
    <ul>
      <li>Place magnets on the board.</li>
      <li>Clustered magnets go to the opposite player.</li>
      <li>First to place all magnets wins!</li>
    </ul>
  ) : (
    <ul>
      <li>Players take turns placing magnets on the game board.</li>
      <li>Magnets naturally attract each other when placed nearby.</li>
      <li>When magnets cluster together, they go to the opponent's pile.</li>
      <li>First player to place all their magnets on the board wins!</li>
    </ul>
  );
  
  return (
    <div className="side-panel">
      <h2 className="game-title">Kluster</h2>
      
      <div className="player-cards">
        {players.map((player, index) => (
          <div 
            key={player.id} 
            className={cardClass(player, index)}
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
        {rulesList}
      </div>
    </div>
  );
};

const PLAYER_COLORS = ['#3498db', '#e74c3c']; // Blue for Player 1, Red for Player 2

export default PlayerInfo; 