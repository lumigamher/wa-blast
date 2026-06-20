import type { CalendarProvider, CalendarSlot, BookingInput, BookingResult } from './types';

export interface CalcomConfig {
  apiKey: string;
  eventTypeId: number;
  durationMin: number;
}

const API_BASE = 'https://api.cal.com';
// Cal.com versiona por endpoint: slots usa 2024-09-04 (params start/end,
// data = {date: [{start}]}); bookings usa 2024-08-13.
const SLOTS_API_VERSION = '2024-09-04';
const BOOKINGS_API_VERSION = '2024-08-13';
const TIMEOUT_MS = 8000;

/**
 * Cal.com calendar provider using API v2.
 * Fetches available slots and creates bookings.
 */
export function makeCalcomProvider(config: CalcomConfig): CalendarProvider {
  const { apiKey, eventTypeId, durationMin } = config;

  async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function getSlots(input: { fromISO: string; toISO: string; timezone: string }): Promise<CalendarSlot[]> {
    const { fromISO, toISO, timezone } = input;

    const url = new URL(`${API_BASE}/v2/slots`);
    url.searchParams.set('eventTypeId', String(eventTypeId));
    url.searchParams.set('start', fromISO);
    url.searchParams.set('end', toISO);
    url.searchParams.set('timeZone', timezone);

    const response = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': SLOTS_API_VERSION,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Cal.com API error: ${response.status} ${response.statusText}`);
    }

    interface SlotsResponse {
      status: string;
      // 2024-09-04: data = { "<date>": [{ start }] } (default) o [{ start, end }] (format=range).
      // Toleramos también strings ISO por compatibilidad.
      data: Record<
        string,
        Array<string | { start: string; end?: string }>
      >;
    }

    const json = (await response.json()) as SlotsResponse;

    const slots: CalendarSlot[] = [];
    const computeEnd = (start: string) =>
      new Date(new Date(start).getTime() + durationMin * 60 * 1000).toISOString();

    // Flatten the data object (date -> slots array) into CalendarSlot[]
    for (const dateKey in json.data) {
      const daySlots = json.data[dateKey];
      if (!Array.isArray(daySlots)) continue;

      for (const slot of daySlots) {
        if (typeof slot === 'string') {
          slots.push({ startISO: slot, endISO: computeEnd(slot) });
        } else if (slot && typeof slot === 'object' && slot.start) {
          slots.push({
            startISO: slot.start,
            endISO: slot.end ?? computeEnd(slot.start),
          });
        }
      }
    }

    // Cap at reasonable count to prevent abuse
    return slots.slice(0, 500);
  }

  async function createBooking(input: BookingInput): Promise<BookingResult> {
    const { startISO: requestStartISO, name, email, timezone } = input;

    const url = new URL(`${API_BASE}/v2/bookings`);

    const payload = {
      eventTypeId,
      start: requestStartISO,
      attendee: {
        name,
        email,
        timeZone: timezone,
        language: 'es',
      },
    };

    const response = await fetchWithTimeout(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': BOOKINGS_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: `Cal.com API error: ${response.status} - ${errorText || response.statusText}`,
      };
    }

    interface BookingResponse {
      status: string;
      data: {
        id?: number;
        uid?: string;
        start?: string;
        [key: string]: unknown;
      } | Array<{ id?: number; uid?: string; start?: string; [key: string]: unknown }>;
    }

    const json = (await response.json()) as BookingResponse;
    const bookingData = Array.isArray(json.data) ? json.data[0] : json.data;

    if (!bookingData) {
      return {
        ok: false,
        error: 'No booking data returned',
      };
    }

    const bookingId = bookingData.uid || String(bookingData.id);
    const responseStartISO = bookingData.start;

    if (!bookingId || !responseStartISO) {
      return {
        ok: false,
        error: 'Missing booking ID or start time in response',
      };
    }

    return {
      ok: true,
      bookingId,
      startISO: responseStartISO,
    };
  }

  return {
    getSlots,
    createBooking,
  };
}
