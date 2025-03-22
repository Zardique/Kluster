export interface Stone {
  x: number;
  y: number;
  playerId: number;
  id?: number; // Unique identifier for each stone
  player?: number | Player; // Legacy property - use playerId instead
  clustered?: boolean; // Whether this stone is part of a cluster
  onEdge?: boolean; // For 3D view - whether stone is on edge
  radius?: number; // For physics calculations
  height?: number; // Height for 3D rendering
  // Properties for magnetic simulation
  simulatedX?: number;
  simulatedY?: number;
  isSimulating?: boolean;
}

export interface Player {
  id: number;
  stonesLeft: number;
  name: string;
}

export interface GameState {
  stones: Stone[];
  players: Player[];
  currentPlayerId: number;
  gameOver: boolean;
  winner: Player | null;
}

export interface MagneticField {
  x: number;
  y: number;
  radius: number;
  playerId: number;
}

export interface GameEvent {
  type: string;
  payload?: any;
} 