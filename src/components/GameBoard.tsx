import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stone, Player } from '../types';
import './GameBoard.css';

// Load sound effects
const SOUNDS = {
  placeStone: new Audio('/sounds/place-stone.mp3'),
  clusterStones: new Audio('/sounds/cluster.mp3'),
  gameOver: new Audio('/sounds/game-over.mp3'),
  magnetic: new Audio('/sounds/magnetic-field.mp3')
};

// Preload sounds
Object.values(SOUNDS).forEach(sound => {
  sound.load();
  sound.volume = 0.5; // Set default volume to 50%
});

interface GameBoardProps {
  stones: Stone[];
  currentPlayer: Player;
  onStonePlaced: (x: number, y: number) => void;
  onClustered: (clusteredStones: Stone[]) => void;
  placementMode: 'flat' | 'edge';
  isMyTurn?: boolean; // Optional prop to check if it's the current player's turn
}

// Constants for magnetic simulation
const STONE_RADIUS = 25;
const STONE_HEIGHT = 8;
const PLAY_AREA_RADIUS = 250;
const MAGNETIC_FORCE_DISTANCE = 180;
const MAGNETIC_FORCE_MULTIPLIER = 120;
const CLUSTER_THRESHOLD = 80; // Decreased to make clustering more reliable
const ANIMATION_DURATION = 600; // Reduced animation duration for better performance
const MAGNETIC_FIELD_LINES = 20; // Number of magnetic field lines to draw

// Player colors for the board border
const PLAYER_COLORS = ['var(--player1-color)', 'var(--player2-color)']; // Updated to use CSS variables

