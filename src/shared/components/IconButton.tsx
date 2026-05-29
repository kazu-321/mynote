import type { ButtonHTMLAttributes, ReactNode } from "react";

export function IconButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "danger"; label: string; icon: ReactNode }) {
  const { tone = "default", label, icon, className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`icon-button ${tone === "danger" ? "danger" : ""} ${className}`.trim()}
      aria-label={label}
      title={label}
    >
      <span className="icon-button-icon" aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
