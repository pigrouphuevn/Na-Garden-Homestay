/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  format, 
  addDays, 
  startOfWeek, 
  subWeeks, 
  addWeeks, 
  isSameDay, 
  parseISO,
  isValid
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Save, 
  X,
  Trash2,
  ClipboardPaste,
  Copy,
  Info,
  LogOut,
  LogIn,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ROOMS, FIELDS, COLORS, VI_DAYS } from './constants.ts';
import { BookingData, StoreState } from './types.ts';
import { cn } from './lib/utils.ts';
import { auth, db, loginWithGoogle, logout, isFirebaseConfigured } from './lib/firebase.ts';
import { useAuthState } from 'react-firebase-hooks/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc,
  query
} from 'firebase/firestore';

interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: any;
}

const handleFirestoreError = (error: any, operation: FirestoreErrorInfo['operationType'], path: string | null) => {
  if (error.message.includes('Missing or insufficient permissions')) {
    const errorInfo: FirestoreErrorInfo = {
      error: error.message,
      operationType: operation,
      path: path,
      authInfo: auth.currentUser ? {
        userId: auth.currentUser.uid,
        email: auth.currentUser.email,
        emailVerified: auth.currentUser.emailVerified,
        isAnonymous: auth.currentUser.isAnonymous,
        providerInfo: auth.currentUser.providerData
      } : 'Anonymous'
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
};

export default function App() {
  const [user, loadingAuth] = useAuthState(auth);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState<StoreState>({});
  const [editingCell, setEditingCell] = useState<{ date: string; roomId: string } | null>(null);
  const [editData, setEditData] = useState<BookingData | null>(null);
  const [clipboard, setClipboard] = useState<BookingData | null>(null);
  const [showToast, setShowToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistence Logic: Firestore (Sync) or LocalStorage (Fallback)
  useEffect(() => {
    // 1. Initial Load from LocalStorage (always, as a quick start)
    const saved = localStorage.getItem('hotel_bookings_v2');
    if (saved) {
      try {
        setBookings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load local bookings', e);
      }
    }

    if (!isFirebaseConfigured || !user) return;

    // 2. Real-time Sync if Firebase is configured and user is logged in
    const q = query(collection(db, 'bookings'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newBookings: StoreState = {};
      snapshot.forEach((doc) => {
        const data = doc.data() as BookingData & { date: string; roomId: string };
        if (!newBookings[data.date]) newBookings[data.date] = {};
        newBookings[data.date][data.roomId] = {
          guestName: data.guestName,
          channel: data.channel,
          price: data.price,
          deposit: data.deposit,
          phone: data.phone,
          arrivalTime: data.arrivalTime,
          color: data.color
        };
      });
      setBookings(newBookings);
      // Sync local storage as backup
      localStorage.setItem('hotel_bookings_v2', JSON.stringify(newBookings));
    }, (error) => {
      console.error("Firestore sync error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync to local storage for offline use
  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      localStorage.setItem('hotel_bookings_v2', JSON.stringify(bookings));
    }
  }, [bookings, user]);

  // Toast auto-hide
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const dateRange = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 31 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const handlePrevRange = () => setCurrentDate(prev => subWeeks(prev, 1));
  const handleNextRange = () => setCurrentDate(prev => addWeeks(prev, 1));
  const handleToday = () => setCurrentDate(new Date());

  const openEditor = (date: Date, roomId: string) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const existing = bookings[dateKey]?.[roomId] || {
      guestName: '',
      channel: '',
      price: 0,
      deposit: 0,
      phone: '',
      arrivalTime: '',
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
    setEditingCell({ date: dateKey, roomId });
    setEditData(existing);
  };

  const closeEditor = () => {
    setEditingCell(null);
    setEditData(null);
  };

  const handleSave = async () => {
    if (!editingCell || !editData) return;
    
    // Optimistic UI Update
    const newBookings = {
      ...bookings,
      [editingCell.date]: {
        ...(bookings[editingCell.date] || {}),
        [editingCell.roomId]: editData
      }
    };
    setBookings(newBookings);

    if (isFirebaseConfigured && user) {
      const docId = `${editingCell.date}_${editingCell.roomId}`;
      try {
        await setDoc(doc(db, 'bookings', docId), {
          ...editData,
          date: editingCell.date,
          roomId: editingCell.roomId,
          updatedAt: new Date()
        });
      } catch (e: any) {
        handleFirestoreError(e, 'write', `bookings/${docId}`);
        console.error("Save error:", e);
      }
    }
    closeEditor();
  };

  const handleDelete = async () => {
    if (!editingCell) return;

    // Optimistic UI Update
    const newDayData = { ...(bookings[editingCell.date] || {}) };
    delete newDayData[editingCell.roomId];
    setBookings({
      ...bookings,
      [editingCell.date]: newDayData
    });

    if (isFirebaseConfigured && user) {
      const docId = `${editingCell.date}_${editingCell.roomId}`;
      try {
        await deleteDoc(doc(db, 'bookings', docId));
      } catch (e: any) {
        handleFirestoreError(e, 'delete', `bookings/${docId}`);
        console.error("Delete error:", e);
      }
    }
    closeEditor();
  };

  const handleCopy = (e: React.MouseEvent, booking: BookingData) => {
    e.stopPropagation();
    setClipboard({ ...booking });
    setShowToast('Đã copy thông tin đặt phòng');
  };

  const handlePaste = async (e: React.MouseEvent, date: Date, roomId: string) => {
    e.stopPropagation();
    if (!clipboard) return;
    const dateKey = format(date, 'yyyy-MM-dd');

    // Optimistic UI Update
    setBookings(prev => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] || {}),
        [roomId]: { ...clipboard }
      }
    }));

    if (isFirebaseConfigured && user) {
      const docId = `${dateKey}_${roomId}`;
      try {
        await setDoc(doc(db, 'bookings', docId), {
          ...clipboard,
          date: dateKey,
          roomId: roomId,
          updatedAt: new Date()
        });
        setShowToast('Đã dán thông tin đặt phòng');
      } catch (e: any) {
        handleFirestoreError(e, 'write', `bookings/${docId}`);
        console.error("Paste error:", e);
      }
    } else {
      setShowToast('Đã dán thông tin (Chế độ offline)');
    }
  };

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (e: any) {
      setShowToast('Đăng nhập thất bại: Cấu hình Firebase chưa đúng');
    }
  };

  const getDailyTotal = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayData = bookings[dateKey] || {};
    return Object.values(dayData).reduce((sum: number, b: BookingData) => sum + (Number(b.price) || 0), 0);
  };

  const weekTotal = useMemo(() => {
    return dateRange.slice(0, 7).reduce((sum, day) => sum + getDailyTotal(day), 0);
  }, [dateRange, bookings]);

  return (
    <div className="h-screen bg-slate-100 font-sans text-slate-900 flex flex-col overflow-hidden">
      <AnimatePresence>
        {loadingAuth && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4"
          >
            <div className="w-10 h-10 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Đang tải ứng dụng...</span>
          </motion.div>
        )}

        {isFirebaseConfigured && !user && !loadingAuth && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-0 z-[90] bg-slate-50 flex flex-col items-center justify-center p-6"
          >
            <div className="max-w-xs w-full bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center gap-6 border border-slate-100">
              <div className="bg-emerald-600 p-4 rounded-2xl text-white shadow-xl shadow-emerald-100">
                <CalendarIcon size={32} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black uppercase tracking-tighter">Hotel Tracker</h2>
                <p className="text-xs text-slate-400 leading-relaxed">Chào mừng bạn! Vui lòng đăng nhập để quản lý lịch đặt phòng của bạn đồng bộ trên mọi thiết bị.</p>
              </div>
              <button 
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-3 py-3 px-6 bg-slate-900 text-white rounded-xl font-black text-xs uppercase shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                <div className="bg-white p-1 rounded-md">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </div>
                Đăng nhập với Google
              </button>
            </div>
            <div className="mt-8 text-[10px] text-slate-300 font-bold uppercase tracking-widest">
              © 2026 NA Homestay Tracker
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header - Extremely Slim */}
      <header className="bg-white border-b border-slate-200 px-2 py-0.5 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="bg-emerald-600 p-1 rounded text-white shrink-0">
            <CalendarIcon size={10} />
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-[9px] uppercase tracking-tighter leading-none truncate">Hotel Tracker</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-[6px] text-slate-400 font-bold leading-none uppercase">8 Garden Rooms</p>
              {(!isFirebaseConfigured || !user) && (
                <span className="flex items-center gap-0.5 px-1 py-0.5 bg-amber-50 text-amber-600 rounded text-[5px] font-black uppercase ring-1 ring-amber-200">
                  <Info size={6} /> Offline
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 ">
            <div className="flex items-center bg-slate-100 rounded border border-slate-200">
              <button onClick={handlePrevRange} className="p-0.5 hover:bg-white rounded text-slate-500"><ChevronLeft size={10} /></button>
              <button onClick={handleToday} className="px-1.5 py-0.5 text-[7px] font-black uppercase hover:bg-white rounded">Hôm nay</button>
              <button onClick={handleNextRange} className="p-0.5 hover:bg-white rounded text-slate-500"><ChevronRight size={10} /></button>
            </div>
            
            <div className="hidden sm:flex flex-col items-end border-l border-slate-300 pl-2 leading-none">
              <span className="text-[6px] uppercase font-bold text-slate-400">Tổng tuần</span>
              <span className="text-[8px] font-black text-blue-600">{weekTotal.toLocaleString()}đ</span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          {user ? (
            <div className="flex items-center gap-1.5">
              <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-4 h-4 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
              <button onClick={logout} className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-400 hover:text-red-500" title="Đăng xuất">
                <LogOut size={10} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 text-white rounded text-[7px] font-black uppercase hover:bg-slate-800 transition-all">
              <LogIn size={8} /> Login
            </button>
          )}
        </div>

        {clipboard ? (
          <div className="flex items-center gap-1 px-1 py-0.5 bg-blue-50 border border-blue-200 rounded shrink-0">
            <ClipboardPaste size={10} className="text-blue-600" />
            <button onClick={() => setClipboard(null)} className="text-blue-400 hover:text-blue-600"><X size={8} /></button>
          </div>
        ) : (
          <div className="hidden lg:block text-[8px] text-slate-300 font-bold italic uppercase tracking-tighter shrink-0">
            Chuột phải: Copy/Paste
          </div>
        )}
      </header>

      {/* Main Grid - Ultra Slim */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto bg-slate-200 p-0.5 select-none"
      >
        <div className="inline-block bg-white shadow border border-slate-300 relative rounded-sm overflow-hidden">
          <table className="border-collapse table-fixed text-[9px]">
            <thead className="sticky top-0 z-40">
              <tr className="bg-slate-800 text-white h-[28px]">
                <th className="w-[100px] border-r border-slate-700 uppercase tracking-tighter text-left sticky left-0 z-50 bg-slate-800 px-1.5">
                  <span className="text-[7px] text-slate-400 uppercase font-black">PHÒNG</span>
                </th>
                <th className="w-[55px] border-r border-slate-700 bg-slate-700 text-slate-400 uppercase tracking-tighter sticky left-[100px] z-50 text-[7px] text-center font-black">
                  MỤC
                </th>
                {dateRange.map(day => (
                  <th key={day.toString()} className={cn(
                    "w-[110px] border-r border-slate-700 last:border-r-0 leading-none",
                    isSameDay(day, new Date()) ? "bg-blue-600 shadow-inner" : ""
                  )}>
                    <div className="text-[9px] font-black text-white uppercase tracking-tighter mb-0.5">{VI_DAYS[day.getDay()]}</div>
                    <div className="text-[12px] font-black text-white">{format(day, 'dd/MM')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROOMS.map((room, rIdx) => (
                <React.Fragment key={room.id}>
                  {FIELDS.map((field, fIdx) => (
                    <tr key={`${room.id}-${field.key}`} className={cn(
                      "group h-[12.5px] leading-none",
                      fIdx === FIELDS.length - 1 ? "border-b-2 border-slate-300" : "border-b border-slate-100"
                    )}>
                      {fIdx === 0 && (
                        <td 
                          rowSpan={6} 
                          className={cn(
                            "w-[100px] px-1 border-r border-slate-300 font-black sticky left-0 z-30 bg-white leading-none shadow-sm",
                            rIdx % 2 === 0 ? "bg-slate-50" : "bg-white"
                          )}
                        >
                          <div className="flex flex-col gap-0 leading-none">
                            <span className="text-slate-900 text-[8px] truncate tracking-tighter uppercase leading-none">{room.name}</span>
                            <span className={cn(
                              "text-[5px] uppercase font-black leading-none",
                              room.type === 'đơn' ? "text-yellow-600" : 
                              room.type === 'đôi' ? "text-emerald-600" : "text-blue-600"
                            )}>
                              {room.type}
                            </span>
                          </div>
                        </td>
                      )}
                      
                      <td className="border-r border-slate-200 text-[6px] font-black text-slate-400 uppercase bg-slate-50/90 sticky left-[100px] z-30 border-l border-slate-50 text-center leading-none whitespace-nowrap px-0.5">
                        {field.label}
                      </td>

                      {dateRange.map(day => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const booking = bookings[dateKey]?.[room.id];
                        const isBooked = !!booking && booking.guestName;
                        
                        return (
                          <td 
                            key={day.toString()} 
                            className={cn(
                              "px-0.5 border-r border-slate-200 last:border-r-0 font-bold transition-all relative text-center leading-none",
                              isBooked ? booking.color : (clipboard ? "bg-blue-50/40" : "hover:bg-blue-50/20"),
                              isBooked ? "text-slate-900" : "text-transparent"
                            )}
                            onClick={() => openEditor(day, room.id)}
                            onContextMenu={(e) => {
                              if (isBooked) {
                                e.preventDefault();
                                handleCopy(e, booking);
                              } else if (clipboard) {
                                e.preventDefault();
                                handlePaste(e, day, room.id);
                              }
                            }}
                          >
                            <div className="h-full flex items-center justify-center overflow-hidden whitespace-nowrap text-[8px] leading-none px-0.5 relative">
                              {isBooked ? (
                                <>
                                  <span className="truncate w-full block">
                                    {field.key === 'price' || field.key === 'deposit' 
                                      ? booking[field.key as keyof BookingData]?.toLocaleString() 
                                      : booking[field.key as keyof BookingData]}
                                  </span>
                                  {fIdx === 0 && (
                                    <button 
                                      onClick={(e) => handleCopy(e, booking)}
                                      className="absolute right-0 top-0 bottom-0 px-0.5 bg-black/5 hover:bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center border-l border-black/5"
                                      title="Sao chép"
                                    >
                                      <Copy size={8} className="text-slate-700" />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center w-full h-full">
                                  {clipboard && fIdx === 0 ? (
                                    <button 
                                      onClick={(e) => handlePaste(e, day, room.id)}
                                      className="px-1 py-0 bg-blue-600 text-white text-[6px] rounded uppercase font-black opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      Dán
                                    </button>
                                  ) : (
                                    <span className="text-[10px] opacity-0 group-hover:opacity-100 leading-none pointer-events-none">+</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}

              <tr className="bg-slate-100 border-t-2 border-slate-300 sticky bottom-0 z-40 h-[22px] shadow-[0_-2px_6px_rgba(0,0,0,0.1)]">
                <td className="px-1.5 border-r border-slate-300 font-black text-slate-900 uppercase sticky left-0 z-40 bg-slate-100 text-[8px] whitespace-nowrap">
                  TỔNG THU
                </td>
                <td className="border-r border-slate-200 text-[6px] font-black text-slate-400 uppercase bg-slate-50 sticky left-[100px] z-40 text-center leading-none whitespace-nowrap px-0.5">
                  Ngày
                </td>
                {dateRange.map(day => (
                  <td key={day.toString()} className="px-0.5 border-r border-slate-300 text-center last:border-r-0 leading-none">
                    <div className="font-black text-blue-700 text-[8px] leading-none">
                      {getDailyTotal(day).toLocaleString()}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal */}
      <AnimatePresence>
        {editingCell && editData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <Info size={14} className="text-emerald-400" /> Cập Nhật Đặt Phòng
                  </h2>
                  <p className="text-[10px] opacity-60 font-bold uppercase">
                    {ROOMS.find(r => r.id === editingCell.roomId)?.name} • {format(parseISO(editingCell.date), 'dd/MM/yyyy')}
                  </p>
                </div>
                <button onClick={closeEditor} className="p-1 hover:bg-slate-800 rounded-full transition-colors"><X size={18} /></button>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <label className="text-[8px] font-black uppercase text-slate-400">Tên khách</label>
                    <input type="text" value={editData.guestName} onChange={e => setEditData({ ...editData, guestName: e.target.value })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[8px] font-black uppercase text-slate-400">Kênh</label>
                    <input type="text" value={editData.channel} onChange={e => setEditData({ ...editData, channel: e.target.value })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <label className="text-[8px] font-black uppercase text-slate-400">Giá phòng</label>
                    <input type="number" value={editData.price || ''} onChange={e => setEditData({ ...editData, price: Number(e.target.value) })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[8px] font-black uppercase text-slate-400">Tiền cọc</label>
                    <input type="number" value={editData.deposit || ''} onChange={e => setEditData({ ...editData, deposit: Number(e.target.value) })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>

                <div className="space-y-0.5">
                  <label className="text-[8px] font-black uppercase text-slate-400">Số điện thoại</label>
                  <input type="text" value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[8px] font-black uppercase text-slate-400">Giờ đến</label>
                  <input type="text" value={editData.arrivalTime} onChange={e => setEditData({ ...editData, arrivalTime: e.target.value })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-[8px] font-black uppercase text-slate-400">Màu đánh dấu</label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setEditData({ ...editData, color: c })}
                        className={cn(
                          "w-5 h-5 rounded-full border shadow-sm transition-all",
                          c,
                          editData.color === c ? "border-slate-900 scale-125 ring-2 ring-slate-100" : "border-transparent"
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 flex items-center justify-between gap-2 border-t border-slate-200">
                <div className="flex gap-1">
                  <button onClick={handleDelete} className="flex items-center gap-1 px-2 py-1.5 text-[9px] font-black text-red-600 hover:bg-red-50 rounded uppercase tracking-tighter transition-colors" title="Xóa đặt phòng"><Trash2 size={10} /> Xóa</button>
                  {editData.guestName ? (
                    <button onClick={(e) => { handleCopy(e, editData); closeEditor(); }} className="flex items-center gap-1 px-2 py-1.5 text-[9px] font-black text-blue-600 hover:bg-blue-50 rounded uppercase tracking-tighter transition-colors" title="Sao chép thông tin"><Copy size={10} /> Chép</button>
                  ) : clipboard && (
                    <button onClick={() => setEditData({ ...clipboard })} className="flex items-center gap-1 px-2 py-1.5 text-[9px] font-black text-emerald-600 hover:bg-emerald-50 rounded uppercase tracking-tighter transition-colors" title="Dán thông tin đã chép"><ClipboardPaste size={10} /> Dán</button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={closeEditor} className="px-3 py-1.5 text-[9px] font-black text-slate-500 uppercase rounded hover:bg-slate-200">Hủy</button>
                  <button onClick={handleSave} className="flex items-center gap-2 px-5 py-1.5 bg-blue-600 text-white rounded font-black text-[9px] uppercase shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"><Save size={10} /> Lưu</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-2xl flex items-center gap-2 border border-slate-700"
          >
            <Info size={12} className="text-emerald-400" />
            {showToast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
