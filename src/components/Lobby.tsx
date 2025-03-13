import React, { useState } from 'react';
import { useMultiplayer } from '../context/MultiplayerContext';
import './ModernUI.css';

interface LobbyProps {
  onStartGame: () => void;
}

const Lobby: React.FC<LobbyProps> = ({ onStartGame }) => {
  const [joinRoomId, setJoinRoomId] = useState('');
  const [copied, setCopied] = useState(false);
  
  const {
    createRoom,
    joinRoom,
    roomId,
    isHost,
    isInRoom,
    isGameStarted,
    opponentConnected,
    error
  } = useMultiplayer();
  
  // Handle room creation
  const handleCreateRoom = () => {
    createRoom();
  };
  
  // Handle room joining
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinRoomId.trim()) {
      joinRoom(joinRoomId.trim());
    }
  };
  
  // Copy room ID to clipboard
  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  // Start the game when both players are ready
  const handleStartGame = () => {
    if (isInRoom && (isHost ? opponentConnected : true)) {
      onStartGame();
    }
  };
  
  // If the game has started, don't show the lobby
  if (isGameStarted) {
    return null;
  }
  
  return (
    <div className="lobby-overlay">
      <div className="lobby-container">
        <h1 className="lobby-title">Kluster</h1>
        <p className="lobby-subtitle">A magnetic stone clustering game</p>
        
        {!isInRoom ? (
          <div className="lobby-options">
            <button 
              className="lobby-button create-room"
              onClick={handleCreateRoom}
            >
              Create New Game
            </button>
            
            <div className="lobby-divider">
              <span>OR</span>
            </div>
            
            <form onSubmit={handleJoinRoom} className="join-form">
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="Enter Room Code"
                className="room-input"
              />
              <button 
                type="submit" 
                className="lobby-button join-room"
                disabled={!joinRoomId.trim()}
              >
                Join Game
              </button>
            </form>
          </div>
        ) : (
          <div className="room-info">
            <h2>Room Code</h2>
            <div className="room-code">
              <span>{roomId}</span>
              <button 
                className="copy-button" 
                onClick={copyRoomId}
                title="Copy to clipboard"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            
            <p className="room-status">
              {isHost 
                ? opponentConnected 
                  ? 'Opponent connected! You can start the game.'
                  : 'Waiting for opponent to join...'
                : 'Connected to room. Waiting for host to start the game.'
              }
            </p>
            
            {isHost && (
              <button 
                className="lobby-button start-game"
                onClick={handleStartGame}
                disabled={!opponentConnected}
              >
                Start Game
              </button>
            )}
          </div>
        )}
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default Lobby; 