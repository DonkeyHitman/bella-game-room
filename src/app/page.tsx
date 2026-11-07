'use client';

import React, { useEffect, useState } from 'react';
import BellaLobby from '@/components/BellaLobby';
import BellaGameRoom from '@/components/BellaGameRoom';

export default function Page() {
  const [tableParam, setTableParam] = useState<string | null>(null);
  const [vsBotsParam, setVsBotsParam] = useState<boolean>(false);
  const [seatParam, setSeatParam] = useState<string | null>(null);
  const [memberParam, setMemberParam] = useState<string | null>(null);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    setTableParam(params.get('table'));
    setVsBotsParam(params.get('vsBots') === 'true');
    setSeatParam(params.get('seat'));
    setMemberParam(params.get('member'));
  }, []);

  if (!mounted) return null;

  // If no table parameter is set, render the main club lobby
  if (!tableParam) {
    return <BellaLobby />;
  }

  return (
    <BellaGameRoom 
      tableId={tableParam} 
      currentUserSeat={seatParam || undefined} 
      currentUserId={memberParam || undefined} 
      vsBots={vsBotsParam} 
    />
  );
}