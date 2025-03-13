import React, { useState, useEffect } from 'react';
import { useMultiplayer } from '../context/MultiplayerContext';
import './ModernUI.css';

interface LobbyProps {
  onStartGame: () => void;
}

const Lobby: React.FC<LobbyProps> = ({ onStartGame }) => {
  const [roomIdInput, setRoomIdInput] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  
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
  
  const handleCreateRoom = () => {
    createRoom();
  };
  
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim()) {
      setJoinError('Please enter a room code');
      return;
    }
    
    joinRoom(roomIdInput.trim().toUpperCase());
    setJoinError(null);
  };
  
  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
    }
  };
  
  const handleStartGame = () => {
    if (isInRoom && isHost && opponentConnected) {
      onStartGame();
    }
  };
  
  // Reset join error when toggling form
  useEffect(() => {
    setJoinError(null);
  }, [showJoinForm]);
  
  // If game has started, don't show the lobby
  if (isGameStarted) {
    return null;
  }
  
  return (
    <div className="lobby-overlay">
      <div className="bg-element bg-element-1"></div>
      <div className="bg-element bg-element-2"></div>
      <div className="bg-element bg-element-3"></div>
      
      <div className="lobby">
        <h1 className="lobby-title">Kluster</h1>
        <p className="lobby-subtitle">A magnetic stone clustering game</p>
        
        {!isInRoom ? (
          <>
            <div className="lobby-buttons">
              <button className="lobby-button" onClick={handleCreateRoom}>
                Create New Game
              </button>
              <button 
                className="lobby-button secondary" 
                onClick={() => setShowJoinForm(!showJoinForm)}
              >
                {showJoinForm ? 'Cancel' : 'Join Existing Game'}
              </button>
            </div>
            
            {showJoinForm && (
              <form onSubmit={handleJoinRoom} className="join-form">
                <input
                  type="text"
                  className="room-input"
                  placeholder="Enter Room Code"
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                  maxLength={6}
                />
                <button type="submit" className="lobby-button">
                  Join Game
                </button>
                {joinError && <p className="error-message">{joinError}</p>}
              </form>
            )}
          </>
        ) : (
          <>
            <div className="room-code">
              <span>{roomId}</span>
              <button className="copy-button" onClick={handleCopyRoomId} title="Copy to clipboard">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                  <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                </svg>
              </button>
            </div>
            
            <p className="room-status">
              {!opponentConnected 
                ? "Waiting for opponent to join..." 
                : "Opponent joined! Ready to start."}
            </p>
            
            {isHost && opponentConnected && (
              <button 
                className="lobby-button start-game" 
                onClick={handleStartGame}
              >
                Start Game
              </button>
            )}
            
            {isHost && !opponentConnected && (
              <p className="instruction">
                Share the room code with a friend to play together
              </p>
            )}
            
            {!isHost && (
              <p className="instruction">
                Waiting for the host to start the game
              </p>
            )}
          </>
        )}
        
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
};

export default Lobby; 