import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stone, Player } from '../types';
import './GameBoard.css';

// Constants for magnetic simulation visualization
const STONE_RADIUS = 25;
const PLAY_AREA_RADIUS = 250;
const MAGNETIC_FIELD_RADIUS = STONE_RADIUS * 2.5; // Magnetic field extends 2.5x beyond stone's visible radius
const MAGNETIC_FIELD_VISUAL_RADIUS = MAGNETIC_FIELD_RADIUS * 0.9; // Slightly smaller visual representation for clarity

// Player colors for the board border
const PLAYER_COLORS = ['var(--player1-color)', 'var(--player2-color)']; // Using CSS variables

// Attraction physics constants
const ATTRACTION_STRENGTH = 1.5; // How strongly stones are attracted (should match server)
const ATTRACTION_THRESHOLD = MAGNETIC_FIELD_RADIUS * 2 * 0.7; // When stones start to feel attraction
const PHYSICAL_CONTACT_THRESHOLD = STONE_RADIUS * 2 * 0.9; // When stones are considered touching (should match server)

interface GameBoardProps {
  stones: Stone[];
  currentPlayer: Player;
  onStonePlaced: (x: number, y: number) => void;
  onClustered: (clusteredStones: Stone[]) => void;
  placementMode: 'flat' | 'edge';
  isMyTurn?: boolean;
  animatingStones?: Stone[];
  isMobile?: boolean;
}

// Helper type for stone with simulated position
interface SimulatedStone extends Stone {
  simulatedX?: number;
  simulatedY?: number;
  isSimulating?: boolean;
}

