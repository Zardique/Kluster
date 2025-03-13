import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Stone } from '../types';
import './GameBoard3D.css';

interface GameBoardProps {
  stones: Stone[];
  playAreaRadius: number;
  onStonePlace: (x: number, y: number) => void;
  onCluster: (clusteredStoneIds: string[]) => void;
  updateStonePositions: (updates: { id: string; x: number; y: number }[]) => void;
  currentPlayer: number;
  gameOver: boolean;
  placementMode: 'flat' | 'edge';
}

// Constants for magnetic simulation
const STONE_RADIUS = 25;
const STONE_HEIGHT = 8; // Height of the stone when placed flat
const MAGNETIC_FORCE_DISTANCE = 150; // Distance at which magnetic force starts to affect stones
const CLUSTER_THRESHOLD = STONE_RADIUS * 1.5; // Distance threshold for stones to be considered clustered
const MAGNETIC_FORCE_MULTIPLIER = 100; // Base magnetic force multiplier
const EDGE_MAGNETIC_MULTIPLIER = 1.8; // Additional multiplier when stones are on edge
const CLUSTER_ANIMATION_DURATION = 800; // Duration of cluster animation in ms

// 3D-specific constants
const BOARD_THICKNESS = 10;
const STONE_SEGMENTS = 32; // Higher number = smoother stones
const BOARD_SEGMENTS = 64; // Higher number = smoother board edge

