import { Stone } from '../types';

/**
 * Standardizes a stone object to ensure it has all required properties
 * and maintains backward compatibility with older code.
 */
export function standardizeStone(stone: Partial<Stone>): Stone {
  // Generate a numeric ID if not provided
  const generatedId = Math.floor(Math.random() * 10000);
  
  // Normalize the ID to be numeric
  let normalizedId: number;
  if (stone.id === undefined) {
    normalizedId = generatedId;
  } else if (typeof stone.id === 'string') {
    // Try to parse the string as a number, or use the generated ID
    const parsed = parseInt(stone.id, 10);
    normalizedId = isNaN(parsed) ? generatedId : parsed;
  } else {
    normalizedId = stone.id;
  }
  
  // Create a new stone with default values
  const standardizedStone: Stone = {
    x: stone.x || 0,
    y: stone.y || 0,
    playerId: stone.playerId ?? stone.player ?? 0,
    id: normalizedId,
    radius: stone.radius ?? 25, // Default radius
    clustered: stone.clustered ?? false,
    onEdge: stone.onEdge ?? false
  };
  
  // Copy any additional properties
  return { ...stone, ...standardizedStone };
}

/**
 * Converts an array of stones to ensure all stones have standard properties
 */
export function standardizeStones(stones: Partial<Stone>[]): Stone[] {
  return stones.map(standardizeStone);
}

/**
 * Creates a unique identifier for a stone based on position and player
 */
export function createStoneKey(stone: Stone): string {
  return `${stone.x},${stone.y},${stone.playerId}`;
}

/**
 * Converts a stone ID to string format for consistent comparisons
 */
export function stoneIdToString(id: number | string | undefined): string {
  if (id === undefined) return '';
  return String(id);
} 