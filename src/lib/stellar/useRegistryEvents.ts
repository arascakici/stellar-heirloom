"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  concerns,
  fetchRegistryEvents,
  type RegistryEvent,
} from "./events";

/** How often the registry is asked what it has seen since we last looked. */
const POLL_MS = 10_000;

/** Nobody scrolls a ledger forever; keep the most recent stretch. */
const KEEP = 12;

type Options = {
  /** The connected account, so its own events can be told apart — and acted on. */
  address: string | null;
  /**
   * Called when an arriving event concerns `address`. This is what makes the
   * page keep up with the chain rather than only with itself: a plan sealed or
   * broken from another device lands here too.
   */
  onOwnEvent?: () => void;
};

type FeedState = {
  events: RegistryEvent[];
  loading: boolean;
  /** Set when the registry cannot be reached; the feed keeps what it had. */
  error: string | null;
};

export function useRegistryEvents({ address, onOwnEvent }: Options): FeedState {
  const [events, setEvents] = useState<RegistryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Where the last read stopped. Kept in a ref so polling never restarts the
  // window just because the component re-rendered.
  const cursor = useRef<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  // Held in refs so a caller passing an inline function does not restart the
  // poll on every render. Written after the render, never during it.
  const notify = useRef(onOwnEvent);
  const watching = useRef(address);
  useEffect(() => {
    notify.current = onOwnEvent;
    watching.current = address;
  });

  const poll = useCallback(async (cancelled: () => boolean) => {
    try {
      const page = await fetchRegistryEvents(cursor.current);
      if (cancelled()) return;

      cursor.current = page.cursor ?? cursor.current;

      const fresh = page.events.filter((event) => !seen.current.has(event.id));
      for (const event of fresh) seen.current.add(event.id);

      setError(null);

      if (fresh.length > 0) {
        // Newest first, and only as much as anyone will read.
        setEvents((current) => [...fresh.reverse(), ...current].slice(0, KEEP));

        const mine = watching.current;
        if (mine && fresh.some((event) => concerns(event, mine))) {
          notify.current?.();
        }
      }
    } catch {
      if (!cancelled()) {
        setError("Could not reach the registry.");
      }
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    const cancelled = () => stopped;

    // The first read is handed to the task queue rather than run inside the
    // effect, so subscribing never lands state changes mid-commit.
    const first = setTimeout(() => void poll(cancelled), 0);
    const id = setInterval(() => void poll(cancelled), POLL_MS);

    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [poll]);

  return { events, loading, error };
}
