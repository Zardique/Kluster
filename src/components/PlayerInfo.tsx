import React, { useMemo } from 'react';
import { Player } from '../types';
import './PlayerInfo.css';

interface PlayerInfoProps {
  players: Player[];
  currentPlayerId: number;
  gameOver: boolean;
  winner: Player | number | null;
  onReset: () => void;
  isMultiplayer?: boolean;
  isMyTurn?: boolean;
  isMobile?: boolean;
}

const PlayerInfo: React.FC<PlayerInfoProps> = ({
  players,
  currentPlayerId,
  gameOver,
  winner,
  onReset,
  isMultiplayer = false,
  isMyTurn = false,
  isMobile = false
}) => {
  // Determine if this is a multiplayer game
  const isMultiplayerGame = isMultiplayer;
  
  // Calculate player labels
  const playerLabels = useMemo(() => {
    if (isMultiplayerGame) {
      return players.map(player => 
        player.id === currentPlayerId ? 'You' : 'Opponent'
      );
    } else {
      return ['Player 1', 'Player 2'];
    }
  }, [players, currentPlayerId, isMultiplayerGame]);
  
  // Determine active player animation
  const getPlayerCardClass = (playerId: number) => {
    let baseClass = 'player-card';
    
    // Add player-specific color class
    baseClass += ` player-${playerId}-card`;
    
    // Add active class if it's this player's turn
    if (currentPlayerId === playerId) {
      baseClass += ' active-player';
    }
    
    // Add winner/loser class if game over
    if (gameOver && winner !== null) {
      const winnerId = typeof winner === 'number' 
                     ? winner 
                     : winner.id;
      baseClass += winnerId === playerId ? ' winner-card' : ' loser-card';
    }
    
    return baseClass;
  };
  
  // Generate magnet indicators based on stones left
  const renderMagnetIndicators = (stonesLeft: number, maxStones: number) => {
    const indicators = [];
    for (let i = 0; i < maxStones; i++) {
      indicators.push(
        <div 
          key={i} 
          className={`magnet-indicator ${i < stonesLeft ? 'magnet-available' : 'magnet-used'}`}
        />
      );
    }
    return indicators;
  };
  
  return (
    <div className="player-info-container">
      <div className="game-title">
        <h1>Kluster</h1>
        <div className="glow-effect"></div>
      </div>
      
      <div className="player-cards">
        {players.map((player, index) => (
          <div key={player.id} className={getPlayerCardClass(player.id)}>
            <div className="player-name">
              {playerLabels[index]}
            </div>
            
            <div className="stones-counter">
              <span className="stones-number">{player.stonesLeft}</span>
              <span className="stones-label">magnets left</span>
            </div>
            
            <div className="magnet-indicators">
              {renderMagnetIndicators(player.stonesLeft, 12)}
            </div>
            
            {currentPlayerId === player.id && !gameOver && (
              <div className="current-turn-indicator">
                <div className="turn-pulse"></div>
                <span>Current Turn</span>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="turn-info">
        <h2>Current Turn</h2>
        <div className="current-player">
          {gameOver ? (
            <span className="game-over-message">
              Game Over! {
                typeof winner === 'object' && winner !== null 
                  ? winner.name 
                  : typeof winner === 'number'
                    ? players.find(p => p.id === winner)?.name || 'Someone'
                    : 'Someone'
              } Wins!
            </span>
          ) : (
            <>
              <span className={`player-turn player-${currentPlayerId}-text`}>
                {playerLabels[currentPlayerId]}'s Turn
              </span>
              {isMultiplayerGame && !isMyTurn && (
                <div className="waiting-message">
                  Waiting for opponent to place a stone...
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      <div className="game-rules">
        <h2>Game Rules</h2>
        <ul className="rules-list">
          <li>
            <span className="rule-icon">1</span>
            <span className="rule-text">Players take turns placing magnets on the game board.</span>
          </li>
          <li>
            <span className="rule-icon">2</span>
            <span className="rule-text">Magnets naturally attract each other when placed nearby.</span>
          </li>
          <li>
            <span className="rule-icon">3</span>
            <span className="rule-text">When magnets cluster together, they go to the opponent's pile.</span>
          </li>
          <li>
            <span className="rule-icon">4</span>
            <span className="rule-text">First player to place all their magnets on the board wins!</span>
          </li>
        </ul>
      </div>
      
      {gameOver && (
        <div className="game-actions">
          <button className="reset-button" onClick={onReset}>
            {isMultiplayerGame ? 'Request Rematch' : 'Play Again'}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlayerInfo; 