export default function AppIcon({ src, name }) {
  const letter = String(name || "?").trim().slice(0, 1).toUpperCase();
  if (!src) {
    return (
      <span className="lp-icon lp-icon-empty" aria-hidden="true">
        {letter}
      </span>
    );
  }
  return <img className="lp-icon" src={src} alt="" />;
}
