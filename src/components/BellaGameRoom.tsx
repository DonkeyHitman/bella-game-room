'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { LiveKitRoom, useLocalParticipant, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';

export interface BellaGameRoomProps {
  tableId?: string;
  currentUserSeat?: string;
  currentUserId?: string;
  vsBots?: boolean;
}

// Inner component for Table-Affixed Simple Mic Button & Hold Reminder Message
function TableMicController() {
  const { localParticipant } = useLocalParticipant();
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [showReminder, setShowReminder] = useState(false);

  // Toggle microphone state
  const toggleMicrophone = async () => {
    if (!localParticipant) return;
    const nextState = !isTransmitting;
    setIsTransmitting(nextState);
    try {
      await localParticipant.setMicrophoneEnabled(nextState);
    } catch (err) {
      console.warn('Microphone toggle error:', err);
      setIsTransmitting(false);
    }
  };

  // Trigger reminder toast when clicked
  const handleMicClick = () => {
    toggleMicrophone();
    setShowReminder(true);
    setTimeout(() => {
      setShowReminder(false);
    }, 2500);
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && !e.repeat && !isTransmitting && localParticipant) {
        e.preventDefault();
        setIsTransmitting(true);
        try {
          await localParticipant.setMicrophoneEnabled(true);
        } catch (err) {
          console.warn('Microphone activation deferred:', err);
          setIsTransmitting(false);
        }
      }
    };

    const handleKeyUp = async (e: KeyboardEvent) => {
      if (e.code === 'Space' && localParticipant) {
        e.preventDefault();
        setIsTransmitting(false);
        try {
          await localParticipant.setMicrophoneEnabled(false);
        } catch (err) {
          console.warn('Microphone deactivation error:', err);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [localParticipant, isTransmitting]);

  return (
    <div className="absolute right-4 bottom-4 z-30 flex items-center">
      {/* Reminder Toast Message */}
      {showReminder && (
        <div className="absolute right-full mr-2.5 bg-[#231c18]/95 text-[#f3b23a] text-[10px] font-extrabold px-3 py-1.5 rounded-lg shadow-xl border border-[#d99b26]/50 whitespace-nowrap animate-fade-in pointer-events-none uppercase tracking-wider">
          Hold button to talk
        </div>
      )}

      {/* Simple Table Mic Icon Button */}
      <button
        onClick={handleMicClick}
        className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all active:scale-95 shadow-xl ${
          isTransmitting
            ? 'bg-emerald-600/95 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] text-white'
            : 'bg-[#231c18]/90 hover:bg-[#382e28] border-white/15 text-[#ece3d5]'
        }`}
        title="Mic Control"
      >
        <span className="text-lg">{isTransmitting ? '🎙️' : '🎤'}</span>
      </button>
    </div>
  );
}

function RemoteAudioRenderer() {
  useTracks([Track.Source.Microphone]);
  return null;
}

// ==========================================
// 1. DATA MODELS & TYPES
// ==========================================
export type Direction = 'EAST' | 'WEST' | 'NORTH' | 'SOUTH';

export interface Tile {
  id: string;
  pips: [number, number];
}

export interface PlacedTile extends Tile {
  x: number;
  y: number;
  width: number;
  height: number;
  isVertical: boolean;
  visualPips: [number, number];
  direction: Direction;
  placedBy?: string;
  isSlam?: boolean;
  isRoot?: boolean;
}

export interface Player {
  id: string;
  name: string;
  avatar: string | React.ReactNode;
  hand: Tile[];
  score: number;
  isBot?: boolean;
  lastAction?: string | null;
  speechBubble?: string | null;
}

export interface LegalMove {
  tileId: string;
  side: 'left' | 'right' | 'center';
  matchingPip: number;
  newOpenPip: number;
}

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface GameState {
  roomId: string;
  players: Player[];
  boneyard: Tile[];
  board: PlacedTile[];
  openEnds: { left: number | null; right: number | null };
  currentTurnIndex: number;
  consecutivePasses: number;
  status: 'waiting' | 'playing' | 'win' | 'domino' | 'blocked';
  roundWinnerId: string | null;
  lastPointsAwarded: Record<string, number>;
  roundNumber: number;
  nextRoundStarterId: string | null;

  lastTilePlacedBy: string | null;
  lastTileHadAlternatives: boolean;
  precedingPlayerId: string | null;
  precedingTileHadAlternatives: boolean;

  blockerPlayerId: string | null;
  wasIntentionalBlock: boolean;
  wasPrecedingPlayerRisk: boolean;
  wasForcedBlock: boolean;
}

// ==========================================
// 2. ASYMMETRIC COLLISION-FREE SNAKING ENGINE
// ==========================================
const UNIT = 30;
const LONG = 60;
const GAP = 2.5;

export function calculateBoardBoundingBox(board: PlacedTile[]): BoundingBox {
  if (board.length === 0) {
    return {
      minX: -LONG / 2,
      maxX: LONG / 2,
      minY: -UNIT / 2,
      maxY: UNIT / 2,
      width: LONG,
      height: UNIT,
      centerX: 0,
      centerY: 0,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const tile of board) {
    const left = tile.x - tile.width / 2;
    const right = tile.x + tile.width / 2;
    const top = tile.y - tile.height / 2;
    const bottom = tile.y + tile.height / 2;
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function hasOverlap(
  board: PlacedTile[],
  x: number,
  y: number,
  width: number,
  height: number,
  margin = 1
): boolean {
  const halfW = width / 2 - margin;
  const halfH = height / 2 - margin;

  for (const t of board) {
    const tHalfW = t.width / 2 - margin;
    const tHalfH = t.height / 2 - margin;
    const overlapX = Math.abs(x - t.x) < halfW + tHalfW;
    const overlapY = Math.abs(y - t.y) < halfH + tHalfH;
    if (overlapX && overlapY) {
      return true;
    }
  }
  return false;
}

function computeCandidatePlacement(
  anchor: PlacedTile,
  anchorDir: Direction,
  nextDir: Direction,
  tile: Tile,
  matchingPip: number
): {
  x: number;
  y: number;
  width: number;
  height: number;
  isVertical: boolean;
  visualPips: [number, number];
} {
  const isDouble = tile.pips[0] === tile.pips[1];

  let isVertical = false;
  if (nextDir === 'SOUTH' || nextDir === 'NORTH') {
    isVertical = true;
  } else {
    isVertical = isDouble && anchorDir === nextDir;
  }

  const width = isVertical ? UNIT : LONG;
  const height = isVertical ? LONG : UNIT;

  const otherPip = tile.pips[0] === matchingPip ? tile.pips[1] : tile.pips[0];
  let visualPips: [number, number] = [tile.pips[0], tile.pips[1]];

  if (nextDir === 'EAST') {
    visualPips = [matchingPip, otherPip];
  } else if (nextDir === 'WEST') {
    visualPips = [otherPip, matchingPip];
  } else if (nextDir === 'SOUTH') {
    visualPips = [matchingPip, otherPip];
  } else if (nextDir === 'NORTH') {
    visualPips = [otherPip, matchingPip];
  }

  let x = anchor.x;
  let y = anchor.y;

  if (anchorDir === nextDir) {
    if (nextDir === 'EAST') {
      x = anchor.x + anchor.width / 2 + GAP + width / 2;
      y = anchor.y;
    } else if (nextDir === 'WEST') {
      x = anchor.x - anchor.width / 2 - GAP - width / 2;
      y = anchor.y;
    } else if (nextDir === 'SOUTH') {
      x = anchor.x;
      y = anchor.y + anchor.height / 2 + GAP + height / 2;
    } else if (nextDir === 'NORTH') {
      x = anchor.x;
      y = anchor.y - anchor.height / 2 - GAP - height / 2;
    }
  } else if ((anchorDir === 'EAST' || anchorDir === 'WEST') && nextDir === 'SOUTH') {
    x = anchorDir === 'EAST' ? anchor.x + anchor.width / 2 - width / 2 : anchor.x - anchor.width / 2 + width / 2;
    y = anchor.y + anchor.height / 2 + GAP + height / 2;
  } else if ((anchorDir === 'EAST' || anchorDir === 'WEST') && nextDir === 'NORTH') {
    x = anchorDir === 'EAST' ? anchor.x + anchor.width / 2 - width / 2 : anchor.x - anchor.width / 2 + width / 2;
    y = anchor.y - anchor.height / 2 - GAP - height / 2;
  } else if (anchorDir === 'SOUTH' && (nextDir === 'WEST' || nextDir === 'EAST')) {
    x = nextDir === 'WEST' ? anchor.x - anchor.width / 2 - GAP - width / 2 : anchor.x + anchor.width / 2 + GAP + width / 2;
    y = anchor.y + anchor.height / 2 - height / 2;
  } else if (anchorDir === 'NORTH' && (nextDir === 'WEST' || nextDir === 'EAST')) {
    x = nextDir === 'WEST' ? anchor.x - anchor.width / 2 - GAP - width / 2 : anchor.x + anchor.width / 2 + GAP + width / 2;
    y = anchor.y - anchor.height / 2 - height / 2;
  }

  return { x, y, width, height, isVertical, visualPips };
}

export function placeTileOnChain(
  board: PlacedTile[],
  tile: Tile,
  side: 'left' | 'right' | 'center',
  matchingPip: number,
  placedBy?: string,
  isSlam?: boolean
): PlacedTile[] {
  const isDouble = tile.pips[0] === tile.pips[1];

  if (board.length === 0 || side === 'center') {
    const isVert = isDouble;
    const firstTile: PlacedTile = {
      ...tile,
      x: 0,
      y: 0,
      width: isVert ? UNIT : LONG,
      height: isVert ? LONG : UNIT,
      isVertical: isVert,
      visualPips: [tile.pips[0], tile.pips[1]],
      direction: 'EAST',
      placedBy,
      isSlam,
      isRoot: true,
    };
    return [firstTile];
  }

  const isLeft = side === 'left';
  const anchor = isLeft ? board[0] : board[board.length - 1];

  const anchorDir: Direction = anchor.isRoot
    ? isLeft ? 'WEST' : 'EAST'
    : anchor.direction;

  let consecutiveInDir = 0;
  const scanList = isLeft ? board : [...board].reverse();
  for (const t of scanList) {
    const tDir: Direction = t.isRoot ? (isLeft ? 'WEST' : 'EAST') : t.direction;
    if (tDir === anchorDir) {
      consecutiveInDir++;
    } else {
      break;
    }
  }

  const TURN_THRESHOLD = 450;
  let preferredDir: Direction = anchorDir;

  if (anchorDir === 'EAST') {
    const projectedRight = anchor.x + anchor.width / 2 + LONG;
    if (projectedRight > TURN_THRESHOLD) preferredDir = 'SOUTH';
  } else if (anchorDir === 'WEST') {
    const projectedLeft = anchor.x - anchor.width / 2 - LONG;
    if (projectedLeft < -TURN_THRESHOLD) preferredDir = 'SOUTH';
  } else if (anchorDir === 'SOUTH') {
    const requiredVerticalSteps = isLeft ? 1 : 2;
    preferredDir = consecutiveInDir >= requiredVerticalSteps ? (isLeft ? 'EAST' : 'WEST') : 'SOUTH';
  }

  const fallbackDirs: Direction[] = [
    preferredDir,
    anchorDir,
    'SOUTH',
    'NORTH',
    isLeft ? 'WEST' : 'EAST',
    isLeft ? 'EAST' : 'WEST',
  ];

  const uniqueDirs = Array.from(new Set(fallbackDirs));

  let chosenPlacement = computeCandidatePlacement(
    anchor,
    anchorDir,
    preferredDir,
    tile,
    matchingPip
  );
  let chosenDir = preferredDir;

  for (const candidateDir of uniqueDirs) {
    const candidate = computeCandidatePlacement(
      anchor,
      anchorDir,
      candidateDir,
      tile,
      matchingPip
    );
    if (!hasOverlap(board, candidate.x, candidate.y, candidate.width, candidate.height)) {
      chosenPlacement = candidate;
      chosenDir = candidateDir;
      break;
    }
  }

  const placed: PlacedTile = {
    ...tile,
    x: chosenPlacement.x,
    y: chosenPlacement.y,
    width: chosenPlacement.width,
    height: chosenPlacement.height,
    isVertical: chosenPlacement.isVertical,
    visualPips: chosenPlacement.visualPips,
    direction: chosenDir,
    placedBy,
    isSlam,
    isRoot: false,
  };

  return isLeft ? [placed, ...board] : [...board, placed];
}

// ==========================================
// 3. 4-PLAYER BLOCK DOMINOES RULES & SCORING
// ==========================================
const MEMBER_DATA: Record<string, { name: string; avatar: string }> = {
  'TUAN': { name: 'TUAN', avatar: '🧔🏽‍♂️' },
  'HA': { name: 'HA', avatar: '👩🏻' },
  'NHA': { name: 'NHA', avatar: '😎' },
  'VUONG': { name: 'VUONG', avatar: '🕵🏻‍♂️' },
  'HUYEN': { name: 'HUYEN', avatar: '👩🏼' },
  'NAM': { name: 'NAM', avatar: '👨🏻' },
  'YEN': { name: 'YEN', avatar: '👩🏽' },
  'TUYET': { name: 'TUYET', avatar: '👱🏻‍♀️' },
  'HUNG': { name: 'HUNG', avatar: '👨🏼' },
  'TIEN': { name: 'TIEN', avatar: '👩🏼‍🎨' },
  'CHAU': { name: 'CHAU', avatar: '🧑🏻' },
  'KIEN ANH': { name: 'KIEN ANH', avatar: '👨🏽' },
  'THANG': { name: 'THANG', avatar: '🧑🏽' },
  'HAO': { name: 'HAO', avatar: '👨🏾' },
};

const SEATED_PLAYER_IDS = ['NHA', 'TIEN', 'TUAN', 'VUONG'];

const BOT_QUIPS = {
  pass: ['Nothing to play?', 'Pass.', 'Ugh.'],
  almostOut: ['One left!', 'Just one tile.', 'Almost out.'],
  standardWin: ['Out!', 'Got rid of them.', 'Cleaned hand.'],
  dominoWin: ['Domino!'],
};

export function generateDoubleSixDeck(): Tile[] {
  const deck: Tile[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      deck.push({ id: `${i}-${j}`, pips: [i, j] });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Tile[]): Tile[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dealBlockDominoes(
  seatedIds: string[],
  existingScores: Record<string, number> = {},
  roundNumber = 1,
  forcedStarterId: string | null = null,
  activeUserId?: string
): GameState {
  const deck = shuffleDeck(generateDoubleSixDeck());
  const resolvedLocalId = activeUserId || 'NHA';

  const players: Player[] = seatedIds.map((id, idx) => {
    const effectiveId = idx === 0 ? resolvedLocalId : id;
    const memberInfo = MEMBER_DATA[effectiveId] || { name: effectiveId, avatar: '👤' };
    return {
      id: effectiveId,
      name: memberInfo.name,
      avatar: memberInfo.avatar,
      hand: deck.slice(idx * 7, (idx + 1) * 7),
      score: existingScores[effectiveId] ?? 0,
      isBot: idx !== 0,
      lastAction: null,
      speechBubble: null,
    };
  });

  let startingPlayerIndex = 0;
  if (forcedStarterId) {
    const forcedIdx = players.findIndex((p) => p.id === forcedStarterId);
    if (forcedIdx !== -1) startingPlayerIndex = forcedIdx;
  } else if (roundNumber === 1) {
    for (let d = 6; d >= 0; d--) {
      const holderIdx = players.findIndex((p) => p.hand.some((t) => t.pips[0] === d && t.pips[1] === d));
      if (holderIdx !== -1) {
        startingPlayerIndex = holderIdx;
        break;
      }
    }
  }

  return {
    roomId: 'bella-main-room',
    players,
    boneyard: [],
    board: [],
    openEnds: { left: null, right: null },
    currentTurnIndex: startingPlayerIndex,
    consecutivePasses: 0,
    status: 'playing',
    roundWinnerId: null,
    lastPointsAwarded: {},
    roundNumber,
    nextRoundStarterId: null,
    lastTilePlacedBy: null,
    lastTileHadAlternatives: false,
    precedingPlayerId: null,
    precedingTileHadAlternatives: false,
    blockerPlayerId: null,
    wasIntentionalBlock: false,
    wasPrecedingPlayerRisk: false,
    wasForcedBlock: false,
  };
}

export function getLegalMoves(hand: Tile[], openEnds: { left: number | null; right: number | null }): LegalMove[] {
  if (openEnds.left === null || openEnds.right === null) {
    return hand.map((t) => ({ tileId: t.id, side: 'center', matchingPip: t.pips[0], newOpenPip: t.pips[1] }));
  }
  const moves: LegalMove[] = [];
  for (const tile of hand) {
    const [a, b] = tile.pips;
    if (a === openEnds.left || b === openEnds.left) {
      moves.push({ tileId: tile.id, side: 'left', matchingPip: openEnds.left, newOpenPip: a === openEnds.left ? b : a });
    }
    if (a === openEnds.right || b === openEnds.right) {
      moves.push({ tileId: tile.id, side: 'right', matchingPip: openEnds.right, newOpenPip: a === openEnds.right ? b : a });
    }
  }
  return moves;
}

export function sumHandPips(hand: Tile[]): number {
  return hand.reduce((total, tile) => total + tile.pips[0] + tile.pips[1], 0);
}

export function calculateWinScoring(players: Player[], winnerId: string): { winnerId: string; roundScores: Record<string, number>; starterId: string } {
  const roundScores: Record<string, number> = {};
  const others = players
    .filter((p) => p.id !== winnerId)
    .map((p) => ({ id: p.id, pips: sumHandPips(p.hand) }))
    .sort((a, b) => a.pips - b.pips);

  roundScores[winnerId] = 2;
  if (others.length > 0) roundScores[others[0].id] = 1;
  if (others.length > 1) roundScores[others[1].id] = -1;
  if (others.length > 2) roundScores[others[2].id] = -2;
  return { winnerId, roundScores, starterId: winnerId };
}

export function calculateDominoScoring(players: Player[], winnerId: string, precedingPlayerId: string | null, precedingPlayerHadAlternatives: boolean): { winnerId: string; roundScores: Record<string, number>; wasRisk: boolean; starterId: string } {
  const roundScores: Record<string, number> = {};
  players.forEach((p) => { roundScores[p.id] = 0; });
  const isPrecedingRisk = Boolean(precedingPlayerId && precedingPlayerId !== winnerId && precedingPlayerHadAlternatives);

  if (isPrecedingRisk) {
    roundScores[winnerId] = 6;
    roundScores[precedingPlayerId!] = -6;
  } else {
    roundScores[winnerId] = 6;
    players.forEach((p) => { if (p.id !== winnerId) roundScores[p.id] = -2; });
  }
  return { winnerId, roundScores, wasRisk: isPrecedingRisk, starterId: winnerId };
}

export function calculateBlockScoring(players: Player[], blockerId: string, precedingPlayerId: string | null, precedingPlayerHadAlternatives: boolean, blockerHadAlternatives: boolean): { winnerId: string; roundScores: Record<string, number>; wasRisk: boolean; forcedBlock: boolean; starterId: string } {
  const roundScores: Record<string, number> = {};
  players.forEach((p) => { roundScores[p.id] = 0; });

  if (!blockerHadAlternatives) {
    const pipCounts = players.map((p) => ({ id: p.id, pips: sumHandPips(p.hand) })).sort((a, b) => a.pips - b.pips);
    roundScores[pipCounts[0].id] = 2;
    if (pipCounts.length > 1) roundScores[pipCounts[1].id] = 1;
    if (pipCounts.length > 2) roundScores[pipCounts[2].id] = -1;
    if (pipCounts.length > 3) roundScores[pipCounts[3].id] = -2;
    return { winnerId: pipCounts[0].id, roundScores, wasRisk: false, forcedBlock: true, starterId: pipCounts[0].id };
  }

  const isPrecedingRisk = Boolean(precedingPlayerId && precedingPlayerId !== blockerId && precedingPlayerHadAlternatives);
  const pipCounts = players.map((p) => ({ id: p.id, pips: sumHandPips(p.hand) })).sort((a, b) => a.pips - b.pips);
  const lowestPip = pipCounts[0].pips;
  const blockerPips = sumHandPips(players.find((p) => p.id === blockerId)?.hand || []);
  const blockerTiesForLowest = blockerPips === lowestPip;

  if (!blockerTiesForLowest && isPrecedingRisk) {
    roundScores[precedingPlayerId!] = 9;
    roundScores[blockerId] = -9;
    return { winnerId: precedingPlayerId!, roundScores, wasRisk: true, forcedBlock: false, starterId: blockerId };
  }

  if (blockerTiesForLowest) {
    roundScores[blockerId] = 9;
    players.forEach((p) => { if (p.id !== blockerId) roundScores[p.id] = -3; });
    return { winnerId: blockerId, roundScores, wasRisk: false, forcedBlock: false, starterId: blockerId };
  }

  const winnerId = pipCounts[0].id;
  roundScores[winnerId] = 9;
  roundScores[blockerId] = -9;
  players.forEach((p) => { if (p.id !== winnerId && p.id !== blockerId) roundScores[p.id] = 3; });
  return { winnerId, roundScores, wasRisk: false, forcedBlock: false, starterId: blockerId };
}

export function applyMove(state: GameState, playerId: string, tileId: string, side: 'left' | 'right' | 'center'): GameState {
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1 || playerIndex !== state.currentTurnIndex) return state;
  const player = state.players[playerIndex];
  const tile = player.hand.find((t) => t.id === tileId);
  if (!tile) return state;

  if (state.board.length > 0 && side !== 'center') {
    const targetEndPip = side === 'left' ? state.openEnds.left : state.openEnds.right;
    if (targetEndPip !== null && tile.pips[0] !== targetEndPip && tile.pips[1] !== targetEndPip) return state;
  }

  const currentLegalMoves = getLegalMoves(player.hand, state.openEnds);
  const hasAlternatives = currentLegalMoves.length > 1;
  let newLeft = state.openEnds.left;
  let newRight = state.openEnds.right;
  let matchingPip = tile.pips[0];

  if (state.board.length === 0 || side === 'center') {
    newLeft = tile.pips[0]; newRight = tile.pips[1]; matchingPip = tile.pips[0];
  } else if (side === 'left') {
    matchingPip = state.openEnds.left!;
    newLeft = tile.pips[0] === matchingPip ? tile.pips[1] : tile.pips[0];
  } else {
    matchingPip = state.openEnds.right!;
    newRight = tile.pips[0] === matchingPip ? tile.pips[1] : tile.pips[0];
  }

  const isSlam = tile.pips[0] === tile.pips[1] || tile.pips[0] + tile.pips[1] >= 10 || player.hand.length === 1;
  const updatedBoard = placeTileOnChain(state.board, tile, state.board.length === 0 ? 'center' : side, matchingPip, playerId, isSlam);
  const updatedHand = player.hand.filter((t) => t.id !== tileId);
  const precedingId = state.lastTilePlacedBy;
  const precedingHadAlternatives = state.lastTileHadAlternatives;

  if (updatedHand.length === 0) {
    const isDomino = state.board.length > 0 && state.openEnds.left !== null && state.openEnds.right !== null &&
      ((tile.pips[0] === state.openEnds.left && tile.pips[1] === state.openEnds.right) || (tile.pips[1] === state.openEnds.left && tile.pips[0] === state.openEnds.right));

    const tempPlayers = state.players.map((p, idx) => {
      if (idx === playerIndex) {
        const quips = isDomino ? BOT_QUIPS.standardWin : BOT_QUIPS.standardWin;
        return { ...p, hand: updatedHand, speechBubble: p.isBot ? quips[Math.floor(Math.random() * quips.length)] : null };
      }
      return { ...p, speechBubble: null };
    });

    let finalScores: Record<string, number> = {};
    let wasRisk = false;
    let starterId = playerId;
    if (isDomino) {
      const result = calculateDominoScoring(tempPlayers, playerId, precedingId, precedingHadAlternatives);
      finalScores = result.roundScores; wasRisk = result.wasRisk; starterId = result.starterId;
    } else {
      const result = calculateWinScoring(tempPlayers, playerId);
      finalScores = result.roundScores; wasRisk = false; starterId = result.starterId;
    }
    const finalPlayers = tempPlayers.map((p) => ({ ...p, score: p.score + (finalScores[p.id] || 0) }));

    return { ...state, board: updatedBoard, openEnds: { left: newLeft, right: newRight }, players: finalPlayers, consecutivePasses: 0,
      status: isDomino ? 'domino' : 'win', roundWinnerId: playerId, lastPointsAwarded: finalScores, nextRoundStarterId: starterId,
      lastTilePlacedBy: playerId, lastTileHadAlternatives: hasAlternatives, wasPrecedingPlayerRisk: wasRisk, wasForcedBlock: false };
  }

  const bubbleText = (player.isBot && updatedHand.length === 1) ? BOT_QUIPS.almostOut[Math.floor(Math.random() * BOT_QUIPS.almostOut.length)] : null;
  const updatedPlayers = state.players.map((p, idx) => idx === playerIndex ? { ...p, hand: updatedHand, lastAction: 'play', speechBubble: bubbleText } : { ...p, speechBubble: null });
  const nextTurnIndex = (state.currentTurnIndex - 1 + state.players.length) % state.players.length;

  return { ...state, board: updatedBoard, openEnds: { left: newLeft, right: newRight }, players: updatedPlayers, currentTurnIndex: nextTurnIndex,
    consecutivePasses: 0, precedingPlayerId: state.lastTilePlacedBy, precedingTileHadAlternatives: state.lastTileHadAlternatives,
    lastTilePlacedBy: playerId, lastTileHadAlternatives: hasAlternatives, wasForcedBlock: false };
}

export function applyPass(state: GameState): GameState {
  const nextPasses = state.consecutivePasses + 1;
  const currentPlayer = state.players[state.currentTurnIndex];
  const bubbleText = currentPlayer.isBot ? BOT_QUIPS.pass[Math.floor(Math.random() * BOT_QUIPS.pass.length)] : null;
  const updatedPlayers = state.players.map((p, idx) => idx === state.currentTurnIndex ? { ...p, lastAction: 'pass', speechBubble: bubbleText } : { ...p, speechBubble: null });

  if (nextPasses >= 4) {
    const blockerId = state.lastTilePlacedBy || currentPlayer.id;
    const blockerHadAlternatives = state.lastTileHadAlternatives;
    const precedingId = state.precedingPlayerId;
    const precedingHadAlternatives = state.precedingTileHadAlternatives;
    const { winnerId, roundScores, wasRisk, forcedBlock, starterId } = calculateBlockScoring(updatedPlayers, blockerId, precedingId, precedingHadAlternatives, blockerHadAlternatives);
    const finalPlayers = updatedPlayers.map((p) => ({ ...p, score: p.score + (roundScores[p.id] || 0) }));

    return { ...state, players: finalPlayers, consecutivePasses: nextPasses, status: 'blocked', roundWinnerId: winnerId,
      lastPointsAwarded: roundScores, nextRoundStarterId: starterId, blockerPlayerId: blockerId, wasIntentionalBlock: !forcedBlock,
      wasPrecedingPlayerRisk: wasRisk, wasForcedBlock: forcedBlock };
  }
  const nextTurnIndex = (state.currentTurnIndex - 1 + state.players.length) % state.players.length;
  return { ...state, players: updatedPlayers, currentTurnIndex: nextTurnIndex, consecutivePasses: nextPasses };
}

// ==========================================
// 4. WEB AUDIO API SOUND SYNTHESIZER
// ==========================================
class SoundEngine {
  private ctx: AudioContext | null = null;
  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  playTileClick() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(520, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.18, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.06);
  }
  playTileSlam() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(165, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.55, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.17);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.17);
  }
  playTableKnock() {
    const ctx = this.getContext();
    if (!ctx) return;
    [0, 0.11].forEach((offset) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(190, ctx.currentTime + offset); osc.frequency.exponentialRampToValueAtTime(75, ctx.currentTime + offset + 0.07);
      gain.gain.setValueAtTime(0.35, ctx.currentTime + offset); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.07);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.07);
    });
  }
  playRoundWinChime() {
    const ctx = this.getContext();
    if (!ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'triangle'; const start = ctx.currentTime + idx * 0.08;
      osc.frequency.setValueAtTime(freq, start); gain.gain.setValueAtTime(0.22, start); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(start); osc.stop(start + 0.35);
    });
  }
}

const soundFX = new SoundEngine();

// ==========================================
// 5. CLASSIC FLAT PIPS
// ==========================================
const SVG_PIP_COORDS: Record<number, [number, number][]> = {
  0: [],
  1: [[50, 50]],
  2: [[26, 26], [74, 74]],
  3: [[24, 24], [50, 50], [76, 76]],
  4: [[26, 26], [74, 26], [26, 74], [74, 74]],
  5: [[24, 24], [76, 24], [50, 50], [24, 76], [76, 76]],
  6: [[26, 22], [74, 22], [26, 50], [74, 50], [26, 78], [74, 78]],
};

const SVG_PIP_COORDS_HORIZONTAL_6: [number, number][] = [
  [22, 26], [50, 26], [78, 26], [22, 74], [50, 74], [78, 74],
];

const PIP_FLAT_COLORS: Record<number, string> = {
  6: '#ca8a04',
  5: '#18181b',
  4: '#1e3a8a',
  3: '#c90f2b',
  2: '#059669',
  1: '#18181b',
};

function SvgPipHalf({
  value,
  isHorizontalTile = false,
}: {
  value: number;
  isHorizontalTile?: boolean;
}) {
  const coords =
    isHorizontalTile && value === 6
      ? SVG_PIP_COORDS_HORIZONTAL_6
      : SVG_PIP_COORDS[value] || [];
  const fillColor = PIP_FLAT_COLORS[value] || PIP_FLAT_COLORS[1];

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full block">
      {coords.map(([cx, cy], idx) => (
        <circle
          key={idx}
          cx={cx}
          cy={cy}
          r={11.0}
          fill={fillColor}
          stroke="rgba(0, 0, 0, 0.8)"
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}

// ==========================================
// 6. MAIN BELLA GAME ROOM COMPONENT
// ==========================================
export default function BellaGameRoom({ tableId, currentUserSeat, currentUserId, vsBots }: BellaGameRoomProps) {
  const resolvedUserId = currentUserId || 'NHA';
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [slamShake, setSlamShake] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const [endOverlayPhase, setEndOverlayPhase] = useState<
    'none' | 'flash' | 'scoreboard' | 'inspectTable'
  >('none');

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 900, height: 340 });

  useEffect(() => {
    setGameState(dealBlockDominoes(SEATED_PLAYER_IDS, {}, 1, null, resolvedUserId));
  }, [resolvedUserId]);

  const localPlayer = gameState?.players[0];

  useEffect(() => {
    fetch(`/api/livekit/token?room=${tableId || 'bellagameroom'}&username=${localPlayer?.name || resolvedUserId}`)
      .then((res) => res.json())
      .then((data) => setToken(data.token))
      .catch((err) => console.error('LiveKit token fetch error:', err));
  }, [tableId, localPlayer?.name, resolvedUserId]);

  useEffect(() => {
    const updateLayout = () => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const isMyTurn =
    gameState?.status === 'playing' && gameState?.currentTurnIndex === 0;

  const legalMoves = useMemo(
    () => (localPlayer && gameState ? getLegalMoves(localPlayer.hand, gameState.openEnds) : []),
    [localPlayer, gameState]
  );

  const playableTileIds = useMemo(
    () => new Set(legalMoves.map((m) => m.tileId)),
    [legalMoves]
  );

  useEffect(() => {
    if (!isMyTurn) {
      setSelectedTileId(null);
    }
  }, [isMyTurn]);

  useEffect(() => {
    if (!gameState || gameState.status !== 'playing') return;
    const activePlayer = gameState.players[gameState.currentTurnIndex];
    if (!activePlayer?.isBot) return;

    const timer = setTimeout(() => {
      const botMoves = getLegalMoves(activePlayer.hand, gameState.openEnds);
      if (botMoves.length > 0) {
        const chosenMove = botMoves[0];
        const nextState = applyMove(
          gameState,
          activePlayer.id,
          chosenMove.tileId,
          chosenMove.side
        );
        const latestTile =
          nextState.board[nextState.board.length - 1] || nextState.board[0];
        if (latestTile?.isSlam) {
          soundFX.playTileSlam();
          setSlamShake(true);
          setTimeout(() => setSlamShake(false), 220);
        } else {
          soundFX.playTileClick();
        }
        setGameState(nextState);
      } else {
        soundFX.playTableKnock();
        setGameState((prev) => (prev ? applyPass(prev) : prev));
      }
    }, 950);

    return () => clearTimeout(timer);
  }, [gameState]);

  useEffect(() => {
    if (
      gameState?.status === 'domino' ||
      gameState?.status === 'win' ||
      gameState?.status === 'blocked'
    ) {
      soundFX.playRoundWinChime();
      setEndOverlayPhase('flash');
      const timer = setTimeout(() => {
        setEndOverlayPhase('scoreboard');
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setEndOverlayPhase('none');
    }
  }, [gameState?.status]);

  const boardMetrics = useMemo(() => {
    const bbox = calculateBoardBoundingBox(gameState?.board || []);
    const padX = 95;
    const padY = 35;
    const scaleX = viewportSize.width / Math.max(280, bbox.width + padX * 2);
    const scaleY = viewportSize.height / Math.max(150, bbox.height + padY * 2);
    const fitScale = Math.max(0.55, Math.min(1.0, scaleX, scaleY));
    return { bbox, fitScale };
  }, [gameState?.board, viewportSize]);

  const rankedScoreboardPlayers = useMemo(() => {
    if (!gameState) return [];
    return [...gameState.players]
      .map((p) => ({
        ...p,
        remainingPips: sumHandPips(p.hand),
        roundDelta: gameState.lastPointsAwarded[p.id] ?? 0,
      }))
      .sort((a, b) => {
        if (a.id === gameState.roundWinnerId) return -1;
        if (b.id === gameState.roundWinnerId) return 1;
        if (b.roundDelta !== a.roundDelta) return b.roundDelta - a.roundDelta;
        return a.remainingPips - b.remainingPips;
      });
  }, [gameState]);

  const executeMoveOnSide = useCallback(
    (tileId: string, side: 'left' | 'right' | 'center') => {
      if (!isMyTurn || !gameState || !localPlayer) return;
      const nextState = applyMove(gameState, localPlayer.id, tileId, side);
      const tileObj = localPlayer.hand.find((t) => t.id === tileId);
      if (
        tileObj &&
        (tileObj.pips[0] === tileObj.pips[1] || tileObj.pips[0] + tileObj.pips[1] >= 10)
      ) {
        soundFX.playTileSlam();
        setSlamShake(true);
        setTimeout(() => setSlamShake(false), 220);
      } else {
        soundFX.playTileClick();
      }
      setSelectedTileId(null);
      setGameState(nextState);
    },
    [isMyTurn, gameState, localPlayer]
  );

  const handleHandTileClick = useCallback(
    (tileId: string) => {
      if (!isMyTurn || !gameState) return;
      const movesForTile = legalMoves.filter((m) => m.tileId === tileId);
      if (movesForTile.length === 0) return;

      if (gameState.board.length === 0) {
        executeMoveOnSide(tileId, 'center');
        return;
      }

      const canLeft = movesForTile.some((m) => m.side === 'left');
      const canRight = movesForTile.some((m) => m.side === 'right');

      if (canLeft && canRight) {
        if (selectedTileId === tileId) {
          executeMoveOnSide(tileId, 'right');
        } else {
          soundFX.playTileClick();
          setSelectedTileId(tileId);
        }
      } else {
        if (selectedTileId === tileId) {
          executeMoveOnSide(tileId, movesForTile[0].side);
        } else {
          soundFX.playTileClick();
          setSelectedTileId(tileId);
        }
      }
    },
    [isMyTurn, gameState, legalMoves, selectedTileId, executeMoveOnSide]
  );

  const handlePassAction = useCallback(() => {
    if (!isMyTurn || !gameState || legalMoves.length > 0) return;
    soundFX.playTableKnock();
    setGameState((prev) => (prev ? applyPass(prev) : prev));
  }, [isMyTurn, gameState, legalMoves]);

  const startNextRound = () => {
    if (!gameState) return;
    const scoreMap: Record<string, number> = {};
    gameState.players.forEach((p) => {
      scoreMap[p.id] = p.score;
    });
    setSelectedTileId(null);
    setEndOverlayPhase('none');

    const starterId = gameState.nextRoundStarterId;
    setGameState(
      dealBlockDominoes(SEATED_PLAYER_IDS, scoreMap, gameState.roundNumber + 1, starterId, resolvedUserId)
    );
  };

  if (!gameState || !localPlayer) {
    return (
      <div className="w-full h-screen bg-[#18120c] flex items-center justify-center text-amber-200 font-sans text-lg tracking-wider uppercase">
        Loading Bella Game Room...
      </div>
    );
  }

  const opponents = gameState.players.slice(1);
  const selectedTileMoves = legalMoves.filter((m) => m.tileId === selectedTileId);
  const showLeftEndButton =
    isMyTurn &&
    gameState.board.length > 0 &&
    selectedTileMoves.some((m) => m.side === 'left');
  const showRightEndButton =
    isMyTurn &&
    gameState.board.length > 0 &&
    selectedTileMoves.some((m) => m.side === 'right');

  const leftAnchor = gameState.board[0];
  const rightAnchor = gameState.board[gameState.board.length - 1];
  const isRoundOver =
    gameState.status === 'domino' ||
    gameState.status === 'win' ||
    gameState.status === 'blocked';

  return (
    <LiveKitRoom
      token={token || undefined}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      connect={Boolean(token)}
      audio={false}
      video={false}
      style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <RemoteAudioRenderer />
      <div className="relative w-full h-screen overflow-hidden select-none bg-[#1c130d] flex flex-col justify-between font-sans m-0 p-0">
        {/* ==========================================
            1. TOP OPPONENT BAR
            ========================================== */}
        <header className="relative z-20 flex items-center justify-between w-full px-8 sm:px-14 pt-1.5 pb-1 shrink-0">
          {opponents.map((opp, idx) => {
            const actualIndex = idx + 1;
            const isOppTurn =
              gameState.status === 'playing' &&
              gameState.currentTurnIndex === actualIndex;

            return (
              <div key={opp.id} className="relative flex flex-col items-center">
                <div
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg bg-[#231c18]/95 border transition-all ${
                    isOppTurn
                      ? 'border-[#e5a93c] shadow-[0_0_12px_rgba(229,169,60,0.45)]'
                      : 'border-white/10'
                  }`}
                >
                  <div className="w-7 h-7 rounded bg-[#382e28] flex items-center justify-center text-base border border-white/10">
                    {opp.avatar}
                  </div>
                  <div className="leading-none pr-1">
                    <p className="text-[10px] font-extrabold text-[#ece3d5] tracking-wider uppercase">
                      {opp.name}
                    </p>
                    <p className="text-[10px] font-bold text-[#d99b26] mt-0.5">
                      {opp.score}
                    </p>
                  </div>
                </div>
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: opp.hand.length }).map((_, tIdx) => (
                    <div
                      key={tIdx}
                      className="w-1.5 h-2.5 rounded-[1px] bg-[#3a5a4b] border border-[#527a68]/60"
                    />
                  ))}
                </div>
                {opp.speechBubble && (
                  <div className="absolute top-11 z-30 w-max max-w-[130px] bg-[#f4efe6] text-[#181512] text-[10px] font-bold px-2.5 py-1.5 rounded shadow-lg border border-black/20 whitespace-pre-line text-center leading-tight">
                    {opp.speechBubble}
                  </div>
                )}
              </div>
            );
          })}
        </header>

        {/* ==========================================
            2. FRAMED TABLE (Metal Grey vs Green Felt)
            ========================================== */}
        <div className="relative flex-1 w-full px-3 sm:px-6 py-1 flex items-center justify-center min-h-0">
          <div
            ref={viewportRef}
            className={`relative w-full h-full rounded-2xl overflow-hidden border-[5px] border-[#5c3a21] shadow-[inset_0_0_70px_rgba(0,0,0,0.75),0_8px_25px_rgba(0,0,0,0.6)] flex items-center justify-center transition-transform duration-150 ${
              slamShake ? 'scale-[1.01] translate-y-0.5' : ''
            }`}
            style={{
              background:
                vsBots || tableId === 'bellagameroom'
                  ? 'radial-gradient(ellipse at center, #4b525d 0%, #2b3038 65%, #181b20 100%)'
                  : 'radial-gradient(ellipse at center, #1b4d3e 0%, #0f2c22 65%, #081711 100%)',
            }}
          >
            <div className="absolute inset-1.5 rounded-xl border border-[#c8963e]/20 pointer-events-none" />

            {/* Table-Affixed Mic Button (Mounted inside the yellow frame area) */}
            <TableMicController />

            {/* Watermark */}
            <div className="absolute inset-x-0 bottom-8 flex flex-col items-center justify-center pointer-events-none opacity-15">
              <span className="text-lg sm:text-xl font-serif font-black tracking-[0.25em] text-amber-200 uppercase">
                BELLA GAME ROOM
              </span>
            </div>

            <div
              className="relative transition-transform duration-300 ease-out"
              style={{
                transform: `scale(${boardMetrics.fitScale}) translate3d(${-boardMetrics.bbox.centerX}px, ${-boardMetrics.bbox.centerY}px, 0)`,
              }}
            >
              {gameState.board.map((placed) => (
                <div
                  key={placed.id}
                  style={{
                    width: `${placed.width}px`,
                    height: `${placed.height}px`,
                    transform: `translate3d(${placed.x - placed.width / 2}px, ${placed.y - placed.height / 2}px, 0)`,
                  }}
                  className={`absolute rounded-[4px] bg-[#ebe4d4] border-[1.5px] border-[#1f1a16] shadow-[0_3px_6px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.8)] flex ${
                    placed.isVertical ? 'flex-col' : 'flex-row'
                  } items-center justify-between overflow-hidden transition-all duration-200`}
                >
                  <div className={placed.isVertical ? 'w-full h-1/2' : 'w-1/2 h-full'}>
                    <SvgPipHalf
                      value={placed.visualPips[0]}
                      isHorizontalTile={!placed.isVertical}
                    />
                  </div>
                  <div
                    className={
                      placed.isVertical
                        ? 'w-4/5 h-[1.5px] bg-[#2c2520]'
                        : 'h-4/5 w-[1.5px] bg-[#2c2520]'
                    }
                  />
                  <div className={placed.isVertical ? 'w-full h-1/2' : 'w-1/2 h-full'}>
                    <SvgPipHalf
                      value={placed.visualPips[1]}
                      isHorizontalTile={!placed.isVertical}
                    />
                  </div>
                </div>
              ))}

              {showLeftEndButton && leftAnchor && (
                <button
                  onClick={() => executeMoveOnSide(selectedTileId!, 'left')}
                  style={{
                    transform: `translate3d(${
                      leftAnchor.x -
                      ((leftAnchor.isRoot ? 'WEST' : leftAnchor.direction) === 'EAST'
                        ? -leftAnchor.width / 2 - 18
                        : leftAnchor.width / 2 + 18) -
                      16
                    }px, ${leftAnchor.y - 16}px, 0)`,
                  }}
                  className="absolute z-30 w-8 h-8 rounded-md bg-[#d99b26] hover:bg-[#eab03e] text-[#181512] font-black text-[11px] border-2 border-[#fff3d1] shadow-[0_0_15px_rgba(217,155,38,0.85)] flex items-center justify-center active:scale-95 transition"
                >
                  &lt; {gameState.openEnds.left}
                </button>
              )}

              {showRightEndButton && rightAnchor && (
                <button
                  onClick={() => executeMoveOnSide(selectedTileId!, 'right')}
                  style={{
                    transform: `translate3d(${
                      rightAnchor.x +
                      ((rightAnchor.isRoot ? 'EAST' : rightAnchor.direction) === 'WEST'
                        ? -rightAnchor.width / 2 - 18
                        : rightAnchor.width / 2 + 18) -
                      16
                    }px, ${rightAnchor.y - 16}px, 0)`,
                  }}
                  className="absolute z-30 w-8 h-8 rounded-md bg-[#d99b26] hover:bg-[#eab03e] text-[#181512] font-black text-[11px] border-2 border-[#fff3d1] shadow-[0_0_15px_rgba(217,155,38,0.85)] flex items-center justify-center active:scale-95 transition"
                >
                  {gameState.openEnds.right} &gt;
                </button>
              )}
            </div>

            {/* ACTION PILL */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20">
              {isMyTurn && legalMoves.length === 0 ? (
                <button
                  onClick={handlePassAction}
                  className="px-4 py-1 rounded bg-[#e8dfd1] hover:bg-white text-[#181512] font-extrabold text-[11px] tracking-wider uppercase shadow-lg border border-black/30 active:scale-95 transition"
                >
                  NO TILE FITS: PASS
                </button>
              ) : isMyTurn && selectedTileId && (showLeftEndButton || showRightEndButton) ? (
                <button
                  onClick={() =>
                    executeMoveOnSide(
                      selectedTileId,
                      selectedTileMoves[0]?.side || 'right'
                    )
                  }
                  className="px-4 py-1 rounded bg-[#d99b26] hover:bg-[#eab03e] text-[#181512] font-extrabold text-[11px] tracking-wider uppercase shadow-md border border-[#fff3d1]/50 active:scale-95 transition"
                >
                  {showLeftEndButton && showRightEndButton
                    ? 'PICK AN END'
                    : 'TAP AGAIN OR CLICK END TO PLAY'}
                </button>
              ) : isMyTurn ? (
                <div className="px-3.5 py-0.5 rounded bg-[#d99b26] text-[#181512] font-extrabold text-[10px] tracking-wider uppercase shadow">
                  PICK A TILE
                </div>
              ) : null}
            </div>

            {/* FLASH OVERLAY */}
            {isRoundOver && endOverlayPhase === 'flash' && (
              <div className="absolute inset-0 z-40 bg-black/35 flex items-center justify-center pointer-events-none animate-pulse">
                <h2 className="text-5xl sm:text-6xl font-black italic tracking-wider text-[#f3b23a] drop-shadow-[0_6px_12px_rgba(0,0,0,0.95)] uppercase">
                  {gameState.status === 'domino'
                    ? 'DOMINO!'
                    : gameState.status === 'win'
                    ? 'WIN!'
                    : 'BLOCKED!'}
                </h2>
              </div>
            )}

            {/* SCOREBOARD MODAL */}
            {isRoundOver && endOverlayPhase === 'scoreboard' && (
              <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-center justify-center p-1 sm:p-2">
                <div className="w-full max-w-3xl rounded-xl bg-[#1f1712] border-2 border-[#d99b26] shadow-2xl p-2 flex flex-col justify-between max-h-[96vh]">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1 px-1">
                    <div>
                      <h3 className="text-xs font-black text-[#f3b23a] tracking-wider uppercase">
                        Round {gameState.roundNumber} Scoreboard —{' '}
                        {gameState.status === 'domino'
                          ? 'Domino'
                          : gameState.status === 'win'
                          ? 'Win'
                          : 'Blocked'}
                      </h3>
                      <p className="text-[9px] text-[#b8ab99] font-semibold">
                        {gameState.status === 'domino'
                          ? gameState.wasPrecedingPlayerRisk
                            ? 'Preceding player took a risk with alternate moves available (-6 pts penalty)'
                            : 'Winner bridged both ends (+6 pts); forced opponents (-2 pts each)'
                          : gameState.status === 'win'
                          ? 'Winner emptied hand (+2 pts); others ranked by remaining pips'
                          : gameState.wasForcedBlock
                          ? 'Blocker was forced (+2 pts to lowest pips; others ranked by remaining pips)'
                          : gameState.wasPrecedingPlayerRisk
                          ? 'Preceding player took risk/baited block (+9 pts to preceding player; -9 pts to failed blocker)'
                          : gameState.roundWinnerId === gameState.blockerPlayerId
                          ? 'Successful block (+9 pts to blocker; opponents -3 pts each)'
                          : 'Unsuccessful block (+9 pts to lowest pips; -9 pts to blocker)'}
                      </p>
                    </div>
                    <button
                      onClick={() => setEndOverlayPhase('inspectTable')}
                      className="px-2 py-0.5 rounded bg-[#382e28] hover:bg-[#4a3d35] text-[#ece3d5] font-bold text-[9px] uppercase tracking-wider border border-[#d99b26]/50 shadow active:scale-95 transition shrink-0"
                    >
                      View Table
                    </button>
                  </div>

                  <div className="my-0.5 space-y-0.5">
                    {rankedScoreboardPlayers.map((p, idx) => {
                      const placeLabels = ['1st', '2nd', '3rd', '4th'];
                      const isWinner = p.id === gameState.roundWinnerId;

                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between px-2 py-0.5 rounded-md border ${
                            isWinner
                              ? 'bg-[#2e2318] border-[#f3b23a]/70'
                              : 'bg-[#16110d] border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-[110px]">
                            <span
                              className={`w-5 text-center font-black text-[10px] uppercase ${
                                isWinner ? 'text-[#f3b23a]' : 'text-[#a39788]'
                              }`}
                            >
                              {placeLabels[idx] || `${idx + 1}th`}
                            </span>
                            <span className="text-xs">{p.avatar}</span>
                            <div>
                              <p className="text-[10px] font-extrabold text-[#ece3d5] uppercase leading-none">
                                {p.name}
                              </p>
                              <p className="text-[8px] font-bold text-[#a39788] mt-[1px]">
                                {p.hand.length === 0
                                  ? '0 pips (Out)'
                                  : `${p.remainingPips} pips left`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 overflow-x-auto px-1">
                            {p.hand.length === 0 ? (
                              <span className="px-1.5 py-0.5 rounded bg-[#f3b23a]/20 text-[#f3b23a] font-black text-[8px] uppercase">
                                {gameState.status === 'domino' ? 'DOMINO' : 'WIN'}
                              </span>
                            ) : (
                              p.hand.map((t) => (
                                <div
                                  key={t.id}
                                  className="w-[12px] h-[24px] rounded-[1px] bg-[#ebe4d4] border border-[#1f1a16] flex flex-col items-center justify-between overflow-hidden shrink-0"
                                  title={`${t.pips[0]}-${t.pips[1]} (${
                                    t.pips[0] + t.pips[1]
                                  } pips)`}
                                >
                                  <div className="w-full h-1/2">
                                    <SvgPipHalf value={t.pips[0]} />
                                  </div>
                                  <div className="w-4/5 h-[0.5px] bg-[#2c2520]" />
                                  <div className="w-full h-1/2">
                                    <SvgPipHalf value={t.pips[1]} />
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="text-right min-w-[65px]">
                            <span
                              className={`text-[10px] font-black leading-none block ${
                                p.roundDelta > 0
                                  ? 'text-emerald-400'
                                  : p.roundDelta < 0
                                  ? 'text-rose-400'
                                  : 'text-neutral-400'
                              }`}
                            >
                              {p.roundDelta > 0 ? `+${p.roundDelta}` : p.roundDelta} pts
                            </span>
                            <span className="text-[8px] font-bold text-[#d99b26] leading-none block mt-[2px]">
                              Total: {p.score} pts
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10 px-1">
                    <button
                      onClick={() => setEndOverlayPhase('inspectTable')}
                      className="px-3 py-1 rounded bg-[#382e28] hover:bg-[#4a3d35] text-[#ece3d5] font-bold text-[9px] uppercase tracking-wider border border-white/15 active:scale-95 transition"
                    >
                      Inspect Laid Tiles
                    </button>
                    <button
                      onClick={startNextRound}
                      className="px-4 py-1 rounded bg-[#d99b26] hover:bg-[#eab03e] text-[#181512] font-black text-[9px] uppercase tracking-wider shadow border border-[#fff3d1]/60 active:scale-95 transition"
                    >
                      Next Round
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==========================================
            3. BOTTOM HUD
            ========================================== */}
        <footer className="relative z-20 w-full px-3 sm:px-6 pb-2 pt-1 shrink-0 min-h-[104px] flex items-end">
          <div className="relative w-full h-[92px]">

            {/* CENTERED HAND CONTAINER */}
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 flex items-center justify-center gap-1.5 sm:gap-2 h-full z-10 transition-all duration-300">

              {/* DYNAMIC LOCAL PLAYER CARD */}
              <div className="absolute right-full mr-3 sm:mr-4 bottom-0 flex flex-col justify-end gap-2 shrink-0 h-full transition-all duration-300 z-30">
                {localPlayer.speechBubble && (
                  <div className="absolute bottom-full right-0 mb-2 z-30 w-max bg-[#f4efe6] text-[#181512] text-2xl font-bold px-3 py-1.5 rounded-xl shadow-lg border border-black/20 text-center animate-bounce">
                    {localPlayer.speechBubble}
                  </div>
                )}
                {isMyTurn && legalMoves.length === 0 && (
                  <button
                    onClick={handlePassAction}
                    className="w-full px-4 py-1.5 rounded-lg font-black text-xs uppercase bg-red-600 text-white border-2 border-red-300 shadow-lg hover:bg-red-500 active:scale-95 transition whitespace-nowrap text-center shrink-0"
                  >
                    Pass / Knock
                  </button>
                )}
                <div
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#231c18]/95 border transition-all whitespace-nowrap shrink-0 ${
                    isMyTurn
                      ? 'border-[#e5a93c] shadow-[0_0_15px_rgba(229,169,60,0.4)]'
                      : 'border-white/10'
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-[#382e28] flex items-center justify-center text-xl border border-white/10">
                    {localPlayer.avatar}
                  </div>
                  <div className="leading-tight">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#ece3d5] uppercase">
                        {localPlayer.name}
                      </span>
                      <span className="text-xs font-black text-[#e5a93c]">
                        {localPlayer.score} pts
                      </span>
                    </div>
                    <p className="text-[10px] text-[#a39788] font-semibold mt-0.5 uppercase">
                      ROUND {gameState.roundNumber} • 4P BLOCK
                    </p>
                  </div>
                </div>
              </div>

              {/* Hand Tiles */}
              {isRoundOver ? (
                <div className="flex items-center gap-2.5">
                  {endOverlayPhase === 'inspectTable' && (
                    <button
                      onClick={() => setEndOverlayPhase('scoreboard')}
                      className="px-5 py-2.5 rounded-lg bg-[#382e28] hover:bg-[#4a3d35] text-[#ece3d5] font-black text-xs sm:text-sm tracking-wider uppercase shadow-xl border-2 border-[#d99b26]/70 active:scale-95 transition"
                    >
                      Back to Scoreboard
                    </button>
                  )}
                  <button
                    onClick={startNextRound}
                    className="px-6 py-2.5 rounded-lg bg-[#d99b26] hover:bg-[#eab03e] text-[#181512] font-black text-xs sm:text-sm tracking-wider uppercase shadow-xl border-2 border-[#fff3d1]/60 active:scale-95 transition"
                  >
                    NEXT ROUND
                  </button>
                </div>
              ) : (
                localPlayer.hand.map((tile) => {
                  const isPlayable = isMyTurn && playableTileIds.has(tile.id);
                  const isSelected = selectedTileId === tile.id;

                  return (
                    <button
                      key={tile.id}
                      onClick={() => handleHandTileClick(tile.id)}
                      style={{ width: '46px', height: '92px' }}
                      className={`relative rounded-[6px] bg-[#ebe4d4] border-[2px] border-[#1f1a16] flex flex-col items-center justify-between overflow-hidden transition-all duration-150 shrink-0 ${
                        isSelected
                          ? '-translate-y-2.5 ring-[3px] ring-[#f3b23a] shadow-[0_10px_20px_rgba(0,0,0,0.65)]'
                          : isPlayable
                          ? '-translate-y-1 hover:-translate-y-2 shadow-[0_5px_10px_rgba(0,0,0,0.5)] cursor-pointer'
                          : 'opacity-75 brightness-90 cursor-not-allowed'
                      }`}
                    >
                      <div className="w-full h-1/2">
                        <SvgPipHalf value={tile.pips[0]} />
                      </div>
                      <div className="w-4/5 h-[2px] bg-[#2c2520] shrink-0" />
                      <div className="w-full h-1/2">
                        <SvgPipHalf value={tile.pips[1]} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* RIGHT ZONE: QUEUE + LEAVE TABLE (Clean & Restored) */}
            <div className="absolute right-0 bottom-0 flex flex-col justify-end gap-1.5 w-[140px] shrink-0 h-[92px] z-30">
              <div className="flex flex-col p-1.5 px-2 rounded-lg bg-[#231c18]/95 border border-white/10 shadow-lg flex-1 justify-center">
                <div className="flex items-center justify-between mb-0.5 pb-0.5 border-b border-white/5">
                  <span className="text-[9px] font-black text-[#a39788] uppercase tracking-wider">Queue</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[9px] font-bold text-[#ece3d5]">
                    <span>1. HIEU</span>
                    <span className="text-[#d99b26] text-[7px] uppercase">Ready</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-bold text-[#ece3d5]">
                    <span>2. MINH</span>
                    <span className="text-[#a39788] text-[7px] uppercase">Lobby</span>
                  </div>
                </div>
              </div>
              <button
                className="w-full py-1.5 rounded-lg font-black text-[9px] uppercase bg-[#382e28] hover:bg-red-600 hover:border-red-400 text-[#ece3d5] hover:text-white border border-white/10 shadow-lg active:scale-95 transition shrink-0"
                onClick={() => { window.location.href = window.location.origin + window.location.pathname; }}
              >
                Leave Table
              </button>
            </div>

          </div>
        </footer>
      </div>
    </LiveKitRoom>
  );
}