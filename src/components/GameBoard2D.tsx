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
  
  // Track stones with magnetic pull effect (close to clustering)
  const [magneticPullStones, setMagneticPullStones] = useState<string[]>([]);
  
  // Calculate and track potential clustering lines for debugging
  const [debugLines, setDebugLines] = useState<{from: Stone, to: Stone, distance: number}[]>([]);
  
  // Check for clustering based on distance
  const checkClustering = useCallback(() => {
    if (gameOver) return;
    
    console.log("Checking for clustering...");
    console.log("Current stones:", visibleStones);
    
    // Group stones by player
    const stonesByPlayer = new Map<number, Stone[]>();
    
    visibleStones.forEach(stone => {
      const playerId = stone.player.id;
      if (!stonesByPlayer.has(playerId)) {
        stonesByPlayer.set(playerId, []);
      }
      stonesByPlayer.get(playerId)?.push(stone);
    });
    
    // Process clusters for each player
    stonesByPlayer.forEach((playerStones, playerId) => {
      // Skip if player has fewer than 2 stones
      if (playerStones.length < 2) return;
      
      // Find clusters through connected components
      const visited = new Set<string>();
      const clusters: string[][] = [];
      
      for (const stone of playerStones) {
        if (visited.has(stone.id)) continue;
        
        // Start a new cluster
        const cluster: string[] = [];
        const queue: Stone[] = [stone];
        visited.add(stone.id);
        cluster.push(stone.id);
        
        // BFS to find all connected stones
        while (queue.length > 0) {
          const currentStone = queue.shift()!;
          
          // Check all other stones of this player for proximity
          for (const otherStone of playerStones) {
            if (visited.has(otherStone.id)) continue;
            
            const dx = currentStone.x - otherStone.x;
            const dy = currentStone.y - otherStone.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If stones are close enough to cluster
            if (distance < CLUSTER_THRESHOLD) {
              visited.add(otherStone.id);
              cluster.push(otherStone.id);
              queue.push(otherStone);
              console.log(`Stone ${currentStone.id} and ${otherStone.id} are clustering. Distance: ${distance}`);
            }
          }
        }
        
        // Only consider clusters of 2 or more stones
        if (cluster.length >= 2) {
          clusters.push(cluster);
        }
      }
      
      // Notify about clusters
      clusters.forEach(cluster => {
        console.log(`Found cluster for player ${playerId}:`, cluster);
        
        // Set clustering animation state
        setClusteringStones(cluster);
        
        // Notify clustering after a short delay to show the animation
        setTimeout(() => {
          onCluster(cluster);
          // Reset clustering animation state after notification
          setClusteringStones([]);
        }, 600);
      });
    });
    
  }, [visibleStones, gameOver, onCluster]);

  // Debug function to visualize clustering connections
  const updateDebugVisuals = useCallback(() => {
    if (gameOver) {
      setDebugLines([]);
      setMagneticPullStones([]);
      return;
    }
    
    const newLines: {from: Stone, to: Stone, distance: number}[] = [];
    const potentialMagneticStones: string[] = [];
    
    // Group stones by player
    const stonesByPlayer = new Map<number, Stone[]>();
    
    visibleStones.forEach(stone => {
      const playerId = stone.player.id;
      if (!stonesByPlayer.has(playerId)) {
        stonesByPlayer.set(playerId, []);
      }
      stonesByPlayer.get(playerId)?.push(stone);
    });
    
    // Check each pair of stones per player
    stonesByPlayer.forEach((playerStones) => {
      for (let i = 0; i < playerStones.length; i++) {
        for (let j = i + 1; j < playerStones.length; j++) {
          const stone1 = playerStones[i];
          const stone2 = playerStones[j];
          
          const dx = stone1.x - stone2.x;
          const dy = stone1.y - stone2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // If close enough to potentially cluster
          if (distance < CLUSTER_THRESHOLD * 1.5) {
            newLines.push({
              from: stone1,
              to: stone2,
              distance
            });
            
            // If they're very close, add magnetic pull effect
            if (distance < CLUSTER_THRESHOLD * 1.2) {
              if (!potentialMagneticStones.includes(stone1.id)) {
                potentialMagneticStones.push(stone1.id);
              }
              if (!potentialMagneticStones.includes(stone2.id)) {
                potentialMagneticStones.push(stone2.id);
              }
            }
          }
        }
      }
    });
    
    setDebugLines(newLines);
    setMagneticPullStones(potentialMagneticStones);
  }, [visibleStones, gameOver]);
  
  // Update debug visuals when stones change
  useEffect(() => {
    updateDebugVisuals();
  }, [visibleStones, updateDebugVisuals]);

  // Reduce clustering check frequency
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
  
  // Handle mouse up / touch end for stone placement
  const finalizeStonePlacement = useCallback((x: number, y: number) => {
    if (gameOver) return;
    
    // Check if the position is within the play area
    const centerX = playAreaRadius;
    const centerY = playAreaRadius;
    const distanceFromCenter = Math.sqrt(
      Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
    );
    
    // Convert to game coordinates
    const gameX = x - centerX;
    const gameY = y - centerY;
    
    // Only allow placement within play area minus stone radius
    if (distanceFromCenter <= playAreaRadius - STONE_RADIUS) {
      // Check collision with other stones
      let canPlace = true;
      
      for (const stone of visibleStones) {
        const dx = stone.x - gameX;
        const dy = stone.y - gameY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If too close to another stone, can't place here
        // Using strict threshold to ensure stones don't visually overlap
        if (distance < STONE_RADIUS * 2) {
          console.log(`Stone placement blocked by ${stone.id} at distance ${distance}`);
          canPlace = false;
          break;
        }
      }
      
      if (canPlace) {
        console.log(`Placing stone at game coordinates: (${gameX}, ${gameY})`);
        onStonePlace(gameX, gameY);
      } else {
        console.log('Cannot place stone: collision detected');
      }
    } else {
      console.log('Cannot place stone: outside play area');
    }
  }, [gameOver, playAreaRadius, visibleStones, onStonePlace]);
  
  // Handle mouse up event
  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || gameOver) return;
    
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    finalizeStonePlacement(x, y);
    
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
  
  // Handle touch end event
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || gameOver) return;
    
    // Get the last drag position if available
    if (!dragPosition) return;
    
    finalizeStonePlacement(dragPosition.x, dragPosition.y);
    
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
  
  // Render the stones with clustering and magnetic pull animations
  const renderStones = useMemo(() => {
    return visibleStones.map(stone => {
      const isClusteringStone = clusteringStones.includes(stone.id);
      const isMagneticPullStone = magneticPullStones.includes(stone.id) && !isClusteringStone;
      
      const stoneClassName = `
        stone
        player-${stone.player.id}
        ${isClusteringStone ? 'clustering' : ''}
        ${isMagneticPullStone ? 'magnetic-pull' : ''}
      `;
      
      return (
        <div
          key={stone.id}
          className={stoneClassName.trim()}
          style={{
            width: `${STONE_RADIUS * 2}px`,
            height: `${STONE_RADIUS * 2}px`,
            left: `${playAreaRadius + stone.x - STONE_RADIUS}px`,
            top: `${playAreaRadius + stone.y - STONE_RADIUS}px`,
          }}
        >
          <div className="stone-glow"></div>
        </div>
      );
    });
  }, [visibleStones, clusteringStones, magneticPullStones, playAreaRadius]);
  
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
      
      {/* Debug lines showing potential clusters */}
      {debugLines.map((line, index) => (
        <div 
          key={`debug-line-${index}`}
          className={`debug-line ${line.distance < CLUSTER_THRESHOLD ? 'will-cluster' : 'near-cluster'}`}
          style={{
            left: `${playAreaRadius + line.from.x}px`,
            top: `${playAreaRadius + line.from.y}px`,
            width: `${line.distance}px`,
            transform: `rotate(${Math.atan2(line.to.y - line.from.y, line.to.x - line.from.x)}rad)`,
            transformOrigin: '0 0'
          }}
        />
      ))}
      
      {/* Visible stones - now using memoized generated elements */}
      {renderStones}
      
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