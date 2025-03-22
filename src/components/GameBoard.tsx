import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stone, Player } from '../types';
import './GameBoard.css';

// Load sound effects with error handling - moved outside component to avoid recreating on each render
const createAudio = (path: string) => {
  try {
    const audio = new Audio(path);
    audio.load();
    audio.volume = 0.2;
    return audio;
  } catch (e) {
    console.error(`Failed to load audio: ${path}`, e);
    return {
      play: () => Promise.resolve(),
      pause: () => {},
      currentTime: 0,
      volume: 0.2,
      load: () => {}
    } as HTMLAudioElement;
  }
};

// Sound effects - created once
const SOUNDS = {
  placeStone: createAudio('/sounds/place-stone.mp3'),
  clusterStones: createAudio('/sounds/cluster.mp3'),
  gameOver: createAudio('/sounds/game-over.mp3'),
  magnetic: createAudio('/sounds/magnetic-field.mp3')
};

// Constants for magnetic simulation
const STONE_RADIUS = 25;
const STONE_HEIGHT = 8;
const PLAY_AREA_RADIUS = 250;
const MAGNETIC_FORCE_DISTANCE = 180;
const MAGNETIC_FORCE_MULTIPLIER = 120;
const CLUSTER_THRESHOLD = 80;
const ANIMATION_DURATION = 600;
const MAGNETIC_FIELD_LINES = 20;
const CLUSTER_CHECK_THROTTLE = 300; // ms
const ANIMATION_CHECK_DELAY = 100; // ms

// Player colors for the board border
const PLAYER_COLORS = ['var(--player1-color)', 'var(--player2-color)'];

interface GameBoardProps {
  stones: Stone[];
  currentPlayer: Player;
  onStonePlaced: (x: number, y: number) => void;
  onClustered: (clusteredStones: Stone[]) => void;
  placementMode: 'flat' | 'edge';
  isMyTurn?: boolean;
}

// Stone component with simplified positioning - removed unnecessary transforms
const StoneComponent: React.FC<{
  stone: Stone;
  isClusteredStone: boolean;
  isNearCluster: boolean;
  getClusterAngle: (stone: Stone) => number;
}> = React.memo(({ stone, isClusteredStone, isNearCluster, getClusterAngle }) => {
  const playerId = stone.player.id === 0 ? 1 : 2;
  const stoneClass = `stone player-${playerId} ${
    stone.onEdge ? 'on-edge' : ''
  } ${isClusteredStone ? 'clustered' : ''} ${
    isNearCluster ? 'pre-cluster' : ''
  }`;

  // Simple absolute positioning using pixel coordinates
  const stoneStyle: React.CSSProperties = {
    left: `${stone.x}px`,
    top: `${stone.y}px`,
    width: `${STONE_RADIUS * 2}px`,
    height: `${STONE_RADIUS * 2}px`
  };
  
  if (isClusteredStone) {
    stoneStyle['--cluster-angle' as any] = `${getClusterAngle(stone)}deg`;
  }
  
  return (
    <div
      key={stone.id}
      className={stoneClass}
      style={stoneStyle}
      data-stone-id={stone.id}
    />
  );
});

