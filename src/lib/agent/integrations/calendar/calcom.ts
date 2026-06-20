import type { CalendarProvider, CalendarSlot, BookingInput, BookingResult } from './types';

export interface CalcomConfig {
  apiKey: string;
  eventTypeId: number;
  durationMin: number;
}

const API_BASE = 'https://api.cal.com';
const API_VERSION = '2024-08-13';
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
    url.searchParams.set('dateFrom', fromISO);
    url.searchParams.set('dateTo', toISO);
    url.searchParams.set('timeZone', timezone);

    const response = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': API_VERSION,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Cal.com API error: ${response.status} ${response.statusText}`);
    }

    interface SlotsResponse {
      status: string;
      data: Record<string, string[] | Array<{ start: string; end: string }>>;
    }

    const json = (await response.json()) as SlotsResponse;

    const slots: CalendarSlot[] = [];

    // Flatten the data object (date -> slots array) into CalendarSlot[]
    for (const dateKey in json.data) {
      const daySlots = json.data[dateKey];
      if (!Array.isArray(daySlots)) continue;

      for (const slot of daySlots) {
        let startISO: string;
        let endISO: string;

        if (typeof slot === 'string') {
          // Default format: slot is an ISO string
          startISO = slot;
          // Compute endISO by adding durationMin to startISO
          const startDate = new Date(slot);
          const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);
          endISO = endDate.toISOString();
        } else if (typeof slot === 'object' && 'start' in slot && 'end' in slot) {
          // Range format: slot has start and end
          startISO = slot.start;
          endISO = slot.end;
        } else {
          continue;
        }

        slots.push({ startISO, endISO });
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
      },
    };

    const response = await fetchWithTimeout(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': API_VERSION,
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
