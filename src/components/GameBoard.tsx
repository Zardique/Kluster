import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stone, Player } from '../types';
import './GameBoard.css';

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

  // Check if stones form a cluster
  const checkClustering = useCallback(() => {
    if (isAnimating || stones.length < 2) return;
    
    // Throttle cluster checking to avoid excessive checks
    const now = Date.now();
    if (now - lastClusterCheck < 300) return; // Check at most every 300ms
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
      setIsAnimating(true);
      
      // Use a single timeout instead of multiple animation frames
      setTimeout(() => {
        onClustered(clusteredStonesArray);
        setClusteredStones([]);
        setIsAnimating(false);
      }, ANIMATION_DURATION);
    }
  }, [stones, isAnimating, lastClusterCheck, onClustered]);

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
      const maxLines = 20;
      let lineCount = 0;
      
      for (let i = 0; i < stones.length && lineCount < maxLines; i++) {
        for (let j = i + 1; j < stones.length && lineCount < maxLines; j++) {
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
    });
    
    // Cleanup animation frame on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [stones, isAnimating, calculateMagneticStrength]);

  // Check for clustering after stones move
  useEffect(() => {
    if (!isAnimating) {
      checkClustering();
    }
  }, [stones, isAnimating, checkClustering]);

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
      }
    }
  }, [isMyTurn, isAnimating]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isAnimating || !draggingStone) return;
    
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      // Check if within play area
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
        setDraggingStone({ x, y });
      }
    }
  }, [isAnimating, draggingStone]);

  const handleMouseUp = useCallback(() => {
    if (isAnimating || !draggingStone) return;
    
    onStonePlaced(draggingStone.x, draggingStone.y);
    setDraggingStone(null);
  }, [isAnimating, draggingStone, onStonePlaced]);

  const handleMouseLeave = useCallback(() => {
    setDraggingStone(null);
  }, []);

  // Handle touch events for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow stone placement if it's the player's turn
    if (!isMyTurn) return;
    
    if (isAnimating) return;
    
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left - rect.width / 2;
      const y = touch.clientY - rect.top - rect.height / 2;
      
      // Check if within play area
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
        setDraggingStone({ x, y });
      }
    }
  }, [isMyTurn, isAnimating]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isAnimating || !draggingStone) return;
    
    // Prevent scrolling when dragging
    e.preventDefault();
    
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left - rect.width / 2;
      const y = touch.clientY - rect.top - rect.height / 2;
      
      // Check if within play area
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
        setDraggingStone({ x, y });
      }
    }
  }, [isAnimating, draggingStone]);

  const handleTouchEnd = useCallback(() => {
    if (isAnimating || !draggingStone) return;
    
    onStonePlaced(draggingStone.x, draggingStone.y);
    setDraggingStone(null);
  }, [isAnimating, draggingStone, onStonePlaced]);

  return (
    <div 
      className="game-board"
      ref={boardRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        width: PLAY_AREA_RADIUS * 2,
        height: PLAY_AREA_RADIUS * 2,
        borderColor: PLAYER_COLORS[currentPlayer.id], // Set border color based on current player
        '--player-color': PLAYER_COLORS[currentPlayer.id] // Set CSS variable for animations
      } as React.CSSProperties}
    >
      {/* Grid pattern */}
      <div className="board-grid"></div>
      
      {/* Concentric circles */}
      <div className="concentric-circle circle-1"></div>
      <div className="concentric-circle circle-2"></div>
      <div className="concentric-circle circle-3"></div>
      <div className="concentric-circle circle-4"></div>
      
      {/* Center marker */}
      <div className="board-center"></div>
      
      <div 
        className="magnetic-field" 
        style={{
          background: `radial-gradient(circle, ${PLAYER_COLORS[currentPlayer.id]}20 0%, ${PLAYER_COLORS[currentPlayer.id]}10 70%, ${PLAYER_COLORS[currentPlayer.id]}00 100%)`
        }}
      ></div>
      
      {/* Magnetic field lines - limit the number for better performance */}
      {magneticLines.map((line, index) => {
        const opacity = Math.min(line.strength / 100, 0.5);
        const width = Math.max(1, Math.min(line.strength / 20, 5));
        
        return (
          <div 
            key={`line-${index}`}
            className="magnetic-field-line"
            style={{
              left: PLAY_AREA_RADIUS,
              top: PLAY_AREA_RADIUS,
              width: Math.sqrt(Math.pow(line.x2 - line.x1, 2) + Math.pow(line.y2 - line.y1, 2)),
              height: width,
              background: `${PLAYER_COLORS[currentPlayer.id]}${Math.round(opacity * 100)}`,
              transform: `translate(${line.x1}px, ${line.y1}px) rotate(${Math.atan2(line.y2 - line.y1, line.x2 - line.x1)}rad)`,
              transformOrigin: '0 0'
            }}
          />
        );
      })}
      
      {/* Placed stones */}
      {stones.map((stone, index) => {
        const isCluster = clusteredStones.includes(stone);
        const isNearCluster = nearClusterStones.includes(stone);
        
        return (
          <div
            key={`stone-${stone.id}`}
            className={`stone ${stone.onEdge ? 'edge' : 'flat'} ${isCluster ? 'clustered' : ''} ${isNearCluster ? 'near-cluster' : ''}`}
            style={{
              width: STONE_RADIUS * 2,
              height: STONE_RADIUS * 2,
              left: PLAY_AREA_RADIUS + stone.x - STONE_RADIUS,
              top: PLAY_AREA_RADIUS + stone.y - STONE_RADIUS,
              backgroundColor: stone.player.id === 0 ? PLAYER_COLORS[0] : PLAYER_COLORS[1]
            }}
          >
          </div>
        );
      })}
      
      {/* Dragging stone preview */}
      {draggingStone && (
        <div
          className={`stone dragging ${placementMode}`}
          style={{
            width: STONE_RADIUS * 2,
            height: STONE_RADIUS * 2,
            left: PLAY_AREA_RADIUS + draggingStone.x - STONE_RADIUS,
            top: PLAY_AREA_RADIUS + draggingStone.y - STONE_RADIUS,
            backgroundColor: PLAYER_COLORS[currentPlayer.id]
          }}
        >
        </div>
      )}
    </div>
  );
};

export default React.memo(GameBoard); 