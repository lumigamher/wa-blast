import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { makeCalcomProvider } from './calcom';

describe('Cal.com provider', () => {
  const config = {
    apiKey: 'test-api-key',
    eventTypeId: 123,
    durationMin: 30,
  };

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSlots', () => {
    it('should fetch and flatten available slots in default format (ISO strings)', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          '2026-06-20': [
            '2026-06-20T09:00:00.000+02:00',
            '2026-06-20T10:00:00.000+02:00',
            '2026-06-20T11:00:00.000+02:00',
          ],
          '2026-06-21': [
            '2026-06-21T14:00:00.000+02:00',
            '2026-06-21T15:00:00.000+02:00',
          ],
        },
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const provider = makeCalcomProvider(config);
      const slots = await provider.getSlots({
        fromISO: '2026-06-20T00:00:00Z',
        toISO: '2026-06-21T23:59:59Z',
        timezone: 'Europe/Madrid',
      });

      expect(slots).toHaveLength(5);
      expect(slots[0].startISO).toBe('2026-06-20T09:00:00.000+02:00');
      // endISO should be 30 minutes (config.durationMin) after startISO
      const startDate = new Date('2026-06-20T09:00:00.000+02:00');
      const expectedEnd = new Date(startDate.getTime() + 30 * 60 * 1000);
      expect(slots[0].endISO).toBe(expectedEnd.toISOString());
      expect(slots[1].startISO).toBe('2026-06-20T10:00:00.000+02:00');
      expect(slots[4].startISO).toBe('2026-06-21T15:00:00.000+02:00');

      // Verify fetch was called with correct params
      const callUrl = (vi.mocked(globalThis.fetch).mock.calls[0]?.[0] as string) || '';
      expect(callUrl).toContain('api.cal.com/v2/slots');
      expect(callUrl).toContain('eventTypeId=123');
      expect(callUrl).toContain('timeZone=Europe%2FMadrid');
    });

    it('should handle range format slots with start/end fields', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          '2026-06-20': [
            {
              start: '2026-06-20T09:00:00Z',
              end: '2026-06-20T09:30:00Z',
              attendeesCount: 0,
            },
            {
              start: '2026-06-20T10:00:00Z',
              end: '2026-06-20T10:30:00Z',
              attendeesCount: 0,
            },
          ],
        },
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const provider = makeCalcomProvider(config);
      const slots = await provider.getSlots({
        fromISO: '2026-06-20T00:00:00Z',
        toISO: '2026-06-21T23:59:59Z',
        timezone: 'UTC',
      });

      expect(slots).toHaveLength(2);
      expect(slots[0].startISO).toBe('2026-06-20T09:00:00Z');
      expect(slots[0].endISO).toBe('2026-06-20T09:30:00Z');
      expect(slots[1].startISO).toBe('2026-06-20T10:00:00Z');
      expect(slots[1].endISO).toBe('2026-06-20T10:30:00Z');
    });

    it('should return empty array when no slots are available', async () => {
      const mockResponse = {
        status: 'success',
        data: {},
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const provider = makeCalcomProvider(config);
      const slots = await provider.getSlots({
        fromISO: '2026-06-20T00:00:00Z',
        toISO: '2026-06-21T23:59:59Z',
        timezone: 'UTC',
      });

      expect(slots).toEqual([]);
    });

    it('should cap slots at 500 to prevent abuse', async () => {
      const largeSlotArray = Array.from({ length: 600 }, (_, i) =>
        `2026-06-20T${String(9 + Math.floor(i / 60)).padStart(2, '0')}:${String((i % 60) * 1).padStart(2, '0')}:00Z`
      );

      const mockResponse = {
        status: 'success',
        data: {
          '2026-06-20': largeSlotArray,
        },
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const provider = makeCalcomProvider(config);
      const slots = await provider.getSlots({
        fromISO: '2026-06-20T00:00:00Z',
        toISO: '2026-06-21T23:59:59Z',
        timezone: 'UTC',
      });

      expect(slots.length).toBe(500);
    });

    it('should include correct auth headers', async () => {
      const mockResponse = {
        status: 'success',
        data: {},
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const provider = makeCalcomProvider(config);
      await provider.getSlots({
        fromISO: '2026-06-20T00:00:00Z',
        toISO: '2026-06-21T23:59:59Z',
        timezone: 'UTC',
      });

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1]?.headers).toMatchObject({
        Authorization: 'Bearer test-api-key',
        'cal-api-version': '2024-08-13',
      });
    });

    it('should throw on API error', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 })
      );

      const provider = makeCalcomProvider(config);

      await expect(
        provider.getSlots({
          fromISO: '2026-06-20T00:00:00Z',
          toISO: '2026-06-21T23:59:59Z',
          timezone: 'UTC',
        })
      ).rejects.toThrow('Cal.com API error: 401');
    });
  });

  describe('createBooking', () => {
    it('should create a booking and return bookingId + startISO', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          id: 12345,
          uid: 'booking-uid-abc123',
          start: '2026-06-20T09:00:00Z',
          end: '2026-06-20T09:30:00Z',
          title: 'Test Booking',
          status: 'ACCEPTED',
        },
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 201 })
      );

      const provider = makeCalcomProvider(config);
      const result = await provider.createBooking({
        startISO: '2026-06-20T09:00:00Z',
        name: 'John Doe',
        email: 'john@example.com',
        timezone: 'UTC',
      });

      expect(result.ok).toBe(true);
      expect(result).toEqual({
        ok: true,
        bookingId: 'booking-uid-abc123',
        startISO: '2026-06-20T09:00:00Z',
      });

      // Verify POST request
      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1]?.method).toBe('POST');
      const body = JSON.parse(call[1]?.body as string);
      expect(body.eventTypeId).toBe(123);
      expect(body.start).toBe('2026-06-20T09:00:00Z');
      expect(body.attendee).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        timeZone: 'UTC',
      });
    });

    it('should prefer uid over id for bookingId', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          id: 9999,
          uid: 'preferred-uid',
          start: '2026-06-20T10:00:00Z',
        },
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 201 })
      );

      const provider = makeCalcomProvider(config);
      const result = await provider.createBooking({
        startISO: '2026-06-20T10:00:00Z',
        name: 'Jane Doe',
        email: 'jane@example.com',
        timezone: 'UTC',
      });

      expect(result.ok).toBe(true);
      expect(result).toEqual({
        ok: true,
        bookingId: 'preferred-uid',
        startISO: '2026-06-20T10:00:00Z',
      });
    });

    it('should handle recurring bookings (array response)', async () => {
      const mockResponse = {
        status: 'success',
        data: [
          {
            id: 100,
            uid: 'recurring-booking-1',
            start: '2026-06-20T09:00:00Z',
          },
          {
            id: 101,
            uid: 'recurring-booking-2',
            start: '2026-06-27T09:00:00Z',
          },
        ],
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 201 })
      );

      const provider = makeCalcomProvider(config);
      const result = await provider.createBooking({
        startISO: '2026-06-20T09:00:00Z',
        name: 'Test User',
        email: 'test@example.com',
        timezone: 'UTC',
      });

      expect(result.ok).toBe(true);
      // Should use first element of array
      if (result.ok) {
        expect(result.bookingId).toBe('recurring-booking-1');
        expect(result.startISO).toBe('2026-06-20T09:00:00Z');
      }
    });

    it('should return error on API failure', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response('Invalid event type', { status: 400 })
      );

      const provider = makeCalcomProvider(config);
      const result = await provider.createBooking({
        startISO: '2026-06-20T09:00:00Z',
        name: 'John Doe',
        email: 'john@example.com',
        timezone: 'UTC',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('400');
        expect(result.error).toContain('Invalid event type');
      }
    });

    it('should return error when booking data is missing required fields', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          id: 123,
          // Missing uid and start
        },
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 201 })
      );

      const provider = makeCalcomProvider(config);
      const result = await provider.createBooking({
        startISO: '2026-06-20T09:00:00Z',
        name: 'John Doe',
        email: 'john@example.com',
        timezone: 'UTC',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Missing booking ID or start time');
      }
    });

    it('should include correct headers and send JSON payload', async () => {
      const mockResponse = {
        status: 'success',
        data: {
          uid: 'test-uid',
          start: '2026-06-20T09:00:00Z',
        },
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 201 })
      );

      const provider = makeCalcomProvider(config);
      await provider.createBooking({
        startISO: '2026-06-20T09:00:00Z',
        name: 'John Doe',
        email: 'john@example.com',
        timezone: 'America/New_York',
      });

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1]?.method).toBe('POST');
      expect(call[1]?.headers).toMatchObject({
        Authorization: 'Bearer test-api-key',
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json',
      });
    });
  });

  describe('timeout handling', () => {
    it('should use AbortController for timeout', async () => {
      const mockResponse = {
        status: 'success',
        data: {},
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const provider = makeCalcomProvider(config);
      await provider.getSlots({
        fromISO: '2026-06-20T00:00:00Z',
        toISO: '2026-06-21T23:59:59Z',
        timezone: 'UTC',
      });

      // Verify that fetch was called with an AbortSignal
      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1]?.signal).toBeDefined();
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
