import { useState, useCallback, useEffect } from 'react';
import { GameState, Stone, Player, GameEvent } from '../types';

// Constants
const INITIAL_STONES_PER_PLAYER = 12;
const STONE_RADIUS = 15;

interface UseGameStateProps {
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
      currentPlayer: 0, // Player 1 starts
      stones: [],
      gameOver: false,
      winner: null,
      playAreaRadius
    };
  });

  // Debug: Log game state changes
  useEffect(() => {
    console.log('Game state updated:', gameState);
  }, [gameState]);

  // Place a stone at the specified position
  const placeStone = useCallback((x: number, y: number) => {
    console.log('Placing stone at position:', x, y);
    
    setGameState(prevState => {
      // Check if the game is over
      if (prevState.gameOver) return prevState;

      // Check if the position is within the play area
      const distanceFromCenter = Math.sqrt(
        Math.pow(x - playAreaRadius, 2) + Math.pow(y - playAreaRadius, 2)
      );
      
      if (distanceFromCenter + STONE_RADIUS > playAreaRadius) {
        console.log('Stone is outside the play area');
        return prevState; // Stone is outside the play area
      }

      const currentPlayer = prevState.currentPlayer;
      const player = prevState.players[currentPlayer];

      // Check if the player has stones left
      if (player.stonesLeft <= 0) {
        console.log('Player has no stones left');
        return prevState;
      }

      // Create a new stone
      const newStone: Stone = {
        id: `stone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        x,
        y,
        radius: STONE_RADIUS,
        player: currentPlayer,
        clustered: false
      };

      console.log('Created new stone:', newStone);

      // Update player's stones left
      const updatedPlayers = [...prevState.players];
      updatedPlayers[currentPlayer] = {
        ...player,
        stonesLeft: player.stonesLeft - 1
      };

      // Check if the player has won
      const hasWon = updatedPlayers[currentPlayer].stonesLeft === 0;

      const newState = {
        ...prevState,
        stones: [...prevState.stones, newStone],
        players: updatedPlayers,
        gameOver: hasWon,
        winner: hasWon ? currentPlayer : null
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
      const updatedStones = prevState.stones.map(stone => 
        clusteredStoneIds.includes(stone.id) 
          ? { ...stone, clustered: true } 
          : stone
      );

      // Count clustered stones by player
      const clusteredStonesByPlayer = clusteredStoneIds.reduce((acc, stoneId) => {
        const stone = prevState.stones.find(s => s.id === stoneId);
        if (stone) {
          acc[stone.player] = (acc[stone.player] || 0) + 1;
        }
        return acc;
      }, {} as Record<number, number>);

      // Update players' stones left
      const updatedPlayers = [...prevState.players];
      Object.entries(clusteredStonesByPlayer).forEach(([playerIdStr, count]) => {
        const playerId = parseInt(playerIdStr);
        updatedPlayers[playerId] = {
          ...updatedPlayers[playerId],
          stonesLeft: updatedPlayers[playerId].stonesLeft + count
        };
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

      // Switch to the next player
      const nextPlayer = (prevState.currentPlayer + 1) % prevState.players.length;

      console.log('Changing turn to player:', nextPlayer);
      
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
        const stoneIndex = updatedStones.findIndex(stone => stone.id === update.id);
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
    
    setGameState({
      players: [
        { id: 0, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 1' },
        { id: 1, stonesLeft: INITIAL_STONES_PER_PLAYER, name: 'Player 2' }
      ],
      currentPlayer: 0,
      stones: [],
      gameOver: false,
      winner: null,
      playAreaRadius
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