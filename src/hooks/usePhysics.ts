import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { Stone } from '../types';

// Constants for physics simulation
const MAGNETIC_FORCE_STRENGTH = 0.002; // Increased strength for more noticeable effect
const MAGNETIC_FORCE_DISTANCE = 100;
const CLUSTER_THRESHOLD = 15; // Distance threshold for stones to be considered clustered

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
    const currentBodies = new Map(bodiesRef.current);
    
    // Add new stones or update existing ones
    stones.forEach(stone => {
      if (!stone.clustered) {
        if (currentBodies.has(stone.id)) {
          // Update existing body
          const body = currentBodies.get(stone.id)!;
          Matter.Body.setPosition(body, { x: stone.x, y: stone.y });
          console.log('Updated existing body position:', stone.id, stone.x, stone.y);
        } else {
          // Create new body
          const body = Matter.Bodies.circle(stone.x, stone.y, stone.radius, {
            restitution: 0.7,
            friction: 0.1,
            frictionAir: 0.02,
            render: {
              fillStyle: stone.player.id === 0 ? '#3498db' : '#e74c3c',
              strokeStyle: '#000',
              lineWidth: 1
            },
            collisionFilter: { group: 0, category: 0x0001, mask: 0x0003 }
          });
          
          // Add custom property to identify the stone
          (body as any).stoneId = stone.id;
          (body as any).player = stone.player;
          
          Matter.Composite.add(engine.world, [body]);
          currentBodies.set(stone.id, body);
          console.log('Created new body:', stone.id, stone.x, stone.y);
        }
      } else if (currentBodies.has(stone.id)) {
        // Remove clustered stones from the physics engine
        const body = currentBodies.get(stone.id)!;
        Matter.Composite.remove(engine.world, body);
        currentBodies.delete(stone.id);
        console.log('Removed clustered body:', stone.id);
      }
    });
    
    // Remove stones that no longer exist
    currentBodies.forEach((body, id) => {
      if (!stones.some(stone => stone.id === id)) {
        Matter.Composite.remove(engine.world, body);
        currentBodies.delete(id);
        console.log('Removed non-existent body:', id);
      }
    });
    
    bodiesRef.current = currentBodies;
    console.log('Bodies in physics engine:', bodiesRef.current.size);
  }, [stones]);

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
        fillStyle: stone.player.id === 0 ? '#3498db' : '#e74c3c',
        strokeStyle: '#000',
        lineWidth: 1
      },
      collisionFilter: { group: 0, category: 0x0001, mask: 0x0003 }
    });
    
    // Add custom property to identify the stone
    (body as any).stoneId = stone.id;
    (body as any).player = stone.player;
    
    Matter.Composite.add(engine.world, [body]);
    bodiesRef.current.set(stone.id, body);
    
    return body;
  };

  return {
    containerRef,
    addStone
  };
};

export default usePhysics; 