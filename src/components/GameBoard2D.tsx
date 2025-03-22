import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Stone, Player } from '../types';
import './GameBoard2D.css';

// Constants for the game
const STONE_RADIUS = 25;
const CLUSTER_THRESHOLD = STONE_RADIUS * 2; // Distance for clustering

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
  
  // Check for clustering periodically
  useEffect(() => {
    if (gameOver) return;
    
    const checkClustering = () => {
      const clusteredIds: string[] = [];
      
      // Check each pair of stones for clustering
      for (let i = 0; i < visibleStones.length; i++) {
        for (let j = i + 1; j < visibleStones.length; j++) {
          const stoneA = visibleStones[i];
          const stoneB = visibleStones[j];
          
          const dx = stoneB.x - stoneA.x;
          const dy = stoneB.y - stoneA.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < CLUSTER_THRESHOLD) {
            if (!clusteredIds.includes(stoneA.id)) {
              clusteredIds.push(stoneA.id);
            }
            if (!clusteredIds.includes(stoneB.id)) {
              clusteredIds.push(stoneB.id);
            }
          }
        }
      }
      
      // Notify about clustered stones
      if (clusteredIds.length > 0) {
        // Apply clustering animation first
        setClusteringStones(clusteredIds);
        
        // Wait for animation to complete before notifying
        setTimeout(() => {
          onCluster(clusteredIds);
          // Clear the clustering stones after animation completes
          setClusteringStones([]);
        }, 500); // Match animation duration in CSS
      }
    };
    
    // Check once on mount and when stones change
    checkClustering();
  }, [visibleStones, gameOver, onCluster]);
  
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