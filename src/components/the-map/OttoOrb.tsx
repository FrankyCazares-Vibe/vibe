export function OttoOrb({ size = 48 }: { size?: number }) {
  return (
    <div
      className="otto-orb-wrap"
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="orb-pulse-1" />
      <div className="orb-pulse-2" />
      <div className="orb-track-1" />
      <div className="orb-track-2" />
      <div className="orb-core" />
    </div>
  );
}
