import { useEffect } from 'react';

export default function MergedImageModal({ imageUrl, onClose }) {
  // Auto-close after 10 seconds
  useEffect(() => {
    const timer = setTimeout(onClose, 10000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.8)',
        zIndex: 2999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src={imageUrl}
        alt="AI merged result"
        style={{
          maxWidth: '80vw',
          maxHeight: '80vh',
          borderRadius: '1rem',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          border: '3px solid white',
          zIndex: 3000,
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          width: '3rem',
          height: '3rem',
          border: 'none',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.9)',
          fontSize: '1.5rem',
          cursor: 'pointer',
          zIndex: 3001,
        }}
      >
        &times;
      </button>
    </div>
  );
}