const GameBoard: React.FC<GameBoardProps> = ({
  stones,
  currentPlayer,
  onStonePlaced,
  onClustered,
  placementMode,
  isMyTurn = true // Default to true for single-player mode
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [draggingStone, setDraggingStone] = useState<{ x: number; y: number } | null>(null);
  const [magneticLines, setMagneticLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; strength: number }>>([]);
  const [clusteredStones, setClusteredStones] = useState<Stone[]>([]);
  const [nearClusterStones, setNearClusterStones] = useState<Stone[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lastClusterCheck, setLastClusterCheck] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const [showPlacementIndicator, setShowPlacementIndicator] = useState(false);
  const [indicatorPos, setIndicatorPos] = useState({ x: 0, y: 0 });
  const [animatingStones, setAnimatingStones] = useState<Stone[]>([]);
  const [draggingEnabled, setDraggingEnabled] = useState(true);
  const [magneticFieldVisible, setMagneticFieldVisible] = useState(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMagneticSoundPlaying = useRef<boolean>(false);
  const clusterAnimationRef = useRef<Stone[]>([]);

  // Calculate magnetic strength between two stones
  const calculateMagneticStrength = useCallback((stone1: Stone, stone2: Stone) => {
    const dx = stone1.x - stone2.x;
    const dy = stone1.y - stone2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > MAGNETIC_FORCE_DISTANCE) return 0;
    
    // More gradual falloff for more natural magnetic field
    const normalizedDistance = 1 - (distance / MAGNETIC_FORCE_DISTANCE);
    // Using a less steep curve for more gradual effect
    let strength = Math.pow(normalizedDistance, 1.5) * MAGNETIC_FORCE_MULTIPLIER;
    
    // Increase strength for stones on edge to make them more likely to cluster
    if (stone1.onEdge && stone2.onEdge) {
      strength *= 1.5;
    } else if (stone1.onEdge || stone2.onEdge) {
      strength *= 1.2;
    }
    
    return strength;
  }, []);

  // Animate clustered stones with sound effects
  const animateClusteredStones = useCallback((stonesToAnimate: Stone[]) => {
    if (stonesToAnimate.length === 0) return;
    
    // Play clustering sound
    SOUNDS.clusterStones.currentTime = 0;
    SOUNDS.clusterStones.play().catch(e => console.log("Error playing cluster sound:", e));
    
    // Store ref to track which stones are animating
    clusterAnimationRef.current = stonesToAnimate;
    
    // Mark stones as clustered for animation
    setAnimatingStones(stonesToAnimate);
    setIsAnimating(true);
    
    // Clean up animation after it completes
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    
    animationTimeoutRef.current = setTimeout(() => {
      // Only process if these stones are still being animated
      if (clusterAnimationRef.current === stonesToAnimate) {
        onClustered(stonesToAnimate);
        setAnimatingStones([]);
        setIsAnimating(false);
        clusterAnimationRef.current = [];
      }
    }, ANIMATION_DURATION);
    
    return stonesToAnimate;
  }, [onClustered]);

  // Check if stones form a cluster
  const checkClustering = useCallback(() => {
    if (isAnimating || stones.length < 2) return [];
    
    // Throttle cluster checking to avoid excessive checks
    const now = Date.now();
    if (now - lastClusterCheck < 300) return []; // Check at most every 300ms
    setLastClusterCheck(now);
    
    // Build a graph of connected stones
    const graph: Record<number, number[]> = {};
    const nearClusterIndices = new Set<number>();
    
    stones.forEach((stone, i) => {
      graph[i] = [];
      stones.forEach((otherStone, j) => {
        if (i !== j) {
          const dx = stone.x - otherStone.x;
          const dy = stone.y - otherStone.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Adjust threshold based on whether stones are on edge
          let adjustedThreshold = CLUSTER_THRESHOLD;
          if (stone.onEdge && otherStone.onEdge) {
            adjustedThreshold *= 1.2; // Increase threshold for edge-to-edge
          } else if (stone.onEdge || otherStone.onEdge) {
            adjustedThreshold *= 1.1; // Slightly increase for edge-to-flat
          }
          
          // Check for near-clustering stones (within 30% of threshold)
          if (distance < adjustedThreshold * 1.3 && distance >= adjustedThreshold) {
            nearClusterIndices.add(i);
            nearClusterIndices.add(j);
          }
          
          if (distance < adjustedThreshold) {
            graph[i].push(j);
          }
        }
      });
    });
    
    // Update near-cluster stones
    setNearClusterStones(
      Array.from(nearClusterIndices).map(index => stones[index])
    );
    
    // Find connected components (clusters)
    const visited = new Set<number>();
    const clusters: number[][] = [];
    
    const dfs = (node: number, cluster: number[]) => {
      visited.add(node);
      cluster.push(node);
      
      for (const neighbor of graph[node]) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, cluster);
        }
      }
    };
    
    for (let i = 0; i < stones.length; i++) {
      if (!visited.has(i)) {
        const cluster: number[] = [];
        dfs(i, cluster);
        if (cluster.length >= 2) {
          clusters.push(cluster);
        }
      }
    }
    
    // If clusters found, trigger animation and callback
    if (clusters.length > 0) {
      const clusteredStoneIndices = clusters.flat();
      const clusteredStonesArray = clusteredStoneIndices.map(index => stones[index]);
      
      console.log('Cluster detected:', clusteredStonesArray.map(s => s.id));
      
      setClusteredStones(clusteredStonesArray);
      animateClusteredStones(clusteredStonesArray);
      return clusteredStonesArray;
    }
    
    return [];
  }, [stones, isAnimating, lastClusterCheck, animateClusteredStones]);

  // Update magnetic field lines
  useEffect(() => {
    if (isAnimating) return;
    
    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Use requestAnimationFrame for better performance
    animationFrameRef.current = requestAnimationFrame(() => {
      const newLines: Array<{ x1: number; y1: number; x2: number; y2: number; strength: number }> = [];
      
      // Limit the number of lines to improve performance
      let lineCount = 0;
      
      // Play magnetic sound when there are potential lines
      if (stones.length >= 2 && !isMagneticSoundPlaying.current) {
        SOUNDS.magnetic.loop = true;
        SOUNDS.magnetic.volume = 0.2; // Lower volume for background sound
        SOUNDS.magnetic.play().catch(e => console.log("Error playing magnetic sound:", e));
        isMagneticSoundPlaying.current = true;
      }
      
      for (let i = 0; i < stones.length && lineCount < MAGNETIC_FIELD_LINES; i++) {
        for (let j = i + 1; j < stones.length && lineCount < MAGNETIC_FIELD_LINES; j++) {
          const stone1 = stones[i];
          const stone2 = stones[j];
          const strength = calculateMagneticStrength(stone1, stone2);
          
          if (strength > 0) {
            newLines.push({
              x1: stone1.x,
              y1: stone1.y,
              x2: stone2.x,
              y2: stone2.y,
              strength
            });
            lineCount++;
          }
        }
      }
      
      setMagneticLines(newLines);
      setMagneticFieldVisible(newLines.length > 0);
    });
    
    // Cleanup animation frame on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      // Stop magnetic sound
      if (isMagneticSoundPlaying.current) {
        SOUNDS.magnetic.pause();
        SOUNDS.magnetic.currentTime = 0;
        isMagneticSoundPlaying.current = false;
      }
    };
  }, [stones, isAnimating, calculateMagneticStrength]);

  // Check for clustering after stones move
  useEffect(() => {
    if (!isAnimating) {
      checkClustering();
    }
  }, [stones, isAnimating, checkClustering]);

  // Clean up sounds on component unmount
  useEffect(() => {
    return () => {
      Object.values(SOUNDS).forEach(sound => {
        sound.pause();
        sound.currentTime = 0;
      });
      
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Handle mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only allow stone placement if it's the player's turn
    if (!isMyTurn) return;
    
    if (isAnimating) return;
    
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      // Check if within play area
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
        setDraggingStone({ x, y });
        
        // Play stone placement sound
        SOUNDS.placeStone.currentTime = 0;
        SOUNDS.placeStone.play().catch(e => console.log("Error playing place sound:", e));
      }
    }
  }, [isMyTurn, isAnimating]);

  // Touch event handlers for mobile support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMyTurn || isAnimating) return;
    
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left - rect.width / 2;
      const y = touch.clientY - rect.top - rect.height / 2;
      
      // Check if within play area
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
        setDraggingStone({ x, y });
        setShowPlacementIndicator(true);
        setIndicatorPos({ x, y });
        
        // Prevent scrolling when interacting with the game board
        e.preventDefault();
      }
    }
  }, [isMyTurn, isAnimating]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingStone || !boardRef.current) return;
    
    const rect = boardRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left - rect.width / 2;
    const y = touch.clientY - rect.top - rect.height / 2;
    
    // Check if within play area
    const distanceFromCenter = Math.sqrt(x * x + y * y);
    if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
      setDraggingStone({ x, y });
      setIndicatorPos({ x, y });
    }
    
    // Prevent scrolling when dragging
    e.preventDefault();
  }, [draggingStone]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!draggingStone) return;
    
    onStonePlaced(draggingStone.x, draggingStone.y);
    setDraggingStone(null);
    setShowPlacementIndicator(false);
    
    // Play stone placement sound
    SOUNDS.placeStone.currentTime = 0;
    SOUNDS.placeStone.play().catch(e => console.log("Error playing place sound:", e));
    
    // Check for clustering after placing stone
    setTimeout(() => {
      checkClustering();
    }, 100);
  }, [draggingStone, onStonePlaced, checkClustering]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingStone || !boardRef.current) return;
    
    const rect = boardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    // Check if within play area
    const distanceFromCenter = Math.sqrt(x * x + y * y);
    if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
      setDraggingStone({ x, y });
    }
  }, [draggingStone]);

  const handleMouseUp = useCallback(() => {
    if (!draggingStone) return;
    
    onStonePlaced(draggingStone.x, draggingStone.y);
    setDraggingStone(null);
    
    // Check for clustering after placing stone
    setTimeout(() => {
      checkClustering();
    }, 100);
  }, [draggingStone, onStonePlaced, checkClustering]);

  // Calculate angle for clustering animation
  const getClusterAngle = useCallback((stone: Stone): number => {
    if (!clusteredStones.length) return 0;
    
    // Find center of mass of the cluster
    const centerX = clusteredStones.reduce((sum, s) => sum + s.x, 0) / clusteredStones.length;
    const centerY = clusteredStones.reduce((sum, s) => sum + s.y, 0) / clusteredStones.length;
    
    // Calculate angle from stone to center
    return Math.atan2(centerY - stone.y, centerX - stone.x) * (180 / Math.PI);
  }, [clusteredStones]);

  return (
    <div 
      ref={boardRef}
      className="game-board"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ 
        cursor: isMyTurn && !isAnimating ? 'pointer' : 'default',
        borderColor: PLAYER_COLORS[currentPlayer.id - 1]
      }}
    >
      {/* Play area circle */}
      <div 
        className="play-area"
        style={{
          width: PLAY_AREA_RADIUS * 2 + 'px',
          height: PLAY_AREA_RADIUS * 2 + 'px'
        }}
      />
      
      {/* Magnetic field visualization */}
      {magneticFieldVisible && (
        <svg className="magnetic-field" viewBox="-300 -300 600 600">
          {magneticLines.map((line, index) => {
            const strength = Math.min(line.strength / 50, 1);
            return (
              <line
                key={index}
                className="magnetic-indicator"
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={`rgba(255, 255, 255, ${strength * 0.6})`}
                strokeWidth={strength * 3}
              />
            );
          })}
        </svg>
      )}
      
      {/* Stones */}
      {stones.map(stone => {
        const isClusteredStone = clusteredStones.some(s => s.id === stone.id);
        const isNearCluster = nearClusterStones.some(s => s.id === stone.id);
        const stoneClass = `stone player-${stone.player.id} ${
          stone.onEdge ? 'on-edge' : ''
        } ${isClusteredStone ? 'clustered' : ''} ${
          isNearCluster ? 'pre-cluster' : ''
        }`;
        
        return (
          <div
            key={stone.id}
            className={stoneClass}
            style={{
              left: stone.x + 'px',
              top: stone.y + 'px',
              width: STONE_RADIUS * 2 + 'px',
              height: STONE_RADIUS * 2 + 'px',
              ...(isClusteredStone 
                ? { '--cluster-angle': `${getClusterAngle(stone)}deg` } as React.CSSProperties
                : {})
            }}
          />
        );
      })}
      
      {/* Dragging stone preview */}
      {draggingStone && (
        <div
          className={`stone player-${currentPlayer.id} dragging ${placementMode === 'edge' ? 'on-edge' : ''}`}
          style={{
            left: draggingStone.x + 'px',
            top: draggingStone.y + 'px',
            width: STONE_RADIUS * 2 + 'px',
            height: STONE_RADIUS * 2 + 'px'
          }}
        />
      )}
      
      {/* Touch placement indicator */}
      {showPlacementIndicator && (
        <div 
          className="placement-indicator" 
          style={{
            left: indicatorPos.x + 'px',
            top: indicatorPos.y + 'px',
            borderColor: PLAYER_COLORS[currentPlayer.id - 1]
          }}
        />
      )}
    </div>
  );
};

export default React.memo(GameBoard); 