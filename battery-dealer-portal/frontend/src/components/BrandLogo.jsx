function BrandLogo({ variant = "light", compact = false }) {
  return (
    <div
      className={`brand-logo brand-logo--${variant}${compact ? " brand-logo--compact" : ""}`}
      aria-label="VoltCore Batteries"
    >
      <div className="brand-logo__wordmark">
        <span className="brand-logo__name">VOLT</span>
        <span className="brand-logo__bolt" aria-hidden="true" />
        <span className="brand-logo__name brand-logo__name--accent">CORE</span>
      </div>

      <span className="brand-logo__caption">POWER THAT MOVES YOU</span>
    </div>
  );
}

export default BrandLogo;
