"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  sentences: string[];
  speed?: number;
  pauseBetween?: number;
  startDelay?: number;
  onDone?: () => void;
};

export function TypewriterSequence({
  sentences,
  speed = 55,
  pauseBetween = 600,
  startDelay = 400,
  onDone,
}: Props) {
  const [typed, setTyped] = useState<string[]>(() => sentences.map(() => ""));
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let i = 0;
    let j = 0;

    function step() {
      if (cancelled) return;
      if (i >= sentences.length) {
        onDoneRef.current?.();
        return;
      }
      const cur = sentences[i];
      if (j < cur.length) {
        j += 1;
        setTyped((prev) => {
          const next = prev.slice();
          next[i] = cur.slice(0, j);
          return next;
        });
        timer = setTimeout(step, speed);
      } else {
        i += 1;
        j = 0;
        timer = setTimeout(step, pauseBetween);
      }
    }

    timer = setTimeout(step, startDelay);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sentences, speed, pauseBetween, startDelay]);

  // Cursor lives on the latest non-empty line so it visibly hops down when
  // a new sentence begins.
  let cursorLine = 0;
  for (let i = typed.length - 1; i >= 0; i--) {
    if (typed[i].length > 0) {
      cursorLine = i;
      break;
    }
  }

  return (
    <div className="vibe-landing-typewriter">
      {typed.map((t, idx) => {
        if (t.length === 0) return null;
        const line = sentences[idx];
        // Highlight the closing period in coral once the line is fully typed,
        // mirroring the brand's vibe[orange dot] logo.
        const finished = t.length === line.length && line.endsWith(".");
        const head = finished ? t.slice(0, -1) : t;
        return (
          <div key={idx} className="vibe-landing-typewriter-line">
            <span>{head}</span>
            {finished ? (
              <span className="vibe-landing-typewriter-dot">.</span>
            ) : null}
            {idx === cursorLine ? (
              <span className="vibe-landing-typewriter-cursor" aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
