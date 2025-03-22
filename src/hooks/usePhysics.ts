import { useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';
import { Stone } from '../types';
import { stoneIdToString } from '../utils/stoneUtils';

// Constants for physics simulation
const MAGNETIC_FORCE_STRENGTH = 0.002; // Increased strength for more noticeable effect
const MAGNETIC_FORCE_DISTANCE = 100;
const CLUSTER_THRESHOLD = 15; // Distance threshold for stones to be considered clustered
const STONE_RADIUS = 20; // Assuming a default radius if not provided

interface UsePhysicsProps {
  stones: Stone[];
  playAreaRadius: number;
  onCluster: (clusteredStoneIds: string[]) => void;
  updateStonePositions: (updatedStones: { id: string; x: number; y: number }[]) => void;
}

const usePhysics = ({ stones, playAreaRadius, onCluster, updateStonePositions }: UsePhysicsProps) => {
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bodiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const requestRef = useRef<number | null>(null);
  const lastClusterCheckRef = useRef<number>(0);
  const clusterCheckIntervalRef = useRef<number>(500); // Check for clusters every 500ms
  const lastUpdatedStonesRef = useRef<Stone[]>([]);
  const worldCenterX = useRef<number>(playAreaRadius);
  const worldCenterY = useRef<number>(playAreaRadius);
  const potentialClusters = useRef<string[]>([]);
  const running = useRef<boolean>(true);

  // Debug: Log stones when they change
  useEffect(() => {
    console.log('usePhysics received stones:', stones);
    lastUpdatedStonesRef.current = stones;
  }, [stones]);

  // Initialize physics engine
  useEffect(() => {
    if (!containerRef.current) return;

    console.log('Initializing physics engine with playAreaRadius:', playAreaRadius);

    // Create engine
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0 } // No gravity
    });
    
    engineRef.current = engine;

    // Create renderer (hidden, we'll render our own stones)
    const render = Matter.Render.create({
      element: containerRef.current,
      engine: engine,
      options: {
        width: playAreaRadius * 2,
        height: playAreaRadius * 2,
        wireframes: true,
        background: 'transparent',
        pixelRatio: 1
      }
    });
    
    renderRef.current = render;
    
    // Hide the canvas element
    if (render.canvas) {
      render.canvas.style.display = 'none';
    }

    // Create circular boundary
    const boundary = Matter.Bodies.circle(
      playAreaRadius,
      playAreaRadius,
      playAreaRadius,
      {
        isStatic: true,
        render: { fillStyle: 'transparent', strokeStyle: '#FF8C00', lineWidth: 2 },
        collisionFilter: { group: 0, category: 0x0002, mask: 0x0001 }
      }
    );
    
    // Invert the collision filter to make it a container
    boundary.collisionFilter.mask = 0x0001;
    
    Matter.Composite.add(engine.world, [boundary]);
    
    // Start the renderer
    Matter.Render.run(render);
    
    // Create an engine runner
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    console.log('Physics engine initialized');

    // Cleanup
    return () => {
      console.log('Cleaning up physics engine');
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      if (render.canvas && render.canvas.parentNode) {
        render.canvas.remove();
      }
      render.textures = {};
    };
  }, [playAreaRadius]);

  // Update stones in the physics engine
  useEffect(() => {
    if (!engineRef.current) {
      console.log('Engine not initialized yet');
      return;
    }

    console.log('Updating stones in physics engine:', stones);

    const engine = engineRef.current;
    const currentBodies = bodiesRef.current;
    
    // Create or update bodies for each stone
    stones.forEach(stone => {
      // Skip clustered stones in the physics simulation
      if (!stone.clustered) {
        const stoneIdStr = stoneIdToString(stone.id);
        
        if (currentBodies.has(stoneIdStr)) {
          // Update existing body
          const body = currentBodies.get(stoneIdStr)!;
          
          Matter.Body.setPosition(body, {
            x: stone.x + worldCenterX.current,
            y: stone.y + worldCenterY.current
          });
          
          console.log('Updated existing body position:', stoneIdStr, stone.x, stone.y);
        } else {
          // Create a new body
          const body = createBody({
            x: stone.x + worldCenterX.current, 
            y: stone.y + worldCenterY.current,
            radius: stone.radius || STONE_RADIUS,
            render: {
              fillStyle: typeof stone.player === 'object' && stone.player !== null ? 
                (stone.player.id === 0 ? '#3498db' : '#e74c3c') : 
                (stone.playerId === 0 ? '#3498db' : '#e74c3c'),
              strokeStyle: '#FFFFFF',
              lineWidth: 1
            }
          });
          
          // Add to the simulation
          Matter.Composite.add(engine.world, body);
          
          // Add custom property to identify the stone
          (body as any).stoneId = stoneIdStr;
          (body as any).playerId = stone.playerId;
          
          // Store in the map
          currentBodies.set(stoneIdStr, body);
          console.log('Created new body:', stoneIdStr, stone.x, stone.y);
        }
      } else if (currentBodies.has(stoneIdToString(stone.id))) {
        // Remove clustered stones from the simulation
        const body = currentBodies.get(stoneIdToString(stone.id))!;
        Matter.Composite.remove(engine.world, body);
        currentBodies.delete(stoneIdToString(stone.id));
        console.log('Removed clustered body:', stoneIdToString(stone.id));
      }
    });
    
    // Remove bodies for stones that no longer exist
    currentBodies.forEach((body, idStr) => {
      const idExists = stones.some(stone => stoneIdToString(stone.id) === idStr);
      if (!idExists) {
        Matter.Composite.remove(engine.world, body);
        currentBodies.delete(idStr);
        console.log('Removed non-existent body:', idStr);
      }
    });
  }, [stones, playAreaRadius]);

  // Apply magnetic forces and check for clusters
  useEffect(() => {
    if (!engineRef.current) return;
    
    const engine = engineRef.current;
    const bodies = bodiesRef.current;
    
    // Function to apply magnetic forces
    const applyMagneticForces = () => {
      const bodiesArray = Array.from(bodies.values());
      
      // Apply forces between each pair of bodies
      for (let i = 0; i < bodiesArray.length; i++) {
        for (let j = i + 1; j < bodiesArray.length; j++) {
          const bodyA = bodiesArray[i];
          const bodyB = bodiesArray[j];
          
          const dx = bodyB.position.x - bodyA.position.x;
          const dy = bodyB.position.y - bodyA.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < MAGNETIC_FORCE_DISTANCE) {
            // Calculate force magnitude (inverse square law)
            const forceMagnitude = MAGNETIC_FORCE_STRENGTH / (distance * distance);
            
            // Apply force
            Matter.Body.applyForce(bodyA, bodyA.position, {
              x: dx * forceMagnitude,
              y: dy * forceMagnitude
            });
            
            Matter.Body.applyForce(bodyB, bodyB.position, {
              x: -dx * forceMagnitude,
              y: -dy * forceMagnitude
            });
          }
        }
      }
    };
    
    // Function to check for clusters
    const checkForClusters = () => {
      const now = Date.now();
      if (now - lastClusterCheckRef.current < clusterCheckIntervalRef.current) {
        return; // Don't check too frequently
      }
      
      lastClusterCheckRef.current = now;
      
      const bodiesArray = Array.from(bodies.values());
      const clusteredBodies = new Set<Matter.Body>();
      
      // Check for collisions between each pair of bodies
      for (let i = 0; i < bodiesArray.length; i++) {
        for (let j = i + 1; j < bodiesArray.length; j++) {
          const bodyA = bodiesArray[i];
          const bodyB = bodiesArray[j];
          
          const dx = bodyB.position.x - bodyA.position.x;
          const dy = bodyB.position.y - bodyA.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // If stones are close enough, they are clustered
          if (distance < CLUSTER_THRESHOLD) {
            clusteredBodies.add(bodyA);
            clusteredBodies.add(bodyB);
          }
        }
      }
      
      // If we found clustered bodies, notify the game
      if (clusteredBodies.size > 0) {
        const clusteredStoneIds = Array.from(clusteredBodies).map(body => (body as any).stoneId);
        console.log('Detected clusters:', clusteredStoneIds);
        onCluster(clusteredStoneIds);
      }
    };
    
    // Function to update stone positions in the game state
    const updatePositions = () => {
      const updates = Array.from(bodies.entries()).map(([id, body]) => ({
        id,
        x: body.position.x,
        y: body.position.y
      }));
      
      if (updates.length > 0) {
        updateStonePositions(updates);
      }
    };
    
    // Animation loop
    const animate = () => {
      applyMagneticForces();
      checkForClusters();
      updatePositions();
      
      requestRef.current = requestAnimationFrame(animate);
    };
    
    requestRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [onCluster, updateStonePositions]);

  // Function to add a new stone to the physics world
  const addStone = (stone: Stone) => {
    if (!engineRef.current) {
      console.log('Cannot add stone, engine not initialized');
      return;
    }
    
    console.log('Adding stone to physics world:', stone);
    
    const engine = engineRef.current;
    const body = Matter.Bodies.circle(stone.x, stone.y, stone.radius, {
      restitution: 0.7,
      friction: 0.1,
      frictionAir: 0.02,
      render: {
        fillStyle: typeof stone.player === 'object' && stone.player !== null ? 
          (stone.player.id === 0 ? '#3498db' : '#e74c3c') : 
          (stone.playerId === 0 ? '#3498db' : '#e74c3c'),
        strokeStyle: '#000',
        lineWidth: 1
      },
      collisionFilter: { group: 0, category: 0x0001, mask: 0x0003 }
    });
    
    // Add custom property to identify the stone
    (body as any).stoneId = stoneIdToString(stone.id);
    (body as any).playerId = stone.playerId;
    
    Matter.Composite.add(engine.world, [body]);
    bodiesRef.current.set(stoneIdToString(stone.id), body);
    
    return body;
  };

  // Create a stone body with the given options
  const createBody = (options: {
    x: number;
    y: number;
    radius: number;
    render: {
      fillStyle: string;
      strokeStyle: string;
      lineWidth: number;
    };
  }) => {
    return Matter.Bodies.circle(
      options.x,
      options.y,
      options.radius,
      {
        restitution: 0.9,
        friction: 0.1,
        density: 0.5,
        render: options.render
      }
    );
  };

  // Handle collisions for potential clustering
  useEffect(() => {
    if (!engineRef.current) return;
    
    const engine = engineRef.current;
    
    Matter.Events.on(engine, 'collisionStart', (event) => {
      if (!running.current) return;
      
      // Get collisions
      const pairs = event.pairs;
      
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        
        // Skip if either body is the boundary
        if (!pair.bodyA || !pair.bodyB || 
            pair.bodyA.label === 'boundary' || 
            pair.bodyB.label === 'boundary') {
          continue;
        }
        
        // Get stone IDs from bodies
        const stoneAId = (pair.bodyA as any).stoneId;
        const stoneBId = (pair.bodyB as any).stoneId;
        
        if (stoneAId && stoneBId) {
          // Get player IDs
          const playerAId = (pair.bodyA as any).playerId;
          const playerBId = (pair.bodyB as any).playerId;
          
          // If same player stones are colliding, they might cluster
          if (playerAId === playerBId) {
            console.log('Same player stones colliding:', stoneAId, stoneBId);
            
            // Add to potential clusters for further processing
            if (!potentialClusters.current.includes(`${stoneAId},${stoneBId}`)) {
              potentialClusters.current.push(`${stoneAId},${stoneBId}`);
            }
          }
        }
      }
    });
  }, []);

  return {
    containerRef,
    addStone
  };
};

export default usePhysics; 