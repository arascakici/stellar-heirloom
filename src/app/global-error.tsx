"use client";

import { useEffect } from "react";

import { report } from "@/lib/incident";

/**
 * The last resort: the root layout itself failed, so there is no top bar, no
 * fonts, and no stylesheet to rely on.
 *
 * Which is why this one is styled inline. A global error that then fails to
 * find its own CSS is a blank white page, and a blank white page in an app
 * about inheritance is the worst thing this project could show anybody. The
 * colours are the wood and parchment written out by hand.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    report(error, "root");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1rem",
          backgroundColor: "#17110c",
          color: "#f2e9da",
          fontFamily: "Georgia, serif",
        }}
      >
        <main style={{ maxWidth: "30rem", textAlign: "left" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
            heirloom could not start
          </h1>
          <p style={{ lineHeight: 1.6, color: "#b8a68d" }}>
            Nothing has happened to your account. heirloom never holds your
            assets and cannot move them, so this is a broken page and nothing
            more — whatever you have sealed is on the chain, exactly as you left
            it.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1rem",
              font: "inherit",
              fontSize: "0.875rem",
              color: "#e0b86e",
              background: "none",
              border: "1px solid #8a6224",
              borderRadius: "2px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
