import React, { useRef, useState, useEffect } from 'react';
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
const CLUSTER_THRESHOLD = 100; // Decreased from 150 to make clustering less aggressive
const ANIMATION_DURATION = 800; // ms

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

  // Calculate magnetic strength between two stones
  const calculateMagneticStrength = (stone1: Stone, stone2: Stone) => {
    const dx = stone1.x - stone2.x;
    const dy = stone1.y - stone2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > MAGNETIC_FORCE_DISTANCE) return 0;
    
    // More gradual falloff for more natural magnetic field
    const normalizedDistance = 1 - (distance / MAGNETIC_FORCE_DISTANCE);
    // Using a less steep curve for more gradual effect
    let strength = Math.pow(normalizedDistance, 1.5) * MAGNETIC_FORCE_MULTIPLIER;
    
    return strength;
  };

  // Check if stones form a cluster
  const checkClustering = () => {
    if (isAnimating || stones.length < 2) return;
    
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
          
          // Check for near-clustering stones (within 30% of threshold)
          if (distance < CLUSTER_THRESHOLD * 1.3 && distance >= CLUSTER_THRESHOLD) {
            nearClusterIndices.add(i);
            nearClusterIndices.add(j);
          }
          
          if (distance < CLUSTER_THRESHOLD) {
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
      
      setClusteredStones(clusteredStonesArray);
      setIsAnimating(true);
      
      setTimeout(() => {
        onClustered(clusteredStonesArray);
        setClusteredStones([]);
        setIsAnimating(false);
      }, ANIMATION_DURATION);
    }
  };

  // Update magnetic field lines
  useEffect(() => {
    if (isAnimating) return;
    
    const newLines: Array<{ x1: number; y1: number; x2: number; y2: number; strength: number }> = [];
    
    for (let i = 0; i < stones.length; i++) {
      for (let j = i + 1; j < stones.length; j++) {
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
        }
      }
    }
    
    setMagneticLines(newLines);
  }, [stones, isAnimating]);

  // Check for clustering after stones move
  useEffect(() => {
    if (!isAnimating) {
      checkClustering();
    }
  }, [stones, isAnimating]);

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
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
  };

  const handleMouseMove = (e: React.MouseEvent) => {
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
  };

  const handleMouseUp = () => {
    if (isAnimating || !draggingStone) return;
    
    onStonePlaced(draggingStone.x, draggingStone.y);
    setDraggingStone(null);
  };

  const handleMouseLeave = () => {
    setDraggingStone(null);
  };

  return (
    <div 
      className="game-board"
      ref={boardRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
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
      
      {/* Magnetic field lines */}
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
            key={`stone-${index}`}
            className={`stone flat ${isCluster ? 'clustered' : ''} ${isNearCluster ? 'near-cluster' : ''}`}
            style={{
              width: STONE_RADIUS * 2,
              height: STONE_RADIUS * 2,
              left: PLAY_AREA_RADIUS + stone.x - STONE_RADIUS,
              top: PLAY_AREA_RADIUS + stone.y - STONE_RADIUS
            }}
          >
          </div>
        );
      })}
      
      {/* Dragging stone preview */}
      {draggingStone && (
        <div
          className="stone dragging flat"
          style={{
            width: STONE_RADIUS * 2,
            height: STONE_RADIUS * 2,
            left: PLAY_AREA_RADIUS + draggingStone.x - STONE_RADIUS,
            top: PLAY_AREA_RADIUS + draggingStone.y - STONE_RADIUS
          }}
        >
        </div>
      )}
    </div>
  );
};

export default GameBoard; 