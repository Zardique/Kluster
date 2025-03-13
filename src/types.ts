export interface Stone {
  id: string;
  x: number;
  y: number;
  radius: number;
  height: number; // Height of the stone
  player: Player;
  clustered: boolean;
  onEdge: boolean; // Whether the stone is placed on its edge
}

export interface Player {
  id: number;
  stonesLeft: number;
  name: string;
} 