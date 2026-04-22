
export interface BookingData {
  guestName: string;
  channel: string;
  price: number;
  deposit: number;
  phone: string;
  arrivalTime: string;
  color: string;
}

export interface DayBookings {
  [roomId: string]: BookingData;
}

export interface StoreState {
  [dateKey: string]: DayBookings;
}

export interface Room {
  id: string;
  name: string;
  type: 'đơn' | 'đôi' | 'ba';
}
