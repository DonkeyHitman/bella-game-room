'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { MEMBERS, Member } from '@/lib/members';

export type TableRoomId = 'yatescastle' | 'charrington';
export type RoomId = TableRoomId | 'bellagameroom';
export type SeatPosition = 'north' | 'south' | 'east' | 'west';

const MASTER_PIN = '0143';
const HOST_ADMIN_PIN = '0527';
const OFFICIAL_SCORING_START = new Date('2026-11-07T18:00:00-05:00').getTime();

interface TableRoom {
  id: TableRoomId;
  name: string;
  theme: {
    feltGradient: string;
    borderColor: string;
    accentColor: string;
    tagBg: string;
  };
  status: 'active' | 'waiting';
  seats: Record<SeatPosition, Member | null>;
}

interface GuestApplication {
  id: string;
  name: string;
  email: string;
  timestamp: number;
}

const ALL_TIME_STATS: Record<string, { matches: number; wins: number }> = {
  TUAN: { matches: 58, wins: 41 },
  NHA: { matches: 62, wins: 42 },
  TIEN: { matches: 50, wins: 31 },
  HUNG: { matches: 38, wins: 23 },
  YEN: { matches: 25, wins: 15 },
  VUONG: { matches: 54, wins: 31 },
  HA: { matches: 40, wins: 22 },
  THANG: { matches: 28, wins: 15 },
  HUYEN: { matches: 34, wins: 17 },
  CHAU: { matches: 32, wins: 16 },
  KIEN_ANH: { matches: 28, wins: 13 },
  HAO: { matches: 25, wins: 11 },
  NAM: { matches: 30, wins: 12 },
  TUYET: { matches: 18, wins: 7 },
  ANH_6: { matches: 22, wins: 12 },
  ANH_QUANG: { matches: 20, wins: 10 },
  LE: { matches: 16, wins: 8 },
};

const getOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function BellaLobby() {
  const [isOfficialScoringActive, setIsOfficialScoringActive] = useState<boolean>(false);

  useEffect(() => {
    setIsOfficialScoringActive(Date.now() >= OFFICIAL_SCORING_START);
    const timer = setInterval(() => {
      setIsOfficialScoringActive(Date.now() >= OFFICIAL_SCORING_START);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const [membersList, setMembersList] = useState<Member[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bella_roster_members');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return MEMBERS;
  });

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Modals
  const [showLedgerModal, setShowLedgerModal] = useState<boolean>(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState<boolean>(false);
  const [registrationTab, setRegistrationTab] = useState<'guest' | 'change_pin' | 'host_admin'>('guest');

  // Keypad Actions
  const [pendingSeat, setPendingSeat] = useState<{ roomId: TableRoomId; pos: SeatPosition } | null>(null);
  const [pendingQueueJoin, setPendingQueueJoin] = useState<boolean>(false);
  const [pendingPracticeVsBots, setPendingPracticeVsBots] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Guest Form
  const [guestName, setGuestName] = useState<string>('');
  const [guestEmail, setGuestEmail] = useState<string>('');
  const [guestSubmitted, setGuestSubmitted] = useState<boolean>(false);

  // Host Admin controls
  const [hostPinInput, setHostPinInput] = useState<string>('');
  const [isHostUnlocked, setIsHostUnlocked] = useState<boolean>(false);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [pendingGuests, setPendingGuests] = useState<GuestApplication[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bella_pending_guests');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  // Change PIN Form
  const [changePinMemberId, setChangePinMemberId] = useState<string>('');
  const [changePinCurrent, setChangePinCurrent] = useState<string>('');
  const [changePinNew, setChangePinNew] = useState<string>('');
  const [changePinSuccess, setChangePinSuccess] = useState<boolean>(false);
  const [changePinError, setChangePinError] = useState<string | null>(null);

  const [waitingList, setWaitingList] = useState<Member[]>([]);

  // Tables
  const [rooms, setRooms] = useState<Record<TableRoomId, TableRoom>>({
    yatescastle: {
      id: 'yatescastle',
      name: 'Yatescastle',
      theme: {
        feltGradient: 'radial-gradient(ellipse at center, #1b4d36 0%, #103424 70%, #071911 100%)',
        borderColor: '#4a2e1b',
        accentColor: '#d99b26',
        tagBg: 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300',
      },
      status: 'waiting',
      seats: { north: null, south: null, east: null, west: null },
    },
    charrington: {
      id: 'charrington',
      name: 'Charrington',
      theme: {
        feltGradient: 'radial-gradient(ellipse at center, #541d27 0%, #361017 70%, #1f070c 100%)',
        borderColor: '#3a1f1b',
        accentColor: '#e07a8b',
        tagBg: 'bg-rose-950/90 border-rose-500/60 text-rose-300',
      },
      status: 'waiting',
      seats: { north: null, south: null, east: null, west: null },
    },
  });

  const persistMembers = (updated: Member[]) => {
    setMembersList(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bella_roster_members', JSON.stringify(updated));
    }
  };

  const persistPendingGuests = (updated: GuestApplication[]) => {
    setPendingGuests(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bella_pending_guests', JSON.stringify(updated));
    }
  };

  const rankedMembers = useMemo(() => {
    return [...membersList].sort((a, b) => {
      const statsA = ALL_TIME_STATS[a.id] || { matches: 10, wins: 5 };
      const statsB = ALL_TIME_STATS[b.id] || { matches: 10, wins: 5 };
      const winRateA = statsA.wins / (statsA.matches || 1);
      const winRateB = statsB.wins / (statsB.matches || 1);
      return winRateB - winRateA;
    });
  }, [membersList]);

  const numCols = Math.max(7, Math.ceil(rankedMembers.length / 2));

  const totalSeatedCount =
    Object.values(rooms.yatescastle.seats).filter(Boolean).length +
    Object.values(rooms.charrington.seats).filter(Boolean).length;

  const handleSeatClick = (roomId: TableRoomId, pos: SeatPosition) => {
    if (!selectedMember) {
      alert('Please select your member name from the directory first before choosing a seat. If you are not yet a member, please use the Registration button to apply for membership.');
      return;
    }

    setPendingSeat({ roomId, pos });
    setPendingQueueJoin(false);
    setPendingPracticeVsBots(false);
    setPinInput('');
    setPinError(null);
  };

  const handlePlayVsBotsClick = () => {
    if (!selectedMember) {
      alert('Please tap your name from the directory first to select your profile.');
      return;
    }
    setPendingPracticeVsBots(true);
    setPendingSeat(null);
    setPendingQueueJoin(false);
    setPinInput('');
    setPinError(null);
  };

  const handleKeypadPress = (digit: string) => {
    if (pinInput.length < 4) {
      const nextPin = pinInput + digit;
      setPinInput(nextPin);
      setPinError(null);

      if (nextPin.length === 4) {
        verifyPinAndSeat(nextPin);
      }
    }
  };

  const verifyPinAndSeat = (pinToCheck: string) => {
    if (!selectedMember) return;

    const isMaster = pinToCheck === MASTER_PIN;
    const isMemberPinValid = selectedMember.pin === pinToCheck;

    if (!isMaster && !isMemberPinValid) {
      setPinError(`Incorrect PIN for ${selectedMember.name}`);
      setTimeout(() => setPinInput(''), 750);
      return;
    }

    if (pendingPracticeVsBots) {
      setPendingPracticeVsBots(false);
      setPinInput('');
      window.location.href = `/?table=bellagameroom&seat=south&member=${encodeURIComponent(selectedMember.id)}&vsBots=true`;
      return;
    }

    if (pendingQueueJoin) {
      if (waitingList.some((m) => m.id === selectedMember.id)) {
        setPinError('Already on waiting list.');
        setTimeout(() => setPinInput(''), 1000);
        return;
      }
      setWaitingList((prev) => [...prev, selectedMember]);
      setPendingQueueJoin(false);
      setPinInput('');
      return;
    }

    if (pendingSeat) {
      const { roomId, pos } = pendingSeat;
      setRooms((prev) => {
        const next = { ...prev };
        next[roomId].seats[pos] = selectedMember;
        const count = Object.values(next[roomId].seats).filter(Boolean).length;
        if (count === 4) next[roomId].status = 'active';
        return next;
      });

      setPendingSeat(null);
      setPinInput('');
      window.location.href = `/?table=${roomId}&seat=${pos}&member=${encodeURIComponent(selectedMember.id)}`;
    }
  };

  const handleSubmitGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !guestEmail.trim()) return;

    const newApp: GuestApplication = {
      id: guestName.trim().toUpperCase().replace(/\s+/g, '_'),
      name: guestName.trim().toUpperCase(),
      email: guestEmail.trim(),
      timestamp: Date.now(),
    };

    persistPendingGuests([newApp, ...pendingGuests]);
    setGuestSubmitted(true);

    setTimeout(() => {
      setGuestSubmitted(false);
      setGuestName('');
      setGuestEmail('');
      setShowRegistrationModal(false);
      alert('Application submitted! Once approved by Host, your button will appear.');
    }, 1200);
  };

  const handleHostAddMember = (name: string, pin: string = '0143') => {
    const cleanName = name.trim().toUpperCase();
    if (!cleanName) return;
    const id = cleanName.replace(/\s+/g, '_');

    if (membersList.some((m) => m.name === cleanName || m.id === id)) {
      alert('Member already exists on the board.');
      return;
    }

    const newM: Member = {
      id,
      name: cleanName,
      pin: pin.trim() || '0143',
      avatar: '🎲',
    };

    const updated = [...membersList, newM];
    persistMembers(updated);
    setNewMemberName('');
    alert(`Member "${cleanName}" added!`);
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setChangePinError(null);
    setChangePinSuccess(false);

    const member = membersList.find((m) => m.id === changePinMemberId);
    if (!member) {
      setChangePinError('Member not found.');
      return;
    }

    if (member.pin !== changePinCurrent && changePinCurrent !== MASTER_PIN) {
      setChangePinError('Current PIN is incorrect.');
      return;
    }

    if (!/^\d{4}$/.test(changePinNew)) {
      setChangePinError('New PIN must be exactly 4 digits.');
      return;
    }

    const updated = membersList.map((m) => (m.id === member.id ? { ...m, pin: changePinNew } : m));
    persistMembers(updated);

    setChangePinSuccess(true);
    setTimeout(() => {
      setChangePinCurrent('');
      setChangePinNew('');
      setChangePinSuccess(false);
      setShowRegistrationModal(false);
    }, 1200);
  };

  const isKeypadOpen = Boolean(pendingSeat || pendingQueueJoin || pendingPracticeVsBots);

  return (
    <div
      style={{
        backgroundColor: '#373c44',
        backgroundImage: `
          repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.05) 0px, rgba(255, 255, 255, 0.05) 2px, transparent 2px, transparent 8px),
          repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.22) 0px, rgba(0, 0, 0, 0.22) 2px, transparent 2px, transparent 8px),
          radial-gradient(ellipse at 50% 35%, #565d6a 0%, #3a3f47 55%, #1f2227 100%)
        `,
        backgroundBlendMode: 'overlay, overlay, normal',
      }}
      className="relative w-full h-dvh overflow-hidden select-none flex flex-col justify-between font-sans m-0 px-2 py-1 sm:px-3 sm:py-1.5 text-[#e2e8f0]"
    >
      {/* HEADER */}
      <header className="flex items-center justify-between pb-1 border-b border-white/15 shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xs sm:text-base font-serif font-black tracking-widest text-[#f59e0b] uppercase drop-shadow-sm">
            BELLA GAME ROOM
          </h1>
          <span className="text-[8px] sm:text-[9px] text-[#cbd5e1] font-bold tracking-wider uppercase border-l border-white/20 pl-2">
            Seated: {totalSeatedCount}/8
          </span>
          {!isOfficialScoringActive && (
            <span className="hidden sm:inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              TEST MATCH MODE
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={handlePlayVsBotsClick}
            className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-[#3b4252] hover:bg-[#4a5366] text-amber-300 border border-amber-400/50 shadow-sm cursor-pointer transition active:scale-95"
          >
            Play vs 3 Bots
          </button>

          <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#20242b]/90 border border-white/20 shadow-sm">
            <span className="text-[8px] text-[#94a3b8] font-bold uppercase">Waitlist:</span>
            <span className="text-[9px] font-mono font-black text-[#f59e0b]">{waitingList.length}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (totalSeatedCount < 8) {
                alert('Seats are available at the tables. Please select an open "+ Sit" seat.');
                return;
              }
              if (!selectedMember) {
                setRegistrationTab('guest');
                setShowRegistrationModal(true);
                return;
              }
              setPendingQueueJoin(true);
              setPendingSeat(null);
              setPendingPracticeVsBots(false);
              setPinInput('');
              setPinError(null);
            }}
            className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition ${
              totalSeatedCount < 8
                ? 'bg-[#20242b]/80 text-[#94a3b8] border border-white/10 opacity-70 cursor-pointer'
                : 'bg-gradient-to-r from-[#d97706] via-[#f59e0b] to-[#b45309] hover:brightness-110 active:scale-95 text-[#0f172a] border border-[#fef3c7] cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse'
            }`}
          >
            Join Waiting List
          </button>

          <button
            onClick={() => {
              setRegistrationTab('guest');
              setShowRegistrationModal(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-[#20242b]/90 border border-white/20 hover:border-[#f59e0b] text-[9px] font-bold uppercase tracking-wider text-[#e2e8f0] transition shadow-sm cursor-pointer"
          >
            Registration
          </button>

          <button
            onClick={() => setShowLedgerModal(true)}
            className="px-2.5 py-1 rounded-lg bg-[#20242b]/90 border border-[#f59e0b]/60 hover:border-[#f59e0b] text-[#f59e0b] text-[9px] font-black uppercase tracking-wider transition shadow-sm cursor-pointer"
          >
            Ledger
          </button>
        </div>
      </header>

      {/* STRICT 2-ROW DIRECTORY */}
      <div className="shrink-0 w-full p-1 border border-white/15 bg-[#1f232a]/90 backdrop-blur-sm rounded-xl my-0.5 shadow-md">
        <div className="flex items-center justify-between pb-0.5 px-1">
          <span className="text-[7.5px] sm:text-[8px] font-bold uppercase tracking-widest text-[#94a3b8]">
            {selectedMember
              ? `Selected: ${selectedMember.name} • Tap "+ Sit" or "Play vs 3 Bots"`
              : 'Step 1: Tap your name below to select your profile'}
          </span>
          {selectedMember && (
            <button
              onClick={() => setSelectedMember(null)}
              className="text-[7.5px] text-amber-400 hover:underline uppercase font-bold"
            >
              Clear
            </button>
          )}
        </div>

        <div
          className="grid gap-0.5 sm:gap-1 w-full"
          style={{
            gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
            gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr))`,
            gridAutoFlow: 'column',
          }}
        >
          {rankedMembers.map((m, idx) => {
            const rankLabel = getOrdinal(idx + 1);
            const isSelected = selectedMember?.id === m.id;

            return (
              <button
                type="button"
                key={m.id}
                onClick={() => setSelectedMember(m)}
                className={`flex items-center justify-between px-1 py-0.5 rounded text-[8px] sm:text-[9px] shadow-xs cursor-pointer transition-all overflow-hidden ${
                  isSelected
                    ? 'bg-[#f59e0b] text-[#0f172a] ring-1 ring-[#fef3c7] scale-[1.02] shadow-[0_0_8px_rgba(245,158,11,0.6)] font-black'
                    : 'bg-[#2b303a]/90 hover:bg-[#384050] text-[#f8fafc] border border-white/10'
                }`}
              >
                <div className="flex items-center gap-0.5 truncate">
                  <span
                    className={`font-mono font-black text-[7px] sm:text-[8px] ${
                      isSelected
                        ? 'text-[#0f172a]'
                        : idx === 0
                        ? 'text-[#fbbf24]'
                        : idx === 1
                        ? 'text-slate-100'
                        : idx === 2
                        ? 'text-[#f97316]'
                        : 'text-[#94a3b8]'
                    }`}
                  >
                    {rankLabel}
                  </span>
                  <span className="font-extrabold uppercase truncate tracking-tight">
                    {m.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* DUAL TABLES */}
      <div className="flex-1 flex items-center justify-center min-h-0 w-full py-0.5">
        <div className="grid grid-cols-2 gap-2 sm:gap-4 w-full max-w-6xl h-full items-center">
          <TableDisplayCard
            room={rooms.yatescastle}
            onClaimSeat={(pos) => handleSeatClick('yatescastle', pos)}
          />
          <TableDisplayCard
            room={rooms.charrington}
            onClaimSeat={(pos) => handleSeatClick('charrington', pos)}
          />
        </div>
      </div>

      {/* FOOTER */}
      <footer className="shrink-0 flex items-center justify-between pt-0.5 border-t border-white/15 text-[7.5px] sm:text-[8px] text-[#94a3b8] uppercase tracking-wider">
        <span>B.E.L.L.A. Real-Time Engine</span>
        <span>
          {isOfficialScoringActive
            ? 'Official Scoring Active'
            : 'Test Matches Only • Official Scoring Starts Nov 7 @ 6:00 PM EST'}
        </span>
      </footer>

      {/* PIN KEYPAD MODAL */}
      {isKeypadOpen && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-[270px] rounded-2xl bg-[#20242b] border-2 border-[#f59e0b] p-4 flex flex-col items-center shadow-2xl">
            <h3 className="text-xs font-black text-[#f1f5f9] tracking-wider uppercase">
              {pendingPracticeVsBots
                ? 'Practice Match (vs Bots)'
                : pendingQueueJoin
                ? 'Waiting List'
                : 'Claim Seat'}
            </h3>
            <p className="text-[9px] text-[#f59e0b] font-bold mt-0.5 text-center uppercase tracking-wide">
              {selectedMember?.name}
            </p>
            <p className="text-[8px] text-[#94a3b8] text-center">
              Enter your 4-digit PIN to confirm
            </p>

            <div className="flex gap-2.5 my-3">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-3 h-3 rounded-full transition-all duration-150 ${
                    pinError
                      ? 'bg-red-500 scale-95'
                      : pinInput.length > idx
                      ? 'bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.7)] scale-110'
                      : 'bg-[#15181d] border border-white/15'
                  }`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5 w-full mb-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleKeypadPress(digit)}
                  className="h-9 rounded-lg bg-[#2f3540] hover:bg-[#3d4554] active:scale-95 text-[#f1f5f9] font-black text-base border border-white/10 transition flex items-center justify-center shadow cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={() => {
                  setPendingSeat(null);
                  setPendingQueueJoin(false);
                  setPendingPracticeVsBots(false);
                  setPinInput('');
                  setPinError(null);
                }}
                className="h-9 rounded-lg bg-transparent hover:bg-white/5 text-[9px] font-bold text-[#94a3b8] uppercase transition flex items-center justify-center cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleKeypadPress('0')}
                className="h-9 rounded-lg bg-[#2f3540] hover:bg-[#3d4554] active:scale-95 text-[#f1f5f9] font-black text-base border border-white/10 transition flex items-center justify-center shadow cursor-pointer"
              >
                0
              </button>
              <button
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="h-9 rounded-lg bg-transparent hover:bg-white/5 text-xs font-bold text-[#f59e0b] transition flex items-center justify-center active:scale-95 cursor-pointer"
              >
                Back
              </button>
            </div>

            {pinError && (
              <span className="text-[9px] font-bold text-red-400 text-center uppercase tracking-wider mb-1">
                {pinError}
              </span>
            )}
          </div>
        </div>
      )}

      {/* REGISTRATION & HOST ADMIN MODAL */}
      {showRegistrationModal && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3">
          <div className="w-full max-w-md rounded-2xl bg-[#20242b] border-2 border-[#f59e0b] p-4 flex flex-col shadow-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between pb-2 border-b border-white/15">
              <div className="flex gap-1.5">
                <button
                  onClick={() => setRegistrationTab('guest')}
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border transition cursor-pointer ${
                    registrationTab === 'guest'
                      ? 'bg-[#f59e0b] text-[#0f172a] border-[#fef3c7]'
                      : 'bg-white/5 text-[#94a3b8] border-white/15'
                  }`}
                >
                  New Member Registration
                </button>
                <button
                  onClick={() => setRegistrationTab('change_pin')}
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border transition cursor-pointer ${
                    registrationTab === 'change_pin'
                      ? 'bg-[#f59e0b] text-[#0f172a] border-[#fef3c7]'
                      : 'bg-white/5 text-[#94a3b8] border-white/15'
                  }`}
                >
                  Change PIN
                </button>
                <button
                  onClick={() => setRegistrationTab('host_admin')}
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border transition cursor-pointer ${
                    registrationTab === 'host_admin'
                      ? 'bg-amber-400 text-[#0f172a] border-[#fef3c7]'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  Host Controls
                </button>
              </div>
              <button
                onClick={() => setShowRegistrationModal(false)}
                className="text-xs font-bold text-[#94a3b8] hover:text-white px-2 py-0.5 rounded bg-white/5 border border-white/10 uppercase cursor-pointer"
              >
                Close
              </button>
            </div>

            {registrationTab === 'guest' && (
              <form onSubmit={handleSubmitGuest} className="flex flex-col gap-2.5 mt-3 text-xs">
                <div>
                  <label className="block text-[9px] font-bold text-[#94a3b8] uppercase mb-0.5">
                    Handle / Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. SANG or ALEX"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#2f3540] border border-white/15 text-[#f1f5f9] focus:border-[#f59e0b] outline-none text-xs uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#94a3b8] uppercase mb-0.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#2f3540] border border-white/15 text-[#f1f5f9] focus:border-[#f59e0b] outline-none text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={guestSubmitted}
                  className="mt-1 py-2 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] text-[#0f172a] font-black uppercase tracking-wider text-xs shadow transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {guestSubmitted ? 'Submitting to Host...' : 'Submit Application'}
                </button>
              </form>
            )}

            {registrationTab === 'change_pin' && (
              <form onSubmit={handleChangePinSubmit} className="flex flex-col gap-2.5 mt-3 text-xs">
                <div>
                  <label className="block text-[9px] font-bold text-[#94a3b8] uppercase mb-0.5">
                    Select Member
                  </label>
                  <select
                    value={changePinMemberId}
                    onChange={(e) => setChangePinMemberId(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#2f3540] border border-white/15 text-[#f1f5f9] focus:border-[#f59e0b] outline-none text-xs"
                  >
                    <option value="">-- Choose Member --</option>
                    {membersList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#94a3b8] uppercase mb-0.5">
                    Current PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    value={changePinCurrent}
                    onChange={(e) => setChangePinCurrent(e.target.value)}
                    placeholder="••••"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#2f3540] border border-white/10 text-[#f1f5f9] font-mono tracking-widest text-center text-xs outline-none focus:border-[#f59e0b]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#94a3b8] uppercase mb-0.5">
                    New 4-Digit PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    value={changePinNew}
                    onChange={(e) => setChangePinNew(e.target.value)}
                    placeholder="••••"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#2f3540] border border-white/10 text-[#f1f5f9] font-mono tracking-widest text-center text-xs outline-none focus:border-[#f59e0b]"
                  />
                </div>

                {changePinError && (
                  <span className="text-[9px] font-bold text-red-400 text-center uppercase tracking-wider">
                    {changePinError}
                  </span>
                )}
                {changePinSuccess && (
                  <span className="text-[9px] font-bold text-emerald-400 text-center uppercase tracking-wider">
                    PIN updated!
                  </span>
                )}

                <button
                  type="submit"
                  className="mt-1 py-2 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] text-[#0f172a] font-black uppercase tracking-wider text-xs shadow transition active:scale-95 cursor-pointer"
                >
                  Update Passcode
                </button>
              </form>
            )}

            {registrationTab === 'host_admin' && (
              <div className="flex flex-col gap-3 mt-3 text-xs">
                {!isHostUnlocked ? (
                  <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#2a2f3a] border border-white/15">
                    <p className="text-[10px] text-amber-300 font-bold uppercase tracking-wider text-center">
                      HOST AUTHENTICATION REQUIRED
                    </p>
                    <p className="text-[9px] text-[#94a3b8] text-center">
                      Enter the Host PIN to manage club members directly.
                    </p>
                    <input
                      type="password"
                      maxLength={4}
                      value={hostPinInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHostPinInput(val);
                        if (val === HOST_ADMIN_PIN) {
                          setIsHostUnlocked(true);
                          setHostPinInput('');
                        }
                      }}
                      placeholder="••••"
                      className="w-32 mx-auto px-2 py-1.5 rounded-lg bg-[#1f232a] border border-amber-500/50 text-[#f59e0b] font-mono text-center tracking-widest text-sm outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="p-2.5 rounded-xl bg-[#2a2f3a] border border-amber-500/40">
                      <h4 className="text-[10px] font-black uppercase text-[#f59e0b] tracking-wider mb-1.5">
                        Add Member Directly to Directory
                      </h4>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newMemberName}
                          onChange={(e) => setNewMemberName(e.target.value)}
                          placeholder="Member Name (e.g. SANG)"
                          className="flex-1 px-2.5 py-1 rounded bg-[#1f232a] border border-white/15 text-xs text-white uppercase outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleHostAddMember(newMemberName)}
                          className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-900 font-black uppercase tracking-wider text-[10px] transition cursor-pointer"
                        >
                          Add Button
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[10px] font-black uppercase text-slate-300 tracking-wider mb-1">
                        Pending Applications ({pendingGuests.length})
                      </h4>
                      {pendingGuests.length === 0 ? (
                        <p className="text-[9px] text-[#94a3b8] italic">No pending applications.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                          {pendingGuests.map((g) => (
                            <div
                              key={g.id}
                              className="flex items-center justify-between p-1.5 rounded bg-[#1f232a] border border-white/10"
                            >
                              <div className="truncate">
                                <span className="font-extrabold text-white text-[10px] uppercase">
                                  {g.name}
                                </span>
                                <span className="text-[8px] text-[#94a3b8] ml-1">({g.email})</span>
                              </div>
                              <button
                                onClick={() => {
                                  handleHostAddMember(g.name);
                                  persistPendingGuests(pendingGuests.filter((x) => x.id !== g.id));
                                }}
                                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[8px] uppercase tracking-wider cursor-pointer"
                              >
                                Approve & Add
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEDGER MODAL */}
      {showLedgerModal && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3">
          <div className="w-full max-w-lg rounded-2xl bg-[#20242b] border-2 border-[#f59e0b] p-4 flex flex-col shadow-2xl max-h-[88vh]">
            <div className="flex items-center justify-between pb-2 border-b border-white/15 shrink-0">
              <div>
                <h3 className="text-sm font-serif font-black text-[#f59e0b] tracking-wider uppercase">
                  Daily Score Ledger
                </h3>
                <p className="text-[9px] text-[#94a3b8] uppercase tracking-wide">Net Zero-Sum Certified</p>
              </div>
              <button
                onClick={() => setShowLedgerModal(false)}
                className="text-xs font-bold text-[#94a3b8] hover:text-white px-2 py-0.5 rounded bg-white/5 border border-white/10 uppercase cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="py-8 text-center text-[#94a3b8]">
              <p className="text-xs font-bold uppercase tracking-wider">Test Mode Active</p>
              <p className="text-[9px] mt-1 text-slate-400">
                Official scoring unlocks Saturday, Nov 7 at 6:00 PM EST.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TableDisplayCard({
  room,
  onClaimSeat,
}: {
  room: TableRoom;
  onClaimSeat: (pos: SeatPosition) => void;
}) {
  const seatedCount = Object.values(room.seats).filter(Boolean).length;

  return (
    <div className="relative w-full h-[180px] sm:h-[210px] md:h-[230px] flex items-center justify-center p-1">
      <div
        className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[420px] h-[95px] sm:h-[120px] md:h-[135px] rounded-[70px] sm:rounded-[85px] border-[4px] sm:border-[5px] shadow-[0_15px_35px_rgba(0,0,0,0.7)] flex flex-col items-center justify-center"
        style={{
          background: room.theme.feltGradient,
          borderColor: room.theme.borderColor,
        }}
      >
        <span className="text-[11px] sm:text-xs md:text-sm font-serif font-black tracking-[0.2em] text-white/90 uppercase drop-shadow-sm">
          {room.name}
        </span>
        <div className="mt-0.5 flex items-center">
          <span className={`text-[7px] sm:text-[8px] font-black tracking-widest uppercase px-2 py-0.2 rounded-full border ${room.theme.tagBg}`}>
            {room.status === 'active' ? 'LIVE (4/4)' : `OPEN (${seatedCount}/4)`}
          </span>
        </div>
      </div>

      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20">
        <MinimalSeatBadge member={room.seats.north} onClaim={() => onClaimSeat('north')} />
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20">
        <MinimalSeatBadge member={room.seats.south} onClaim={() => onClaimSeat('south')} />
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-20">
        <MinimalSeatBadge member={room.seats.west} onClaim={() => onClaimSeat('west')} />
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20">
        <MinimalSeatBadge member={room.seats.east} onClaim={() => onClaimSeat('east')} />
      </div>
    </div>
  );
}

function MinimalSeatBadge({
  member,
  onClaim,
}: {
  member: Member | null;
  onClaim: () => void;
}) {
  if (!member) {
    return (
      <button
        type="button"
        onClick={onClaim}
        className="px-2.5 py-0.5 rounded-lg border border-dashed border-[#f59e0b]/70 hover:border-[#f59e0b] bg-[#20242b]/95 backdrop-blur-sm transition-all hover:scale-105 active:scale-95 shadow-md flex items-center gap-1 cursor-pointer"
      >
        <span className="text-[10px] font-black text-[#f59e0b]">+</span>
        <span className="text-[8px] sm:text-[9px] font-extrabold uppercase text-[#f59e0b] tracking-wider">Sit</span>
      </button>
    );
  }

  return (
    <div className="flex items-center px-2.5 py-0.5 rounded-lg bg-[#20242b]/95 border border-[#f59e0b]/50 shadow-md backdrop-blur-sm">
      <span className="text-[9px] sm:text-[10px] font-black text-[#f1f5f9] uppercase tracking-wide">
        {member.name}
      </span>
    </div>
  );
}
