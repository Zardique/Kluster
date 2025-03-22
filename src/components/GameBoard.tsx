import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stone, Player } from '../types';
import { standardizeStone } from '../utils/stoneUtils';
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
    // Basic magnetic fields from existing stones
    const fields = stones.filter(stone => !stone.clustered).map(stone => ({
      x: stone.x,
      y: stone.y,
      radius: MAGNETIC_FIELD_VISUAL_RADIUS,
      color: PLAYER_COLORS[stone.playerId] || PLAYER_COLORS[0]
    }));
    
    setMagneticFields(fields);
  }, [stones, isAnimating]);
  
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
      
      // Clear the animation after a delay
      setTimeout(() => {
        setIsAnimating(false);
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
      // Find the dragged stone and the stones it clustered with
      const draggedStoneIndex = updatedStones.findIndex(stone => stone.id === -1);
      if (draggedStoneIndex !== -1) {
        const draggedStone = updatedStones[draggedStoneIndex];
        
        // Find stones that clustered with the dragged stone
        const clusteredStones = updatedStones.filter(stone => {
          if (stone.id === -1) return false;
          
          const dx = stone.simulatedX! - draggedStone.simulatedX!;
          const dy = stone.simulatedY! - draggedStone.simulatedY!;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          return distance <= PHYSICAL_CONTACT_THRESHOLD;
        });
        
        // Place the stone at its final position
        onStonePlaced(draggedStone.simulatedX!, draggedStone.simulatedY!);
        
        // Notify about clustered stones
        if (clusteredStones.length > 0) {
          onClustered(clusteredStones);
        }
      }
      
      // Reset simulation
      setSimulatedStones([]);
      setDraggingStone(null);
    } else if (!hasMovement) {
      // If no movement and no clustering, simulation is complete
      setSimulatedStones([]);
    }
  }, [simulatedStones, isAnimating, onClustered, onStonePlaced]);

  // Run the attraction simulation
  useEffect(() => {
    if (simulatedStones.length > 0 && !isAnimating) {
      // Run animation frame loop
      const animate = () => {
        simulateMagneticAttraction();
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      
      animationFrameRef.current = requestAnimationFrame(animate);
      
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [simulatedStones, isAnimating, simulateMagneticAttraction]);

  // Handle mouse down to start stone placement
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isMyTurn || isAnimating) return;
    
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    // Check if within play area
    const distanceFromCenter = Math.sqrt(x * x + y * y);
    if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
      setDraggingStone({ x, y });
    }
  }, [isMyTurn, isAnimating]);

  // Handle mouse move to drag stone
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isMyTurn || isAnimating || !draggingStone) return;
    
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    // Check if within play area
    const distanceFromCenter = Math.sqrt(x * x + y * y);
    if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
      setDraggingStone({ x, y });
      
      // Check if there are any existing stones nearby
      const newAttractingStones = stones.reduce<number[]>((acc, stone, index) => {
        const dx = stone.x - x;
        const dy = stone.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if within magnetic field range but not yet touching
        if (distance < ATTRACTION_THRESHOLD && distance > STONE_RADIUS * 2) {
          acc.push(stone.id);
        }
        
        return acc;
      }, []);
      
      setAttractingStones(newAttractingStones);
      
      // If attracting stones, start simulation
      if (newAttractingStones.length > 0 && simulatedStones.length === 0) {
        // Create a standardized stone object for the dragging stone
        const draggingStoneObj = standardizeStone({
          x,
          y,
          playerId: currentPlayer.id,
          id: -1 // Temporary ID for the dragging stone
        });
        
        const initialStones: SimulatedStone[] = [
          // Add the dragging stone
          { 
            ...draggingStoneObj, 
            // Add simulation properties
            simulatedX: x,
            simulatedY: y,
            isSimulating: true
          },
          // Add all existing stones with simulation properties
          ...stones.map(stone => ({ 
            ...stone,
            simulatedX: stone.x,
            simulatedY: stone.y,
            isSimulating: true
          }))
        ];
        
        setSimulatedStones(initialStones);
      }
    }
  }, [isMyTurn, isAnimating, draggingStone, currentPlayer.id, stones, simulatedStones.length]);

  // Handle mouse up to place stone
  const handleMouseUp = useCallback(() => {
    if (!isMyTurn || isAnimating || !draggingStone) return;
    
    // If not in simulation mode, simply place the stone
    if (simulatedStones.length === 0) {
      onStonePlaced(draggingStone.x, draggingStone.y);
      setDraggingStone(null);
    }
    // Otherwise, let the simulation finish with clustering or placement
  }, [draggingStone, isAnimating, isMyTurn, onStonePlaced, simulatedStones.length]);

  // Scale the board based on mobile
  const actualPlayAreaRadius = isMobile ? PLAY_AREA_RADIUS * 0.8 : PLAY_AREA_RADIUS;

  return (
    <div 
      ref={boardRef}
      className="game-board"
      style={{
        width: `${actualPlayAreaRadius * 2}px`,
        height: `${actualPlayAreaRadius * 2}px`,
        borderColor: PLAYER_COLORS[currentPlayer.id]
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Render magnetic field visualizations */}
      {magneticFields.map((field, index) => (
        <div
          key={`field-${index}`}
          className="magnetic-field-visualization"
          style={{
            width: `${field.radius * 2}px`,
            height: `${field.radius * 2}px`,
            left: `${actualPlayAreaRadius + field.x - field.radius}px`,
            top: `${actualPlayAreaRadius + field.y - field.radius}px`,
            background: `radial-gradient(circle, ${field.color}33 0%, ${field.color}00 100%)`
          }}
        />
      ))}
      
      {/* Render stones (either simulated or actual) */}
      {(simulatedStones.length ? simulatedStones : stones).map((stone, index) => {
        if (stone.clustered) return null;
        
        const stoneX = stone.simulatedX !== undefined ? stone.simulatedX : stone.x;
        const stoneY = stone.simulatedY !== undefined ? stone.simulatedY : stone.y;
        
        const isAttracting = attractingStones.includes(stone.id);
        const isAnimatingStone = animatingStones.some(s => s.id === stone.id);
        
        return (
          <div
            key={`stone-${stone.id !== undefined ? stone.id : index}`}
            className={`stone player-${stone.playerId} ${isAttracting ? 'attracting' : ''} ${isAnimatingStone ? 'clustered' : ''} ${placementMode}`}
            style={{
              width: `${STONE_RADIUS * 2}px`,
              height: `${STONE_RADIUS * 2}px`,
              left: `${actualPlayAreaRadius + stoneX - STONE_RADIUS}px`,
              top: `${actualPlayAreaRadius + stoneY - STONE_RADIUS}px`
            }}
          >
            <div className="stone-inner"></div>
          </div>
        );
      })}
      
      {/* Render ghost stone while dragging */}
      {draggingStone && isMyTurn && !isAnimating && (
        <div
          className={`stone ghost-stone player-${currentPlayer.id} ${placementMode}`}
          style={{
            width: `${STONE_RADIUS * 2}px`,
            height: `${STONE_RADIUS * 2}px`,
            left: `${actualPlayAreaRadius + draggingStone.x - STONE_RADIUS}px`,
            top: `${actualPlayAreaRadius + draggingStone.y - STONE_RADIUS}px`
          }}
        >
          <div className="stone-inner"></div>
        </div>
      )}
    </div>
  );
};

export default GameBoard; 