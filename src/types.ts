export interface Stone {
  x: number;
  y: number;
  playerId: number;
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