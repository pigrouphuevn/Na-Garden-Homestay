
import { Room } from './types.ts';

export const ROOMS: Room[] = [
  { id: 'g1', name: 'Garden 1', type: 'đơn' },
  { id: 'g2', name: 'Garden 2', type: 'đơn' },
  { id: 'g3', name: 'Garden 3', type: 'đôi' },
  { id: 'g4', name: 'Garden 4', type: 'đơn' },
  { id: 'g5', name: 'Garden 5', type: 'đơn' },
  { id: 'g6', name: 'Garden 6', type: 'đôi' },
  { id: 'g7', name: 'Garden 7', type: 'đơn' },
  { id: 'g8', name: 'Garden 8', type: 'ba' },
];

export const FIELDS = [
  { key: 'guestName', label: 'Tên' },
  { key: 'channel', label: 'Kênh' },
  { key: 'price', label: 'Tiền' },
  { key: 'deposit', label: 'Cọc' },
  { key: 'phone', label: 'Số ĐT' },
  { key: 'arrivalTime', label: 'Giờ đến' },
];

export const COLORS = [
  'bg-blue-100', 'bg-green-100', 'bg-yellow-100', 'bg-purple-100',
  'bg-pink-100', 'bg-orange-100', 'bg-teal-100', 'bg-indigo-100',
  'bg-red-100', 'bg-slate-100'
];

export const TEXT_COLORS = [
  'text-blue-800', 'text-green-800', 'text-yellow-800', 'text-purple-800',
  'text-pink-800', 'text-orange-800', 'text-teal-800', 'text-indigo-800',
  'text-red-800', 'text-slate-800'
];

export const VI_DAYS = ['CN', 'TH2', 'TH3', 'TH4', 'TH5', 'TH6', 'TH7'];
