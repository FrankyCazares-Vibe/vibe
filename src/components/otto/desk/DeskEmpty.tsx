import "../kit/sky.css";
import "../kit/desk.css";

/**
 * An empty section (Nov 10, 2026, the Otto build's Wave 2A): Otto's one
 * lowercase line from the model (`desk.empty.*`, e.g. "nothing needs you
 * right now.") on plain paper. No Otto, no button, no coral: an empty pile
 * is calm, not a call to action.
 */
export function DeskEmpty({ line }: { line: string }) {
  return (
    <div className="tx-host dk-card dk-empty">
      <i className="tx tx-paper" aria-hidden="true" />
      <p className="dk-voice">{line}</p>
    </div>
  );
}
