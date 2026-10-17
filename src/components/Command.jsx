import { useState } from "react";

export default function Command({ children }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/^\n/, "").replace(/\n$/, "");

  return (
    <div className="command">
      <pre>{text}</pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
