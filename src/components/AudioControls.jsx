export default function AudioControls({ isPlaying, indicatorRef, onPlay, onStop }) {
  return (
    <div className="audio-controls">
      <div className="audio-indicator" id="audio-indicator" ref={indicatorRef}>
        1.00x
      </div>
      <div className="audio-buttons">
        <button id="play-btn" className="audio-btn" onClick={onPlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button id="stop-btn" className="audio-btn" onClick={onStop}>⏹</button>
      </div>
    </div>
  );
}
