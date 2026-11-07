export interface Member {
  id: string;
  name: string;
  avatar?: string;
  pin: string;
  role?: string;
}

export const MEMBERS: Member[] = [
  { id: 'NHA', name: 'NHA', avatar: '😎', pin: '1234', role: 'Host' },
  { id: 'TIEN', name: 'TIEN', avatar: '👩🏼‍🎨', pin: '1234' },
  { id: 'TUAN', name: 'TUAN', avatar: '🧔🏽‍♂️', pin: '1234' },
  { id: 'VUONG', name: 'VUONG', avatar: '🕵🏻‍♂️', pin: '1234' },
  { id: 'HA', name: 'HA', avatar: '👩🏻', pin: '1234' },
  { id: 'HUYEN', name: 'HUYEN', avatar: '👩🏼', pin: '1234' },
  { id: 'NAM', name: 'NAM', avatar: '👨🏻', pin: '1234' },
  { id: 'YEN', name: 'YEN', avatar: '👩🏽', pin: '1234' },
  { id: 'TUYET', name: 'TUYET', avatar: '👱🏻‍♀️', pin: '1234' },
  { id: 'HUNG', name: 'HUNG', avatar: '👨🏼', pin: '1234' },
  { id: 'CHAU', name: 'CHAU', avatar: '🧑🏻', pin: '1234' },
  { id: 'KIEN ANH', name: 'KIEN ANH', avatar: '👨🏽', pin: '1234' },
  { id: 'THANG', name: 'THANG', avatar: '🧑🏽', pin: '1234' },
  { id: 'HAO', name: 'HAO', avatar: '👨🏾', pin: '1234' },
];