// Main GameBoard3D component
const GameBoard3D: React.FC<GameBoardProps> = ({
  stones,
  playAreaRadius,
  onStonePlace,
  onCluster,
  updateStonePositions,
  currentPlayer,
  gameOver,
  placementMode
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [animatingStones, setAnimatingStones] = useState<string[]>([]);
  const [stonePositions, setStonePositions] = useState<Map<string, { x: number; y: number; vx: number; vy: number; magneticStrength: number }>>(new Map());
  const animationRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  
  // Filter out clustered stones
  const visibleStones = stones.filter(stone => !stone.clustered);
  
  // Initialize stone positions with random magnetic strengths
  useEffect(() => {
    const newPositions = new Map(stonePositions);
    
    visibleStones.forEach(stone => {
      if (!newPositions.has(stone.id)) {
        // Assign a random magnetic strength to each stone (0.8 to 1.2 range)
        // Stones on edge have stronger magnetic properties
        const baseStrength = 0.8 + Math.random() * 0.4;
        const magneticStrength = stone.onEdge ? baseStrength * 1.5 : baseStrength;
        
        newPositions.set(stone.id, { 
          x: stone.x, 
          y: stone.y, 
          vx: 0, 
          vy: 0,
          magneticStrength
        });
      }
    });
    
    // Remove positions for stones that no longer exist
    Array.from(newPositions.keys()).forEach(id => {
      if (!visibleStones.some(stone => stone.id === id)) {
        newPositions.delete(id);
      }
    });
    
    setStonePositions(newPositions);
  }, [visibleStones]);
  
  // Simulate magnetic interactions
  useEffect(() => {
    if (visibleStones.length < 2 || gameOver) return;
    
    const animate = (timestamp: number) => {
      // Calculate time delta for smooth animation regardless of frame rate
      const deltaTime = lastUpdateTimeRef.current ? (timestamp - lastUpdateTimeRef.current) / 1000 : 0.016;
      lastUpdateTimeRef.current = timestamp;
      
      // Skip if delta time is too large (e.g. tab was inactive)
      if (deltaTime > 0.1) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      
      const newPositions = new Map(stonePositions);
      const centerX = playAreaRadius;
      const centerY = playAreaRadius;
      let hasUpdates = false;
      
      // Apply magnetic forces between stones
      const stoneIds = Array.from(newPositions.keys());
      for (let i = 0; i < stoneIds.length; i++) {
        for (let j = i + 1; j < stoneIds.length; j++) {
          const idA = stoneIds[i];
          const idB = stoneIds[j];
          
          const posA = newPositions.get(idA)!;
          const posB = newPositions.get(idB)!;
          
          const stoneA = visibleStones.find(s => s.id === idA);
          const stoneB = visibleStones.find(s => s.id === idB);
          
          if (!stoneA || !stoneB) continue;
          
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const distanceSquared = dx * dx + dy * dy;
          const distance = Math.sqrt(distanceSquared);
          
          // Apply magnetic force if stones are close enough
          if (distance < MAGNETIC_FORCE_DISTANCE && distance > 0) {
            // Calculate force with inverse square law and combined magnetic strengths
            // Use a more natural falloff curve - stronger at close range, gentler at distance
            const distanceRatio = distance / MAGNETIC_FORCE_DISTANCE;
            const forceFalloff = Math.pow(1 - distanceRatio, 2); // Quadratic falloff
            
            // Apply edge placement multiplier if either stone is on edge
            const edgeMultiplier = (stoneA.onEdge || stoneB.onEdge) ? EDGE_MAGNETIC_MULTIPLIER : 1;
            
            const forceMagnitude = MAGNETIC_FORCE_MULTIPLIER * 
              posA.magneticStrength * 
              posB.magneticStrength * 
              forceFalloff * 
              edgeMultiplier / 
              Math.max(distanceSquared, 100);
            
            // Normalize direction
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Apply force (attraction)
            posA.vx += nx * forceMagnitude * deltaTime;
            posA.vy += ny * forceMagnitude * deltaTime;
            posB.vx -= nx * forceMagnitude * deltaTime;
            posB.vy -= ny * forceMagnitude * deltaTime;
            
            hasUpdates = true;
          }
        }
      }
      
      // Apply boundary constraints and update positions
      stoneIds.forEach(id => {
        const pos = newPositions.get(id)!;
        
        // Apply velocity with damping
        pos.x += pos.vx * deltaTime;
        pos.y += pos.vy * deltaTime;
        
        // Apply damping (friction)
        pos.vx *= 0.92; // Increased damping for more natural movement
        pos.vy *= 0.92;
        
        // Keep stones within the play area
        const distanceFromCenter = Math.sqrt(
          Math.pow(pos.x - centerX, 2) + Math.pow(pos.y - centerY, 2)
        );
        
        if (distanceFromCenter + STONE_RADIUS > playAreaRadius) {
          // Calculate normal vector from center
          const nx = (pos.x - centerX) / distanceFromCenter;
          const ny = (pos.y - centerY) / distanceFromCenter;
          
          // Set position at boundary
          pos.x = centerX + nx * (playAreaRadius - STONE_RADIUS);
          pos.y = centerY + ny * (playAreaRadius - STONE_RADIUS);
          
          // Reflect velocity with some energy loss
          const dot = pos.vx * nx + pos.vy * ny;
          pos.vx = pos.vx - 1.8 * dot * nx;
          pos.vy = pos.vy - 1.8 * dot * ny;
        }
      });
      
      // Check for clusters
      const clusteredStoneIds: string[] = [];
      for (let i = 0; i < stoneIds.length; i++) {
        for (let j = i + 1; j < stoneIds.length; j++) {
          const idA = stoneIds[i];
          const idB = stoneIds[j];
          
          const posA = newPositions.get(idA)!;
          const posB = newPositions.get(idB)!;
          
          const stoneA = visibleStones.find(s => s.id === idA);
          const stoneB = visibleStones.find(s => s.id === idB);
          
          if (!stoneA || !stoneB) continue;
          
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Adjust cluster threshold based on whether stones are on edge
          const adjustedThreshold = CLUSTER_THRESHOLD * 
            ((stoneA.onEdge && stoneB.onEdge) ? 1.2 : 
             (stoneA.onEdge || stoneB.onEdge) ? 1.1 : 1);
          
          // If stones are close enough, they are clustered
          if (distance < adjustedThreshold) {
            if (!clusteredStoneIds.includes(idA)) {
              clusteredStoneIds.push(idA);
            }
            if (!clusteredStoneIds.includes(idB)) {
              clusteredStoneIds.push(idB);
            }
          }
        }
      }
      
      // If we found clustered stones, notify the game
      if (clusteredStoneIds.length > 0 && animatingStones.length === 0) {
        // Animate the clustered stones
        setAnimatingStones(clusteredStoneIds);
        
        // Clear animation after a delay
        setTimeout(() => {
          setAnimatingStones([]);
          // Notify the game about the clustered stones
          onCluster(clusteredStoneIds);
        }, CLUSTER_ANIMATION_DURATION);
      }
      
      // Update stone positions in the UI
      if (hasUpdates) {
        setStonePositions(newPositions);
        
        // Update the actual stone positions in the game state
        const updates = stoneIds.map(id => {
          const pos = newPositions.get(id)!;
          return { id, x: pos.x, y: pos.y };
        });
        
        updateStonePositions(updates);
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [visibleStones, stonePositions, gameOver, playAreaRadius, onCluster, updateStonePositions, animatingStones]);
  
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
    if (!isDragging || gameOver) return;
    
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update drag position
    setDragPosition({ x, y });
  };
  
  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || gameOver) return;
    
    // Get the position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if the position is within the play area
    const centerX = playAreaRadius;
    const centerY = playAreaRadius;
    const distanceFromCenter = Math.sqrt(
      Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
    );
    
    if (distanceFromCenter + STONE_RADIUS <= playAreaRadius) {
      // Place the stone
      onStonePlace(x, y);
    }
    
    // Reset dragging state
    setIsDragging(false);
    setDragPosition(null);
  };
  
  const handleMouseLeave = () => {
    // Reset dragging state when mouse leaves the board
    setIsDragging(false);
    setDragPosition(null);
  };
  
  // Get the actual positions to render
  const getRenderPosition = (stone: Stone) => {
    const pos = stonePositions.get(stone.id);
    return pos ? { x: pos.x, y: pos.y } : { x: stone.x, y: stone.y };
  };
  
  // Get the magnetic strength for visual effects
  const getMagneticStrength = (stoneId: string) => {
    const pos = stonePositions.get(stoneId);
    return pos ? pos.magneticStrength : 1;
  };
  
  // Scene component to avoid TypeScript errors
  const Scene = () => {
    return (
      <>
        <ambientLight intensity={0.7} />
        <directionalLight 
          position={[200, 300, 200]} 
          intensity={1} 
          castShadow 
        />
        <directionalLight position={[-100, 200, -100]} intensity={0.5} />
        
        {/* Game board */}
        <mesh position={[0, -BOARD_THICKNESS / 2, 0]} receiveShadow>
          <cylinderGeometry args={[playAreaRadius, playAreaRadius, BOARD_THICKNESS, BOARD_SEGMENTS]} />
          <meshStandardMaterial 
            color="#f5f5f5" 
            roughness={0.8}
            metalness={0.1}
          />
        </mesh>
        
        {/* Board edge */}
        <mesh position={[0, -BOARD_THICKNESS / 2, 0]}>
          <torusGeometry args={[playAreaRadius, 5, 16, BOARD_SEGMENTS]} />
          <meshStandardMaterial color="#FF8C00" roughness={0.5} metalness={0.3} />
        </mesh>
        
        {/* Board grid pattern */}
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[playAreaRadius * 2, playAreaRadius * 2]} />
          <meshStandardMaterial 
            color="#f0f0f0" 
            roughness={0.7}
            metalness={0.1}
            transparent={true}
            opacity={0.8}
          />
        </mesh>
        
        {/* Stones */}
        {visibleStones.map(stone => {
          const pos = getRenderPosition(stone);
          const magneticStrength = getMagneticStrength(stone.id);
          const isAnimating = animatingStones.includes(stone.id);
          
          // Convert 2D position to 3D
          const position = [
            pos.x - playAreaRadius, // Center the board
            stone.onEdge ? STONE_HEIGHT / 2 : STONE_HEIGHT / 2,
            pos.y - playAreaRadius // Center the board
          ];
          
          // Determine stone color based on player
          const color = stone.player === 0 
            ? new THREE.Color(0x3498db) 
            : new THREE.Color(0xe74c3c);
          
          // Add glow effect for magnetic strength
          const glowIntensity = magneticStrength * 0.5;
          const emissiveColor = stone.player === 0 
            ? new THREE.Color(0x3498db).multiplyScalar(glowIntensity) 
            : new THREE.Color(0xe74c3c).multiplyScalar(glowIntensity);
          
          return (
            <group key={stone.id}>
              <mesh 
                position={position as any}
                rotation={stone.onEdge ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
                scale={isAnimating ? [1.2, 1.2, 1.2] : [1, 1, 1]}
              >
                <cylinderGeometry args={[STONE_RADIUS, STONE_RADIUS, STONE_HEIGHT, STONE_SEGMENTS]} />
                <meshStandardMaterial 
                  color={color}
                  roughness={0.5}
                  metalness={0.2}
                  transparent={isAnimating}
                  opacity={isAnimating ? 0.8 : 1}
                  emissive={emissiveColor}
                  emissiveIntensity={isAnimating ? 2 : 1}
                />
              </mesh>
              
              {/* Magnetic field visualization */}
              <mesh 
                position={position as any}
                scale={[1 + magneticStrength * 0.3, 1 + magneticStrength * 0.3, 1 + magneticStrength * 0.3]}
              >
                <sphereGeometry args={[STONE_RADIUS * 1.1, 16, 16]} />
                <meshBasicMaterial 
                  color={stone.player === 0 ? 0x3498db : 0xe74c3c} 
                  transparent={true} 
                  opacity={0.1} 
                  side={THREE.BackSide}
                />
              </mesh>
            </group>
          );
        })}
        
        {/* Ghost stone for dragging */}
        {isDragging && dragPosition && (
          <mesh 
            position={[
              dragPosition.x - playAreaRadius,
              placementMode === 'edge' ? STONE_HEIGHT / 2 : STONE_HEIGHT / 2,
              dragPosition.y - playAreaRadius
            ]}
            rotation={placementMode === 'edge' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
          >
            <cylinderGeometry args={[STONE_RADIUS, STONE_RADIUS, STONE_HEIGHT, STONE_SEGMENTS]} />
            <meshStandardMaterial 
              color={currentPlayer === 0 ? 0x3498db : 0xe74c3c}
              transparent={true}
              opacity={0.5}
            />
          </mesh>
        )}
        
        {/* Floor with shadows */}
        <mesh position={[0, -BOARD_THICKNESS - 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[playAreaRadius * 4, playAreaRadius * 4]} />
          <shadowMaterial transparent opacity={0.2} />
        </mesh>
      </>
    );
  };
  
  return (
    <div 
      ref={boardRef}
      className="game-board-3d"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{
        width: `${playAreaRadius * 2}px`,
        height: `${playAreaRadius * 2}px`,
        position: 'relative',
        borderRadius: '50%',
        overflow: 'hidden',
        cursor: gameOver ? 'default' : 'pointer',
      }}
    >
      <Canvas shadows>
        {/* Static isometric camera */}
        <PerspectiveCamera 
          makeDefault 
          position={[250, 250, 250]} 
          fov={45} 
          near={1}
          far={2000}
          lookAt={[0, 0, 0]}
        />
        
        <Scene />
        <Environment preset="sunset" />
        <ContactShadows 
          position={[0, -BOARD_THICKNESS, 0]} 
          opacity={0.4} 
          scale={800} 
          blur={2} 
          far={100} 
          resolution={1024} 
        />
      </Canvas>
    </div>
  );
};

export default GameBoard3D; 