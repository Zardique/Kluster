import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Stone, Player } from '../types';
import './GameBoard2D.css';

// Constants for the game
const STONE_RADIUS = 25;
const CLUSTER_THRESHOLD = STONE_RADIUS * 1.8; // Reduced threshold for more accurate clustering

interface GameBoardProps {
  stones: Stone[];
  playAreaRadius: number;
  onStonePlace: (x: number, y: number) => void;
  onCluster: (clusteredStoneIds: string[]) => void;
  currentPlayer: Player;
  gameOver: boolean;
  isMobile?: boolean;
}

const GameBoard2D: React.FC<GameBoardProps> = ({
  stones,
  playAreaRadius,
  onStonePlace,
  onCluster,
  currentPlayer,
  gameOver,
  isMobile = false
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  // Filter out clustered stones
  const visibleStones = useMemo(() => 
    stones.filter(stone => !stone.clustered),
    [stones]
  );
  
  // Track stones that are being clustered for animation
  const [clusteringStones, setClusteringStones] = useState<string[]>([]);
  
  // Check for clustering based on distance
  const checkClustering = useCallback(() => {
    if (gameOver) return;
    
    // Reference to store pairs of potentially clustering stones
    const potentialClusters: Map<string, Set<string>> = new Map();
    const clusteringThreshold = STONE_RADIUS * 1.8; // Slightly less than diameter for more accurate detection
    
    // Check each pair of stones
    for (let i = 0; i < visibleStones.length; i++) {
      const stone1 = visibleStones[i];
      
      for (let j = i + 1; j < visibleStones.length; j++) {
        const stone2 = visibleStones[j];
        
        // Only check clustering for stones of the same player
        if (stone1.player.id !== stone2.player.id) continue;
        
        // Calculate distance between stones
        const dx = stone1.x - stone2.x;
        const dy = stone1.y - stone2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If stones are close enough to cluster
        if (distance < clusteringThreshold) {
          console.log(`Stones ${stone1.id} and ${stone2.id} are clustering. Distance: ${distance}`);
          
          // Add to potential clusters map
          const playerId = stone1.player.id.toString();
          if (!potentialClusters.has(playerId)) {
            potentialClusters.set(playerId, new Set());
          }
          
          potentialClusters.get(playerId)?.add(stone1.id);
          potentialClusters.get(playerId)?.add(stone2.id);
        }
      }
    }
    
    // Process potential clusters
    potentialClusters.forEach((stoneIds, playerId) => {
      if (stoneIds.size >= 2) {
        // Convert Set to Array for the callback
        const clusteringStoneIds = Array.from(stoneIds);
        console.log(`Notifying clustering for player ${playerId}, stones:`, clusteringStoneIds);
        
        // Set clustering animation state
        setClusteringStones(clusteringStoneIds);
        
        // Notify clustering after a short delay to show the animation
        setTimeout(() => {
          onCluster(clusteringStoneIds);
          // Reset clustering animation state
          setClusteringStones([]);
        }, 600);
      }
    });
    
  }, [visibleStones, gameOver, onCluster]);

  // Check for clustering after stones are placed or moved
  useEffect(() => {
    // Use a slight delay to allow rendering to complete
    const timeoutId = setTimeout(() => {
      checkClustering();
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [visibleStones, checkClustering]);
  
  // Handle mouse events for stone placement
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameOver) return;
    
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Start dragging
    setIsDragging(true);
    setDragPosition({ x, y });
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update mouse position for hover effects
    setMousePosition({ x, y });
    
    // If dragging, update drag position
    if (isDragging && !gameOver) {
      setDragPosition({ x, y });
    }
  };
  
  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || gameOver) return;
    
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if the position is within the play area
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const distanceFromCenter = Math.sqrt(
      Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
    );
    
    if (distanceFromCenter <= playAreaRadius - STONE_RADIUS) {
      // Convert to game coordinates
      const gameX = x - centerX;
      const gameY = y - centerY;
      
      // Check collision with other stones
      let canPlace = true;
      for (const stone of visibleStones) {
        const dx = stone.x - gameX;
        const dy = stone.y - gameY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < STONE_RADIUS * 1.8) {
          canPlace = false;
          break;
        }
      }
      
      if (canPlace) {
        // Place the stone at this position
        onStonePlace(gameX, gameY);
      }
    }
    
    // Reset dragging state
    setIsDragging(false);
    setDragPosition(null);
  };
  
  const handleMouseLeave = () => {
    // Reset states when mouse leaves the board
    setIsDragging(false);
    setDragPosition(null);
    setMousePosition(null);
  };
  
  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (gameOver) return;
    
    // Prevent scrolling
    e.preventDefault();
    
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || !e.touches[0]) return;
    
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;
    
    // Start dragging
    setIsDragging(true);
    setDragPosition({ x, y });
    setMousePosition({ x, y });
  };
  
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (gameOver) return;
    
    // Prevent scrolling
    e.preventDefault();
    
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || !e.touches[0]) return;
    
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;
    
    // Update positions
    setDragPosition(isDragging ? { x, y } : null);
    setMousePosition({ x, y });
  };
  
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || gameOver) return;
    
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || !dragPosition) return;
    
    const { x, y } = dragPosition;
    
    // Check if the position is within the play area
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const distanceFromCenter = Math.sqrt(
      Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
    );
    
    if (distanceFromCenter <= playAreaRadius - STONE_RADIUS) {
      // Convert to game coordinates
      const gameX = x - centerX;
      const gameY = y - centerY;
      
      // Check collision with other stones
      let canPlace = true;
      for (const stone of visibleStones) {
        const dx = stone.x - gameX;
        const dy = stone.y - gameY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < STONE_RADIUS * 1.8) {
          canPlace = false;
          break;
        }
      }
      
      if (canPlace) {
        // Place the stone at this position
        onStonePlace(gameX, gameY);
      }
    }
    
    // Reset states
    setIsDragging(false);
    setDragPosition(null);
  };
  
  // Is the current position valid for placement?
  const isValidPlacement = useMemo(() => {
    if (!mousePosition) return false;
    
    const centerX = playAreaRadius;
    const centerY = playAreaRadius;
    const distanceFromCenter = Math.sqrt(
      Math.pow(mousePosition.x - centerX, 2) + Math.pow(mousePosition.y - centerY, 2)
    );
    
    // Check if within play area
    if (distanceFromCenter > playAreaRadius - STONE_RADIUS) {
      return false;
    }
    
    // Convert to game coordinates
    const gameX = mousePosition.x - centerX;
    const gameY = mousePosition.y - centerY;
    
    // Check collision with other stones
    for (const stone of visibleStones) {
      const dx = stone.x - gameX;
      const dy = stone.y - gameY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Check if too close to another stone (allow some space between stones)
      if (distance < STONE_RADIUS * 1.8) {
        return false;
      }
    }
    
    return true;
  }, [mousePosition, playAreaRadius, visibleStones]);
  
  return (
    <div 
      ref={boardRef}
      className="game-board-2d"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        width: `${playAreaRadius * 2}px`,
        height: `${playAreaRadius * 2}px`,
        cursor: gameOver ? 'default' : (isValidPlacement ? 'pointer' : 'not-allowed'),
      }}
    >
      {/* Board background */}
      <div className="board-background"></div>
      
      {/* Add subtle grid for visual reference */}
      <div className="board-grid"></div>
      
      {/* Board boundary circle */}
      <div className="board-boundary"></div>
      
      {/* Visible stones */}
      {visibleStones.map(stone => (
        <div
          key={stone.id}
          className={`stone player-${stone.player.id} ${clusteringStones.includes(stone.id) ? 'clustering' : ''}`}
          style={{
            width: `${STONE_RADIUS * 2}px`,
            height: `${STONE_RADIUS * 2}px`,
            left: `${playAreaRadius + stone.x - STONE_RADIUS}px`,
            top: `${playAreaRadius + stone.y - STONE_RADIUS}px`,
          }}
        >
          <div className="stone-glow"></div>
        </div>
      ))}
      
      {/* Ghost stone while dragging */}
      {isDragging && dragPosition && (
        <div
          className={`stone ghost-stone player-${currentPlayer.id} ${isValidPlacement ? 'valid-placement' : 'invalid-placement'}`}
          style={{
            width: `${STONE_RADIUS * 2}px`,
            height: `${STONE_RADIUS * 2}px`,
            left: `${dragPosition.x - STONE_RADIUS}px`,
            top: `${dragPosition.y - STONE_RADIUS}px`,
          }}
        >
          <div className="stone-glow"></div>
        </div>
      )}
    </div>
  );
};

export default React.memo(GameBoard2D); 