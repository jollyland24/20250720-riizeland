import { Play, Pause, SkipForward } from "@phosphor-icons/react";

export default function AudioControls({ isPlaying, indicatorRef, onPlay, onNextSong }) {
  return (
    <div className="audio-controls">
      <div className="audio-indicator" id="audio-indicator" ref={indicatorRef} style={{ display: 'none' }}>
        1.00x
      </div>
      <div className="audio-buttons">
        <button id="play-btn" className="audio-btn" onClick={onPlay}>
          {isPlaying ? <Pause weight="fill" /> : <Play weight="fill" />}
        </button>
        <button id="next-btn" className="audio-btn" onClick={onNextSong}>
          <SkipForward weight="fill" />
        </button>
      </div>
    </div>
  );
}
