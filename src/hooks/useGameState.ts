import { useState, useCallback, useEffect } from 'react';
import { Player, Stone } from '../types';
import { standardizeStone, stoneIdToString } from '../utils/stoneUtils';

// Constants
const INITIAL_STONES_PER_PLAYER = 12;
const STONE_RADIUS = 25;

interface UseGameStateProps {
  playAreaRadius: number;
}

interface GameState {
  players: Player[];
  currentPlayer: Player;
  stones: Stone[];
  gameOver: boolean;
  winner: Player | null;
  lastPlacedStoneId: string | null;
  playAreaRadius: number;
}

const useGameState = ({ playAreaRadius }: UseGameStateProps) => {
  const [gameState, setGameState] = useState<GameState>(() => {
    // Initialize players
    const players: Player[] = [
      { id: 0, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 1' },
      { id: 1, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 2' }
    ];

    return {
      players,
      currentPlayer: players[0], // Player 1 starts
      stones: [],
      gameOver: false,
      winner: null,
      lastPlacedStoneId: null,
      playAreaRadius
    };
  });

  // Debug: Log game state changes
  useEffect(() => {
    console.log('Game state updated:', gameState);
  }, [gameState]);

  // Place a stone on the board
  const placeStone = useCallback((x: number, y: number) => {
    console.log(`Placing stone at (${x}, ${y})`);
    
    setGameState(prevState => {
      // Check if the game is over
      if (prevState.gameOver) return prevState;

      // Get current player
      const playerIndex = prevState.players.findIndex(p => p.id === prevState.currentPlayer.id);
      const player = prevState.players[playerIndex];
      const currentPlayer = prevState.currentPlayer;

      // Check if player has stones left
      if (player.stonesLeft <= 0) {
        console.log('Player has no stones left');
        return prevState;
      }

      // Create a new stone with standardized properties
      const newStone = standardizeStone({
        id: Math.random() * 10000 | 0, // Generate a numeric ID
        x,
        y,
        radius: STONE_RADIUS,
        playerId: currentPlayer.id,
        clustered: false,
        onEdge: false // Default not on edge
      });

      console.log('Created new stone:', newStone);

      // Update player's stones left
      const updatedPlayers = [...prevState.players];
      updatedPlayers[playerIndex] = {
        ...player,
        stonesLeft: player.stonesLeft - 1
      };

      // Check if the player has won
      const hasWon = updatedPlayers[playerIndex].stonesLeft === 0;

      const newState = {
        ...prevState,
        stones: [...prevState.stones, newStone],
        players: updatedPlayers,
        gameOver: hasWon,
        winner: hasWon ? currentPlayer : null,
        lastPlacedStoneId: stoneIdToString(newStone.id)
      };

      console.log('New game state after placing stone:', newState);
      return newState;
    });
  }, [playAreaRadius]);

  // Handle clustered stones
  const handleCluster = useCallback((clusteredStoneIds: string[]) => {
    console.log('Handling clustered stones:', clusteredStoneIds);
    
    setGameState(prevState => {
      // Check if the game is over
      if (prevState.gameOver) return prevState;

      // Mark stones as clustered
      const updatedStones = prevState.stones.map(stone => {
        const stoneIdStr = stoneIdToString(stone.id);
        return clusteredStoneIds.includes(stoneIdStr) 
          ? { ...stone, clustered: true } 
          : stone;
      });

      // Count clustered stones by player
      const clusteredStonesByPlayer: Record<number, number> = {};
      
      clusteredStoneIds.forEach(stoneIdStr => {
        const stone = prevState.stones.find(s => stoneIdToString(s.id) === stoneIdStr);
        if (stone) {
          const playerId = stone.playerId;
          clusteredStonesByPlayer[playerId] = (clusteredStonesByPlayer[playerId] || 0) + 1;
        }
      });

      // Update players' stones left
      const updatedPlayers = [...prevState.players];
      Object.entries(clusteredStonesByPlayer).forEach(([playerIdStr, count]) => {
        const playerId = parseInt(playerIdStr, 10);
        const playerIndex = updatedPlayers.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
          updatedPlayers[playerIndex] = {
            ...updatedPlayers[playerIndex],
            stonesLeft: updatedPlayers[playerIndex].stonesLeft + count
          };
        }
      });

      // Log for debugging
      console.log('Clustered stones:', clusteredStoneIds);
      console.log('Updated players:', updatedPlayers);
      console.log('Updated stones:', updatedStones);

      return {
        ...prevState,
        stones: updatedStones,
        players: updatedPlayers
      };
    });
  }, []);

  // Change the current player
  const nextTurn = useCallback(() => {
    setGameState(prevState => {
      // Check if the game is over
      if (prevState.gameOver) return prevState;

      // Find the current player index
      const currentPlayerIndex = prevState.players.findIndex(
        player => player.id === prevState.currentPlayer.id
      );
      
      // Switch to the next player
      const nextPlayerIndex = (currentPlayerIndex + 1) % prevState.players.length;
      const nextPlayer = prevState.players[nextPlayerIndex];

      console.log('Changing turn to player:', nextPlayer.id);
      
      return {
        ...prevState,
        currentPlayer: nextPlayer
      };
    });
  }, []);

  // Update stone positions from physics engine
  const updateStonePositions = useCallback((updates: { id: string; x: number; y: number }[]) => {
    if (updates.length === 0) return;
    
    setGameState(prevState => {
      const updatedStones = [...prevState.stones];
      
      updates.forEach(update => {
        // Convert string ID to number for comparison
        const updateIdNum = parseInt(update.id, 10);
        const stoneIndex = updatedStones.findIndex(stone => 
          // Make sure we're comparing numbers to numbers
          stone.id === updateIdNum
        );
        
        if (stoneIndex !== -1) {
          updatedStones[stoneIndex] = {
            ...updatedStones[stoneIndex],
            x: update.x,
            y: update.y
          };
        }
      });

      return {
        ...prevState,
        stones: updatedStones
      };
    });
  }, []);

  // Reset the game
  const resetGame = useCallback(() => {
    console.log('Resetting game');
    
    setGameState(prevState => {
      const players = [
        { id: 0, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 1' },
        { id: 1, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 2' }
      ];
      
      return {
        players,
        currentPlayer: players[0],
        stones: [],
        gameOver: false,
        winner: null,
        lastPlacedStoneId: null,
        playAreaRadius
      };
    });
  }, [playAreaRadius]);

  return {
    gameState,
    placeStone,
    handleCluster,
    nextTurn,
    updateStonePositions,
    resetGame
  };
};

export default useGameState; 