export type TournamentStatus = 'draft' | 'active' | 'complete';
export type BracketSide = 'upper' | 'lower' | 'final';
export type BracketStyle = 'single' | 'modified-single' | 'double';
export type BracketSize = 16 | 32;
export type BracketType = `${BracketSize}-${BracketStyle}`;

export interface Player {
  id: string;
  name: string;
  skillLevel?: number;
  paid: boolean;
  seed: number;
}

export interface MatchResult {
  matchId: string;
  winnerId: string;
  completedAt: string;
}

export interface MatchScore {
  matchId: string;
  scores: Record<string, number>;
  updatedAt: string;
}

export interface PayoutRow {
  place: string;
  player: string;
  amount: string;
}

export interface TournamentSettings {
  entryFee: number;
  raceTo: number;
  game: '8-ball' | '9-ball' | '10-ball' | 'other';
  rules: string;
  payoutPreset: 'winner-take-all' | '70-30' | '60-30-10';
  directorPinHash?: string;
  joinToken?: string;
  raceChartMode?: 'off' | '8-ball-singles' | 'custom' | 'side-race' | 'skill-handicap';
  skillLevelsEnabled?: boolean;
  customRaceChart?: Record<string, string>;
  sideRaceTargets?: { upper: number; lower: number; final: number };
  skillHandicapTargets?: { upper: number; lower: number; final: number };
}

export interface Tournament {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: TournamentStatus;
  capacity: BracketSize;
  bracketType: BracketType;
  players: Player[];
  results: MatchResult[];
  scores?: MatchScore[];
  payouts?: PayoutRow[];
  settings: TournamentSettings;
}

export type SlotSource =
  | { type: 'seed'; seed: number }
  | { type: 'winner'; matchId: string }
  | { type: 'loser'; matchId: string };

export interface MatchDefinition {
  id: string;
  number: number;
  side: BracketSide;
  round: number;
  label: string;
  slots: readonly [SlotSource, SlotSource];
}

export interface ResolvedMatch extends MatchDefinition {
  playerIds: readonly [string | null, string | null];
  winnerId: string | null;
  loserId: string | null;
  ready: boolean;
  complete: boolean;
}
