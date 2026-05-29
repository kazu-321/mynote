import type { ReactNode } from "react";

export function Modal(props: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!props.open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={props.onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">{props.title}</div>
        {props.children}
      </div>
    </div>
  );
}
