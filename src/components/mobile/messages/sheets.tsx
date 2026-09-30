"use client";

import Link from "next/link";
import { Drawer } from "vaul";

import { vaulContentStyle, vaulHandleStyle, vaulOverlayStyle, visuallyHiddenStyle } from "./sheet-styles";

export function SheetRow({
  label,
  onClick,
  href,
  onClose,
  danger,
  bold,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  onClose?: () => void;
  danger?: boolean;
  bold?: boolean;
  disabled?: boolean;
}) {
  const inner = (
    <span
      style={{
        display: "block",
        padding: "14px 18px",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 15,
        fontWeight: bold ? 700 : 500,
        color: danger ? "var(--error-ink)" : "var(--charcoal)",
        textAlign: "left",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        borderTop: "1px solid rgba(var(--scrim-rgb),0.04)",
        textDecoration: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </span>
  );
  if (href) {
    return (
      <Link
        href={href}
        onClick={() => onClose?.()}
        style={{ display: "block", color: "inherit" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        padding: 0,
        textAlign: "left",
      }}
    >
      {inner}
    </button>
  );
}

export function MuteDurationSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (hours: number | null) => void;
}) {
  const options: Array<{ label: string; hours: number | null }> = [
    { label: "For 1 hour", hours: 1 },
    { label: "For 8 hours", hours: 8 },
    { label: "For 24 hours", hours: 24 },
    { label: "For 7 days", hours: 168 },
    { label: "Until I unmute", hours: null },
  ];
  // NestedRoot — scales the parent drawer down behind this one
  // (the iOS-native stacked-sheet feel).
  return (
    <Drawer.NestedRoot open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={vaulOverlayStyle} />
        <Drawer.Content style={vaulContentStyle} aria-describedby={undefined}>
          <Drawer.Title style={visuallyHiddenStyle}>Mute duration</Drawer.Title>
          <Drawer.Handle style={vaulHandleStyle} />
          <div
            style={{
              padding: "10px 18px 6px",
              fontFamily: "Fraunces, serif",
              fontSize: 16,
              fontWeight: 800,
              color: "var(--charcoal)",
            }}
          >
            Mute this chat
          </div>
          <div style={{ padding: "0 0 12px" }}>
            {options.map((opt) => (
              <SheetRow
                key={opt.label}
                label={opt.label}
                onClick={() => onPick(opt.hours)}
              />
            ))}
            <SheetRow label="Cancel" onClick={onClose} bold />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}
