"use client";

/**
 * The "are you a person" box (Cloudflare Turnstile) on sign-up, sign-in and
 * "send a new email".
 *
 * OFF UNTIL THE KEY IS SET. With NEXT_PUBLIC_TURNSTILE_SITE_KEY unset this
 * renders nothing, loads nothing from Cloudflare and reports nothing, and the
 * form around it behaves exactly as it did before the box existed. Production
 * runs like that until the key is added on Vercel; local sign-in always can.
 * The rules, the two switches and their order are in src/lib/auth/captcha.ts.
 *
 * How a form uses it:
 *   const [human, setHuman] = useState<HumanCheck>(initialHumanCheck);
 *   const humanBox = useRef<TurnstileBoxHandle>(null);
 *   <TurnstileBox ref={humanBox} action="sign-in" onChange={setHuman} />
 *   - the button waits, and says why, while humanCheckWaitLabel(human) is set
 *   - the Supabase call spreads captchaOptions(human) into its `options`
 *   - after EVERY attempt, good or bad: humanBox.current?.reset(). A token
 *     works once, so a second try with the same one is refused.
 *
 * The script. One <script> element made here, never an inline script. The
 * page's code rule lets it run because trusted code created it
 * ('strict-dynamic'). It also carries the page's nonce, which Cloudflare's
 * script hands on to what it loads, and csp.ts lists the host for browsers
 * older than both.
 *
 * Never a dead button. If the script is blocked, the box breaks or it takes
 * too long, the box says so in one sentence with a "Try again", and the form
 * stops waiting (status "unavailable").
 *
 * Nothing is asked of Cloudflare until the box is on screen: a box inside a
 * collapsed section (login's "Need a new confirmation email?") waits for it
 * to open.
 *
 * Phones. Cloudflare's box is never under 300px wide, and the auth card's
 * form column is the screen minus 106: 269px on a 375px iPhone. So on every
 * phone under 406px the 300px box is drawn at full size and shrunk to the
 * column with a CSS scale (turnstileFit in captcha.ts has the numbers), and
 * the scale follows the column when the phone is turned. Only a column under
 * 240px gets Cloudflare's compact box (150 by 140).
 */

import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type JSX, type Ref } from "react";

import {
  HUMAN_CHECK_PATIENCE_MS,
  TURNSTILE_FIT_FULL,
  TURNSTILE_MIN_WIDTH,
  TURNSTILE_PROBLEM_COPY,
  TURNSTILE_SCRIPT_URL,
  turnstileFit,
  turnstileProblem,
  turnstileSiteKey,
  type HumanCheck,
  type HumanCheckAction,
  type TurnstileFit,
  type TurnstileProblem,
  type TurnstileSize,
} from "@/lib/auth/captcha";
import { THEME_EVENT, currentTheme, type ResolvedTheme, type ThemeEventDetail } from "@/lib/theme/theme";

export type TurnstileBoxHandle = {
  /** Throws the token away and runs the check again. Call it after every attempt. */
  reset: () => void;
};

type Props = {
  /** Which form this is, for Cloudflare's own analytics. */
  action: HumanCheckAction;
  /** The form's setter for its HumanCheck state. */
  onChange: (check: HumanCheck) => void;
  ref?: Ref<TurnstileBoxHandle>;
};

/** The part of Cloudflare's `window.turnstile` this file uses. */
type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string | null | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

function turnstileOnPage(): TurnstileApi | null {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile ?? null;
}

let scriptLoad: Promise<TurnstileApi> | null = null;

/**
 * Cloudflare's script, asked for once per page however many boxes there are.
 * A load that failed is forgotten, so "Try again" asks afresh.
 */
function loadTurnstile(): Promise<TurnstileApi> {
  const ready = turnstileOnPage();
  if (ready) return Promise.resolve(ready);
  if (scriptLoad) return scriptLoad;
  scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SCRIPT_URL;
    s.async = true;
    // The nonce Next stamped on its own scripts. Browsers hide the attribute's
    // text but keep the property readable to scripts already on the page.
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    if (nonce) s.nonce = nonce;
    const fail = () => {
      scriptLoad = null;
      s.remove();
      reject(new Error("Turnstile did not load"));
    };
    s.onload = () => {
      const api = turnstileOnPage();
      if (api) resolve(api);
      else fail();
    };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return scriptLoad;
}

