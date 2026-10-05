import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            {onClose && (
              <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