const GameBoard: React.FC<GameBoardProps> = ({
  stones,
  currentPlayer,
  onStonePlaced,
  onClustered,
  placementMode,
  isMyTurn = true,
  animatingStones = [],
  isMobile = false
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [draggingStone, setDraggingStone] = useState<{ x: number; y: number } | null>(null);
  const [magneticFields, setMagneticFields] = useState<Array<{ x: number; y: number; radius: number; color: string }>>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [attractingStones, setAttractingStones] = useState<number[]>([]);
  const [simulatedStones, setSimulatedStones] = useState<SimulatedStone[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Calculate and update magnetic fields for visualization
  useEffect(() => {
    // Skip if we're in the middle of animation
    if (isAnimating) return;
    
    // For each stone, create a magnetic field visualization
    const fields = stones.map(stone => ({
      x: stone.x,
      y: stone.y,
      radius: MAGNETIC_FIELD_VISUAL_RADIUS,
      color: PLAYER_COLORS[stone.playerId] || PLAYER_COLORS[0]
    }));
    
    setMagneticFields(fields);
  }, [stones, isAnimating]);
  
  // Check for magnetic attractions when dragging
  useEffect(() => {
    if (!draggingStone || isAnimating) {
      // Clear attraction state when not dragging
      if (attractingStones.length > 0) {
        setAttractingStones([]);
      }
      return;
    }
    
    // Find stones that would be attracted to the dragging stone
    const newAttractingStones = stones.reduce<number[]>((acc, stone, index) => {
      const dx = stone.x - draggingStone.x;
      const dy = stone.y - draggingStone.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Check if within magnetic field range but not yet touching
      if (distance < ATTRACTION_THRESHOLD && distance > STONE_RADIUS * 2) {
        acc.push(index);
      }
      
      return acc;
    }, []);
    
    setAttractingStones(newAttractingStones);
  }, [draggingStone, stones, isAnimating]);
  
  // Handle animation of clustered stones
  useEffect(() => {
    if (animatingStones && animatingStones.length > 0) {
      setIsAnimating(true);
      
      // Add extra magnetic field visualizations for animating stones
      const animatingFields = animatingStones.map(stone => ({
        x: stone.x,
        y: stone.y,
        radius: MAGNETIC_FIELD_VISUAL_RADIUS * 1.5, // Make the field more visible during animation
        color: PLAYER_COLORS[stone.playerId] || PLAYER_COLORS[0]
      }));
      
      setMagneticFields(prev => [...prev, ...animatingFields]);
      
      // After animation completes, reset
      setTimeout(() => {
        setIsAnimating(false);
        
        // After animation, we'll just show the remaining stones' fields
        const remainingFields = stones
          .filter(stone => !animatingStones.some(
            as => as.x === stone.x && as.y === stone.y && as.playerId === stone.playerId
          ))
          .map(stone => ({
            x: stone.x,
            y: stone.y,
            radius: MAGNETIC_FIELD_VISUAL_RADIUS,
            color: PLAYER_COLORS[stone.playerId] || PLAYER_COLORS[0]
          }));
        
        setMagneticFields(remainingFields);
        setAttractingStones([]);
      }, 800); // Animation duration
    }
  }, [animatingStones, stones]);

  // Simulate the magnetic attraction between stones
  const simulateMagneticAttraction = useCallback(() => {
    if (!simulatedStones.length || isAnimating) return;

    let hasMovement = false;
    let hasClustering = false;
    
    // Deep copy of stones for simulation
    const updatedStones = simulatedStones.map(stone => ({
      ...stone,
      simulatedX: stone.simulatedX !== undefined ? stone.simulatedX : stone.x,
      simulatedY: stone.simulatedY !== undefined ? stone.simulatedY : stone.y,
      isSimulating: true
    }));
    
    // Calculate forces and update positions
    for (let i = 0; i < updatedStones.length; i++) {
      let forceX = 0;
      let forceY = 0;
      
      for (let j = 0; j < updatedStones.length; j++) {
        if (i === j) continue;
        
        const dx = updatedStones[j].simulatedX! - updatedStones[i].simulatedX!;
        const dy = updatedStones[j].simulatedY! - updatedStones[i].simulatedY!;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Check if in attraction range but not yet physically touching
        if (distance < ATTRACTION_THRESHOLD && distance > PHYSICAL_CONTACT_THRESHOLD) {
          // Calculate magnetic force (simplified model)
          const force = ATTRACTION_STRENGTH * (ATTRACTION_THRESHOLD - distance) / ATTRACTION_THRESHOLD;
          
          // Calculate force components
          forceX += dx / distance * force;
          forceY += dy / distance * force;
          
          hasMovement = true;
        } else if (distance <= PHYSICAL_CONTACT_THRESHOLD) {
          // Stones have clustered!
          hasClustering = true;
        }
      }
      
      // Apply forces to update position
      if (forceX !== 0 || forceY !== 0) {
        updatedStones[i].simulatedX! += forceX * 0.5; // Dampen movement for smoother animation
        updatedStones[i].simulatedY! += forceY * 0.5;
      }
    }
    
    // Update state with new positions
    setSimulatedStones(updatedStones);
    
    // If stones have clustered, notify parent
    if (hasClustering) {
      // Find which stones have clustered
      const clusteredStones = updatedStones.reduce<Stone[]>((acc, stone, i) => {
        for (let j = 0; j < updatedStones.length; j++) {
          if (i !== j) {
            const dx = updatedStones[j].simulatedX! - stone.simulatedX!;
            const dy = updatedStones[j].simulatedY! - stone.simulatedY!;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= PHYSICAL_CONTACT_THRESHOLD) {
              // Add both stones to the cluster if not already included
              if (!acc.some(s => s.x === stone.x && s.y === stone.y)) {
                acc.push(stone);
              }
              if (!acc.some(s => s.x === updatedStones[j].x && s.y === updatedStones[j].y)) {
                acc.push(updatedStones[j]);
              }
            }
          }
        }
        return acc;
      }, []);
      
      if (clusteredStones.length >= 2) {
        // Notify parent of cluster
        onClustered(clusteredStones);
        
        // Stop simulation
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        setSimulatedStones([]);
        return;
      }
    }
    
    // Continue animation if there's movement
    if (hasMovement) {
      animationFrameRef.current = requestAnimationFrame(simulateMagneticAttraction);
    } else {
      // Apply final positions to server
      updatedStones.forEach(stone => {
        if (stone.simulatedX !== stone.x || stone.simulatedY !== stone.y) {
          // Only update stones that actually moved
          onStonePlaced(stone.simulatedX!, stone.simulatedY!);
        }
      });
      
      // Stop simulation
      setSimulatedStones([]);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [simulatedStones, isAnimating, onClustered, onStonePlaced]);
  
  // Start simulation after stone placement
  useEffect(() => {
    if (simulatedStones.length > 0 && !isAnimating) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(simulateMagneticAttraction);
    }
    
    // Cleanup animation frame on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [simulatedStones, isAnimating, simulateMagneticAttraction]);

  // Handle mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only allow stone placement if it's the player's turn
    if (!isMyTurn || isAnimating) return;
    
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      // Check if within play area
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
        // Check if stone would overlap with existing stones
        const wouldOverlap = stones.some(stone => {
          const dx = stone.x - x;
          const dy = stone.y - y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          return distance < STONE_RADIUS * 2 * 0.9; // 10% overlap allowed
        });
        
        if (!wouldOverlap) {
          setDraggingStone({ x, y });
        }
      }
    }
  }, [isMyTurn, isAnimating, stones]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isAnimating || !draggingStone || !isMyTurn) return;
    
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
  }, [draggingStone, isAnimating, isMyTurn]);

  const handleMouseUp = useCallback(() => {
    if (isAnimating || !draggingStone || !isMyTurn) return;
    
    // Check if the dragging stone would cause attraction
    if (stones.length > 0) {
      // If there are attracting stones, start a simulation
      if (attractingStones.length > 0) {
        const initialStones: SimulatedStone[] = [
          // Add the dragging stone
          { x: draggingStone.x, y: draggingStone.y, playerId: currentPlayer.id },
          // Add all existing stones
          ...stones.map(stone => ({ ...stone }))
        ];
        
        setSimulatedStones(initialStones);
        // The simulation will run in the useEffect
      } else {
        // No attraction, just place the stone normally
        onStonePlaced(draggingStone.x, draggingStone.y);
      }
    } else {
      // No other stones on the board yet, just place it
      onStonePlaced(draggingStone.x, draggingStone.y);
    }
    
    setDraggingStone(null);
  }, [draggingStone, isAnimating, isMyTurn, onStonePlaced, stones, attractingStones, currentPlayer.id]);

  const handleMouseLeave = useCallback(() => {
    setDraggingStone(null);
  }, []);

  // Handle touch events for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow stone placement if it's the player's turn
    if (!isMyTurn || isAnimating) return;
    
    if (boardRef.current && e.touches[0]) {
      const rect = boardRef.current.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left - rect.width / 2;
      const y = e.touches[0].clientY - rect.top - rect.height / 2;
      
      // Check if within play area
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
        setDraggingStone({ x, y });
      }
    }
  }, [isAnimating, isMyTurn]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isAnimating || !draggingStone || !isMyTurn) return;
    
    if (boardRef.current && e.touches[0]) {
      const rect = boardRef.current.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left - rect.width / 2;
      const y = e.touches[0].clientY - rect.top - rect.height / 2;
      
      // Check if within play area
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
        setDraggingStone({ x, y });
      }
    }
  }, [draggingStone, isAnimating, isMyTurn]);

  const handleTouchEnd = useCallback(() => {
    if (isAnimating || !draggingStone || !isMyTurn) return;
    
    onStonePlaced(draggingStone.x, draggingStone.y);
    setDraggingStone(null);
  }, [draggingStone, isAnimating, isMyTurn, onStonePlaced]);

  // Scale the board based on mobile
  const actualPlayAreaRadius = isMobile ? PLAY_AREA_RADIUS * 0.8 : PLAY_AREA_RADIUS;

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
        width: actualPlayAreaRadius * 2,
        height: actualPlayAreaRadius * 2,
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
      
      {/* Magnetic field visualizations */}
      {magneticFields.map((field, index) => (
        <div
          key={`field-${index}`}
          className="magnetic-field-visualization"
          style={{
            width: field.radius * 2,
            height: field.radius * 2,
            left: actualPlayAreaRadius + field.x - field.radius,
            top: actualPlayAreaRadius + field.y - field.radius,
            background: `radial-gradient(circle, ${field.color}50 0%, ${field.color}30 30%, ${field.color}15 60%, ${field.color}05 90%, ${field.color}00 100%)`,
            opacity: isAnimating ? 0.8 : 0.4, // More visible during animation
            pointerEvents: 'none', // Ensure it doesn't interfere with mouse events
            transform: attractingStones.includes(index) ? 'scale(1.1)' : 'scale(1)' // Highlight fields under attraction
          }}
        />
      ))}
      
      {/* Placed stones - show simulated positions during attraction */}
      {(simulatedStones.length ? simulatedStones : stones).map((stone, index) => {
        const isCluster = animatingStones.some(
          as => as.x === stone.x && as.y === stone.y && as.playerId === stone.playerId
        );
        const isAttracting = attractingStones.includes(index) || stone.isSimulating;
        
        // Use simulated position if available
        const stoneX = stone.simulatedX !== undefined ? stone.simulatedX : stone.x;
        const stoneY = stone.simulatedY !== undefined ? stone.simulatedY : stone.y;
        
        return (
          <div
            key={`stone-${index}`}
            className={`stone ${placementMode} ${isCluster ? 'clustered' : ''} ${isAttracting ? 'attracting' : ''} player-${stone.playerId}`}
            style={{
              width: STONE_RADIUS * 2,
              height: STONE_RADIUS * 2,
              left: actualPlayAreaRadius + stoneX - STONE_RADIUS,
              top: actualPlayAreaRadius + stoneY - STONE_RADIUS,
              transition: stone.isSimulating ? 'left 0.1s ease, top 0.1s ease' : '' // Smoother animation for simulating stones
            }}
          >
          </div>
        );
      })}
      
      {/* Dragging stone preview */}
      {draggingStone && (
        <>
          {/* Magnetic field preview */}
          <div 
            className="magnetic-field-preview"
            style={{
              width: MAGNETIC_FIELD_RADIUS * 2,
              height: MAGNETIC_FIELD_RADIUS * 2,
              left: actualPlayAreaRadius + draggingStone.x - MAGNETIC_FIELD_RADIUS,
              top: actualPlayAreaRadius + draggingStone.y - MAGNETIC_FIELD_RADIUS,
              background: `radial-gradient(circle, 
                ${PLAYER_COLORS[currentPlayer.id]}60 0%, 
                ${PLAYER_COLORS[currentPlayer.id]}40 25%, 
                ${PLAYER_COLORS[currentPlayer.id]}20 50%, 
                ${PLAYER_COLORS[currentPlayer.id]}10 75%, 
                ${PLAYER_COLORS[currentPlayer.id]}00 100%
              )`,
              animation: 'pulseMagneticField 4s infinite alternate'
            }}
          />
          
          {/* Dragging stone visual */}
          <div
            className={`stone dragging ${placementMode} player-${currentPlayer.id}`}
            style={{
              width: STONE_RADIUS * 2,
              height: STONE_RADIUS * 2,
              left: actualPlayAreaRadius + draggingStone.x - STONE_RADIUS,
              top: actualPlayAreaRadius + draggingStone.y - STONE_RADIUS
            }}
          />
        </>
      )}
    </div>
  );
};

export default GameBoard; 