export function TurnstileBox(props: Props): JSX.Element | null {
  const siteKey = turnstileSiteKey();
  // Off: nothing on the page and nothing from Cloudflare. `ref` stays null,
  // so the form's `humanBox.current?.reset()` does nothing either.
  if (!siteKey) return null;
  return <LiveBox siteKey={siteKey} {...props} />;
}

function LiveBox({ siteKey, action, onChange, ref }: Props & { siteKey: string }): JSX.Element {
  /** The column the box sits in: measured, never drawn into. */
  const frame = useRef<HTMLDivElement>(null);
  /** What Turnstile draws into. Shrunk to the frame when the frame is under 300px. */
  const holder = useRef<HTMLDivElement>(null);
  /** The drawn box, for reset(). Null until Turnstile has drawn one. */
  const live = useRef<{ api: TurnstileApi; id: string } | null>(null);
  /** The running effect's "put the button back on hold", for reset(). */
  const rewait = useRef<() => void>(() => {});
  const drawnTheme = useRef<ResolvedTheme | null>(null);
  const tellForm = useRef(onChange);
  const [problem, setProblem] = useState<TurnstileProblem | null>(null);
  const [fit, setFit] = useState<TurnstileFit>(TURNSTILE_FIT_FULL);
  // Bumped to throw the box away and draw a new one: "Try again" after a
  // failed load, and a change of theme.
  const [round, setRound] = useState(0);

  useEffect(() => {
    tellForm.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const column = frame.current;
    const el = holder.current;
    if (!column || !el) return;
    let gone = false;
    let status: HumanCheck["status"] = "checking";
    let api: TurnstileApi | null = null;
    let asked = false;
    let tried = false;
    let widget: string | null = null;
    /** The kind of box Turnstile drew this round: it can't be swapped for the other without a new draw. */
    let drawnSize: TurnstileSize | null = null;
    let patience: number | undefined;
    let kick: number | undefined;
    let watcher: ResizeObserver | null = null;
    const canWatch = typeof ResizeObserver === "function";

    const tell = (next: HumanCheck) => {
      status = next.status;
      tellForm.current(next);
    };
    // The form stops waiting, and the box says why.
    const giveUp = (why: TurnstileProblem) => {
      if (gone) return;
      window.clearTimeout(patience);
      setProblem(why);
      tell({ status: "unavailable", token: null });
    };
    // "Checking": the button waits, but only HUMAN_CHECK_PATIENCE_MS long.
    const wait = () => {
      if (gone) return;
      window.clearTimeout(patience);
      patience = window.setTimeout(() => giveUp(widget ? "slow" : "script"), HUMAN_CHECK_PATIENCE_MS);
      setProblem(null);
      tell({ status: "checking", token: null });
    };
    rewait.current = wait;

    // Called when the column is laid out, whenever its size changes, and when
    // the script lands: it fits the box to the column, asks for the script,
    // then draws, once.
    const step = () => {
      if (gone) return;
      // The LAID-OUT width. Not getBoundingClientRect: the auth card arrives
      // with a scale(0.97) animation, and a rect read during it comes up short.
      const width = column.clientWidth;
      // Not on screen yet (a collapsed section): the watcher calls again.
      if (width <= 0 && canWatch) return;
      // Before the draw this picks the box; after it, only the shrink follows
      // the column (a turned phone), the box itself stays.
      const next = turnstileFit(width, drawnSize);
      setFit((was) => (was.size === next.size && was.scale === next.scale ? was : next));
      if (widget) return;
      if (!asked) {
        asked = true;
        wait();
        loadTurnstile().then(
          (loaded) => {
            api = loaded;
            step();
          },
          () => giveUp("script"),
        );
        return;
      }
      if (!api || tried) return;
      // One go per round: a draw that fails is asked again by "Try again",
      // not by the next change of size.
      tried = true;
      const theme = currentTheme();
      drawnTheme.current = theme;
      drawnSize = next.size;
      wait();
      try {
        const id = api.render(el, {
          sitekey: siteKey,
          action,
          theme,
          size: next.size,
          // The token goes to Supabase through captchaOptions(), never through a form field.
          "response-field": false,
          // Cloudflare's "send feedback" link on a failed check would send them more than the check does.
          "feedback-enabled": false,
          // A token lasts five minutes. Turnstile runs the check again by itself when one runs
          // out, and when a tick was not made in time; the callbacks put the button back on hold.
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          callback: (token: string) => {
            if (gone) return;
            window.clearTimeout(patience);
            setProblem(null);
            tell({ status: "ready", token });
          },
          "expired-callback": wait,
          "timeout-callback": wait,
          "before-interactive-callback": () => {
            if (gone) return;
            // No clock on a person: the box is asking, and the button says so.
            window.clearTimeout(patience);
            setProblem(null);
            tell({ status: "needs_tap", token: null });
          },
          // Ticked: "checking" again until the token lands. Only from "needs_tap", so a token
          // that was reported first is never thrown away.
          "after-interactive-callback": () => {
            if (status === "needs_tap") wait();
          },
          "error-callback": (code: unknown) => {
            giveUp(turnstileProblem(code));
            // "Handled", or Turnstile also writes the error to the console.
            return true;
          },
          "unsupported-callback": () => giveUp("browser"),
        });
        if (!id) {
          giveUp("setup");
          return;
        }
        widget = id;
        live.current = { api, id };
      } catch {
        giveUp("setup");
      }
    };

    // step() sets state, so it is never called straight from this effect's
    // body (React's rule). The watcher calls it: as soon as the column has a
    // size (not while it is hidden), and again whenever that changes, for as
    // long as the box is on the page.
    if (canWatch) {
      watcher = new ResizeObserver(step);
      watcher.observe(column);
    } else {
      kick = window.setTimeout(step, 0);
    }

    return () => {
      gone = true;
      window.clearTimeout(patience);
      window.clearTimeout(kick);
      watcher?.disconnect();
      live.current = null;
      if (api && widget) {
        try {
          api.remove(widget);
        } catch {
          // Already gone.
        }
      }
    };
  }, [siteKey, action, round]);

  // Turnstile can't repaint a box it has drawn: a new theme gets a new box.
  useEffect(() => {
    const onTheme = (e: Event) => {
      const next = (e as CustomEvent<ThemeEventDetail>).detail?.theme;
      if (next && drawnTheme.current && next !== drawnTheme.current) setRound((n) => n + 1);
    };
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  function reset() {
    const drawn = live.current;
    if (drawn) {
      try {
        drawn.api.reset(drawn.id);
        rewait.current();
        return;
      } catch {
        // Past resetting: draw a new one below.
      }
    }
    // Nothing drawn (the script never came, or the draw failed): start over.
    setProblem(null);
    setRound((n) => n + 1);
  }
  useImperativeHandle(ref, () => ({ reset }));

  // Room for the box before it is drawn, so the form does not jump when it
  // lands: 65px tall (less when shrunk), 140 for the compact one. None when
  // the script never came, when there is only the sentence.
  const room = problem === "script" ? 0 : fit.height;
  // Under 300px: Turnstile draws its 300px box into a 300px holder, and the
  // holder is scaled down to the column from its top left corner. A scale
  // does not move the layout, so the frame is given the shrunk height and
  // clips the rest; without that the form would keep a gap under the box.
  const shrunk = fit.size === "flexible" && fit.scale < 1;
  const frameStyle: CSSProperties = shrunk ? { height: room, overflow: "hidden" } : { minHeight: room };
  const holderStyle: CSSProperties | undefined = shrunk
    ? { width: TURNSTILE_MIN_WIDTH, transform: `scale(${fit.scale})`, transformOrigin: "0 0" }
    : undefined;

  return (
    // minmax(0, 1fr): the column is as wide as the form, never as wide as the 300px holder inside it.
    // data-keep-clear: the cookie notice never sits over this box (src/lib/legal/cookie-notice.ts).
    <div data-keep-clear style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
      <div ref={frame} style={frameStyle}>
        <div ref={holder} style={holderStyle} />
      </div>
      {problem ? (
        <p role="status" className="vibe-auth-tip">
          {TURNSTILE_PROBLEM_COPY[problem]}{" "}
          <button type="button" className="vibe-auth-disclosure" onClick={reset}>
            Try again
          </button>
        </p>
      ) : null}
    </div>
  );
}
