export type CalendarSlot = { startISO: string; endISO: string };

export type BookingInput = {
  startISO: string;
  name: string;
  email: string;
  timezone: string;
};

export type BookingResult =
  | { ok: true; bookingId: string; startISO: string }
  | { ok: false; error: string };

export interface CalendarProvider {
  /** Slots disponibles entre dos fechas (ISO). */
  getSlots(input: { fromISO: string; toISO: string; timezone: string }): Promise<CalendarSlot[]>;
  /** Crea una reserva en un slot. */
  createBooking(input: BookingInput): Promise<BookingResult>;
}