const GameBoard: React.FC<GameBoardProps> = React.memo(({
  stones,
  currentPlayer,
  onStonePlaced,
  onClustered,
  placementMode,
  isMyTurn = true
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [draggingStone, setDraggingStone] = useState<{ x: number; y: number } | null>(null);
  const [magneticLines, setMagneticLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; strength: number }>>([]);
  const [clusteredStones, setClusteredStones] = useState<Stone[]>([]);
  const [nearClusterStones, setNearClusterStones] = useState<Stone[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const lastClusterCheckRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const [showPlacementIndicator, setShowPlacementIndicator] = useState(false);
  const [indicatorPos, setIndicatorPos] = useState({ x: 0, y: 0 });
  const [magneticFieldVisible, setMagneticFieldVisible] = useState(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMagneticSoundPlaying = useRef<boolean>(false);
  const clusterAnimationRef = useRef<Stone[]>([]);
  const soundsLoaded = useRef<boolean>(false);
  
  // Cache stones by ID for faster lookups
  const stonesById = useMemo(() => {
    const map = new Map<string, Stone>();
    stones.forEach(stone => map.set(stone.id, stone));
    return map;
  }, [stones]);

  // Safely play a sound with error handling
  const playSound = useCallback((sound: HTMLAudioElement) => {
    try {
      sound.currentTime = 0;
      const playPromise = sound.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.log("Error playing sound:", e);
        });
      }
    } catch (e) {
      console.error("Failed to play sound:", e);
    }
  }, []);

  // Preload sounds on component mount
  useEffect(() => {
    const loadSounds = async () => {
      try {
        // Force a load attempt on all sounds
        await Promise.all(Object.values(SOUNDS).map(sound => {
          if (typeof sound.load === 'function') {
            sound.load();
          }
          return Promise.resolve();
        }));
        soundsLoaded.current = true;
      } catch (e) {
        console.error("Failed to load sounds:", e);
      }
    };
    
    loadSounds();
  }, []);

  // Calculate magnetic strength between two stones - memoize common calculations
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
    if (stonesToAnimate.length === 0) return [];
    
    // Play clustering sound
    playSound(SOUNDS.clusterStones);
    
    // Store ref to track which stones are animating
    clusterAnimationRef.current = stonesToAnimate;
    
    // Mark stones as clustered for animation
    setIsAnimating(true);
    
    // Clean up animation after it completes
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    
    animationTimeoutRef.current = setTimeout(() => {
      // Only process if these stones are still being animated
      if (clusterAnimationRef.current === stonesToAnimate) {
        onClustered(stonesToAnimate);
        setClusteredStones([]);
        setIsAnimating(false);
        clusterAnimationRef.current = [];
      }
    }, ANIMATION_DURATION);
    
    // Set clustered stones at the end to minimize rerenders
    setClusteredStones(stonesToAnimate);
    
    return stonesToAnimate;
  }, [onClustered, playSound]);

  // Check if stones form a cluster - Optimized with faster lookups
  const checkClustering = useCallback(() => {
    if (isAnimating || stones.length < 2) return [];
    
    // Throttle cluster checking to avoid excessive checks
    const now = Date.now();
    if (now - lastClusterCheckRef.current < CLUSTER_CHECK_THROTTLE) return []; 
    lastClusterCheckRef.current = now;
    
    // Build a graph of connected stones - use object for faster lookups
    const graph: Record<number, number[]> = {};
    const nearClusterIndices = new Set<number>();
    
    // Pre-calculate distances once
    const distances: Record<string, number> = {};
    
    for (let i = 0; i < stones.length; i++) {
      graph[i] = [];
      for (let j = i + 1; j < stones.length; j++) {
        const stone1 = stones[i];
        const stone2 = stones[j];
        const key = `${i}-${j}`;
        
        const dx = stone1.x - stone2.x;
        const dy = stone1.y - stone2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        distances[key] = distance;
        
        // Adjust threshold based on whether stones are on edge
        let adjustedThreshold = CLUSTER_THRESHOLD;
        if (stone1.onEdge && stone2.onEdge) {
          adjustedThreshold *= 1.2; // Increase threshold for edge-to-edge
        } else if (stone1.onEdge || stone2.onEdge) {
          adjustedThreshold *= 1.1; // Slightly increase for edge-to-flat
        }
        
        // Check for near-clustering stones (within 30% of threshold)
        if (distance < adjustedThreshold * 1.3 && distance >= adjustedThreshold) {
          nearClusterIndices.add(i);
          nearClusterIndices.add(j);
        }
        
        if (distance < adjustedThreshold) {
          graph[i].push(j);
          graph[j] = graph[j] || [];
          graph[j].push(i);
        }
      }
    }
    
    // Update near-cluster stones - only when they change
    const newNearClusterStones = Array.from(nearClusterIndices).map(index => stones[index]);
    if (JSON.stringify(newNearClusterStones.map(s => s.id)) !== 
        JSON.stringify(nearClusterStones.map(s => s.id))) {
      setNearClusterStones(newNearClusterStones);
    }
    
    // Find connected components (clusters) - optimized DFS
    const visited = new Set<number>();
    const clusters: number[][] = [];
    
    for (let i = 0; i < stones.length; i++) {
      if (!visited.has(i)) {
        const cluster: number[] = [];
        
        // Non-recursive DFS for better performance
        const stack = [i];
        while (stack.length > 0) {
          const node = stack.pop()!;
          if (!visited.has(node)) {
            visited.add(node);
            cluster.push(node);
            
            for (const neighbor of graph[node] || []) {
              if (!visited.has(neighbor)) {
                stack.push(neighbor);
              }
            }
          }
        }
        
        if (cluster.length >= 2) {
          clusters.push(cluster);
        }
      }
    }
    
    // If clusters found, trigger animation and callback
    if (clusters.length > 0) {
      const clusteredStoneIndices = clusters[0]; // Take the first cluster only
      const clusteredStonesArray = clusteredStoneIndices.map(index => stones[index]);
      
      return animateClusteredStones(clusteredStonesArray);
    }
    
    return [];
  }, [stones, isAnimating, animateClusteredStones, nearClusterStones]);

  // Update magnetic field lines - optimized to reduce calculations
  useEffect(() => {
    if (isAnimating) return;
    
    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Only calculate magnetic lines if there are enough stones
    if (stones.length < 2) {
      setMagneticLines([]);
      setMagneticFieldVisible(false);
      return;
    }
    
    // Use requestAnimationFrame for better performance
    animationFrameRef.current = requestAnimationFrame(() => {
      const newLines: Array<{ x1: number; y1: number; x2: number; y2: number; strength: number }> = [];
      
      // Limit the number of lines to improve performance
      let lineCount = 0;
      
      // Play magnetic sound when there are potential lines and stones exist
      if (stones.length >= 2 && !isMagneticSoundPlaying.current && soundsLoaded.current) {
        try {
          SOUNDS.magnetic.loop = true;
          SOUNDS.magnetic.volume = 0.1; // Lower volume for magnetic sound
          SOUNDS.magnetic.play().catch(e => console.log("Error playing magnetic sound:", e));
          isMagneticSoundPlaying.current = true;
        } catch (e) {
          console.error("Failed to play magnetic sound:", e);
        }
      }
      
      // Calculate magnetic lines efficiently
      const stoneCount = Math.min(stones.length, 20); // Limit maximum stones to process
      
      for (let i = 0; i < stoneCount && lineCount < MAGNETIC_FIELD_LINES; i++) {
        for (let j = i + 1; j < stoneCount && lineCount < MAGNETIC_FIELD_LINES; j++) {
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
      
      // Only update state if the lines have changed
      if (newLines.length !== magneticLines.length) {
        setMagneticLines(newLines);
        setMagneticFieldVisible(newLines.length > 0);
      }
    });
    
    // Cleanup animation frame on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      // Stop magnetic sound
      if (isMagneticSoundPlaying.current) {
        try {
          SOUNDS.magnetic.pause();
          SOUNDS.magnetic.currentTime = 0;
          isMagneticSoundPlaying.current = false;
        } catch (e) {
          console.error("Failed to stop magnetic sound:", e);
        }
      }
    };
  }, [stones, isAnimating, calculateMagneticStrength, magneticLines.length]);

  // Check for clustering after stones move - use refs to avoid unnecessary rerenders
  useEffect(() => {
    if (!isAnimating) {
      const clusterResult = checkClustering();
      
      // If no clusters were found and there's a new stone, check for clustering again after a delay
      // This helps with edge cases where the stone positions are still being updated
      if (clusterResult.length === 0 && stones.length > 0) {
        const timeoutId = setTimeout(() => {
          checkClustering();
        }, ANIMATION_CHECK_DELAY);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [stones, isAnimating, checkClustering]);

  // Clean up sounds on component unmount
  useEffect(() => {
    return () => {
      try {
        Object.values(SOUNDS).forEach(sound => {
          if (typeof sound.pause === 'function') {
            sound.pause();
            sound.currentTime = 0;
          }
        });
      } catch (e) {
        console.error("Failed to clean up sounds:", e);
      }
      
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Convert page coordinates to game board coordinates
  const getGameBoardCoordinates = useCallback((clientX: number, clientY: number): {x: number, y: number} | null => {
    if (!boardRef.current) return null;
    
    const rect = boardRef.current.getBoundingClientRect();
    
    // Get coordinates relative to the center of the board
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate position relative to center
    const boardX = clientX - centerX + PLAY_AREA_RADIUS;
    const boardY = clientY - centerY + PLAY_AREA_RADIUS;
    
    // Check if within play area
    const distanceFromCenter = Math.sqrt(
      Math.pow(clientX - centerX, 2) + 
      Math.pow(clientY - centerY, 2)
    );
    
    if (distanceFromCenter <= PLAY_AREA_RADIUS - STONE_RADIUS) {
      return { x: boardX, y: boardY };
    }
    
    return null;
  }, []);

  // Handle mouse down - start stone dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only allow stone placement if it's the player's turn
    if (!isMyTurn || isAnimating) return;
    
    const position = getGameBoardCoordinates(e.clientX, e.clientY);
    if (position) {
      e.preventDefault();
      setDraggingStone(position);
      setShowPlacementIndicator(true);
      setIndicatorPos(position);
    }
  }, [isMyTurn, isAnimating, getGameBoardCoordinates]);
  
  // Handle mouse move - update dragging stone position
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingStone) return;
    
    const position = getGameBoardCoordinates(e.clientX, e.clientY);
    if (position) {
      setDraggingStone(position);
      setShowPlacementIndicator(true);
      setIndicatorPos(position);
    } else {
      setShowPlacementIndicator(false);
    }
  }, [draggingStone, getGameBoardCoordinates]);
  
  // Handle mouse up - place stone
  const handleMouseUp = useCallback(() => {
    if (!draggingStone) return;
    
    // Create a stable copy of the coordinates
    const stonePosition = { ...draggingStone };
    
    // Reset UI state first
    setDraggingStone(null);
    setShowPlacementIndicator(false);
    
    // Then place the stone
    onStonePlaced(stonePosition.x, stonePosition.y);
    playSound(SOUNDS.placeStone);
  }, [draggingStone, onStonePlaced, playSound]);
  
  // Handle mouse leave - cancel stone placement
  const handleMouseLeave = useCallback(() => {
    setDraggingStone(null);
    setShowPlacementIndicator(false);
  }, []);
  
  // Handle touch start - start stone dragging on mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMyTurn || isAnimating) return;
    
    const touch = e.touches[0];
    const position = getGameBoardCoordinates(touch.clientX, touch.clientY);
    
    if (position) {
      e.preventDefault();
      setDraggingStone(position);
      setShowPlacementIndicator(true);
      setIndicatorPos(position);
    }
  }, [isMyTurn, isAnimating, getGameBoardCoordinates]);
  
  // Handle touch move - update dragging stone position on mobile
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingStone) return;
    
    const touch = e.touches[0];
    const position = getGameBoardCoordinates(touch.clientX, touch.clientY);
    
    if (position) {
      e.preventDefault();
      setDraggingStone(position);
      setShowPlacementIndicator(true);
      setIndicatorPos(position);
    } else {
      setShowPlacementIndicator(false);
    }
  }, [draggingStone, getGameBoardCoordinates]);
  
  // Handle touch end - place stone on mobile
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!draggingStone) return;
    
    // Create a stable copy of the coordinates
    const stonePosition = { ...draggingStone };
    
    // Reset UI state first
    setDraggingStone(null);
    setShowPlacementIndicator(false);
    
    // Then place the stone
    onStonePlaced(stonePosition.x, stonePosition.y);
    playSound(SOUNDS.placeStone);
  }, [draggingStone, onStonePlaced, playSound]);

  // Calculate angle for clustering animation
  const getClusterAngle = useCallback((stone: Stone): number => {
    if (!clusteredStones.length) return 0;
    
    // Find center of mass of the cluster
    const centerX = clusteredStones.reduce((sum, s) => sum + s.x, 0) / clusteredStones.length;
    const centerY = clusteredStones.reduce((sum, s) => sum + s.y, 0) / clusteredStones.length;
    
    // Calculate angle from stone to center
    return Math.atan2(centerY - stone.y, centerX - stone.x) * (180 / Math.PI);
  }, [clusteredStones]);

  // Memoize stone and indicator styles to reduce rerenders
  const boardStyle = useMemo(() => ({
    cursor: isMyTurn && !isAnimating ? 'pointer' : 'default',
    borderColor: PLAYER_COLORS[currentPlayer.id === 0 ? 0 : 1]
  }), [isMyTurn, isAnimating, currentPlayer.id]);

  // Render the stones list with correct positioning
  const StonesList = useMemo(() => {
    return stones.map(stone => (
      <StoneComponent 
        key={stone.id}
        stone={stone}
        isClusteredStone={clusteredStones.some(s => s.id === stone.id)}
        isNearCluster={nearClusterStones.some(s => s.id === stone.id)}
        getClusterAngle={getClusterAngle}
      />
    ));
  }, [stones, clusteredStones, nearClusterStones, getClusterAngle]);

  // Dragging stone preview with consistent positioning
  const DraggingStonePreview = useMemo(() => {
    if (!draggingStone) return null;
    
    return (
      <div
        className={`stone player-${currentPlayer.id === 0 ? 1 : 2} dragging ${placementMode === 'edge' ? 'on-edge' : ''}`}
        style={{
          left: `${draggingStone.x}px`,
          top: `${draggingStone.y}px`,
          width: `${STONE_RADIUS * 2}px`,
          height: `${STONE_RADIUS * 2}px`
        }}
      />
    );
  }, [draggingStone, currentPlayer.id, placementMode]);

  // Placement indicator with consistent positioning
  const PlacementIndicator = useMemo(() => {
    if (!showPlacementIndicator) return null;
    
    return (
      <div 
        className="placement-indicator" 
        style={{
          left: `${indicatorPos.x}px`,
          top: `${indicatorPos.y}px`,
          width: `${STONE_RADIUS * 2}px`,
          height: `${STONE_RADIUS * 2}px`,
          borderColor: PLAYER_COLORS[currentPlayer.id === 0 ? 0 : 1]
        }}
      />
    );
  }, [showPlacementIndicator, indicatorPos, currentPlayer.id]);

  // Position the play area properly in the center of the board
  const playAreaStyle = useMemo(() => ({
    width: `${PLAY_AREA_RADIUS * 2}px`,
    height: `${PLAY_AREA_RADIUS * 2}px`,
    position: 'absolute' as const,
    top: 0,
    left: 0
  }), []);

  // Optimize magnetic field lines rendering
  const MagneticField = useMemo(() => {
    if (!magneticFieldVisible) return null;
    
    return (
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
    );
  }, [magneticFieldVisible, magneticLines]);

  return (
    <div 
      ref={boardRef}
      className="game-board"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={boardStyle}
    >
      {/* Play area circle */}
      <div className="play-area" style={playAreaStyle} />
      
      {/* Magnetic field visualization */}
      {MagneticField}
      
      {/* Stones list */}
      {StonesList}
      
      {/* Dragging stone preview */}
      {DraggingStonePreview}
      
      {/* Touch placement indicator */}
      {PlacementIndicator}
    </div>
  );
});

export default GameBoard; 