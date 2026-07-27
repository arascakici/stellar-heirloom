"use client";

import { useEffect } from "react";

import { report } from "@/lib/incident";

import styles from "./error.module.css";

/**
 * What a page shows when it breaks.
 *
 * Two things matter here and neither is the error. The first is that nothing
 * has happened to anybody's account: heirloom holds nothing, so a page that
 * fails cannot lose a plan, cannot fire one early, and cannot cost anything.
 * Somebody looking at a crash in an app about inheritance deserves to be told
 * that before anything else.
 *
 * The second is that going back is enough. `unstable_retry` re-renders the
 * segment rather than reloading, so the wallet connection survives it.
 */
export default function PageError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    report(error, "page");
  }, [error]);

  return (
    <main className={styles.page}>
      <div className={styles.plate}>
        <h1 className={styles.title}>This page broke</h1>
        <p className={styles.body}>
          Nothing has happened to your account. heirloom never holds your
          assets and cannot move them, so a page that fails cannot lose a plan
          or set one off early — whatever you have sealed is on the chain,
          exactly as you left it.
        </p>
        <p className={styles.body}>
          The failure has been written down without anything that identifies
          you: no address, no plan, no session.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.retry}
            onClick={() => unstable_retry()}
          >
            Try again
          </button>
          {/*
            A plain anchor, not `next/link`, and deliberately so. Retry above is
            already the soft path — it re-renders the segment and keeps the
            wallet connection. This one is the hard path: a client that has just
            thrown may throw again on a soft navigation, so "start over" should
            mean the whole document, freshly.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className={styles.away} href="/">
            Start over
          </a>
        </div>
        {error.digest && (
          <p className={styles.digest}>
            If you report this, the reference is{" "}
            <code className="mono">{error.digest}</code>.
          </p>
        )}
      </div>
    </main>
  );
}
