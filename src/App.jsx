import { useState, useRef, useCallback } from 'react';
import { Camera, User, Mountains } from "@phosphor-icons/react";
import ThreeCanvas from './components/ThreeCanvas.jsx';
import MemberSelector from './components/MemberSelector.jsx';
import CameraOverlay from './components/CameraOverlay.jsx';
import AudioControls from './components/AudioControls.jsx';
import MergedImageModal from './components/MergedImageModal.jsx';

const initialMembers = [
  { visible: true,  opacity: 1,   clickable: false }, // member0 (name is simplehead...but it is actually wonbin)
  { visible: false, opacity: 0.3, clickable: false }, // member1 (sungchan)
  { visible: false, opacity: 0.3, clickable: false }, // member2 (eunseok)
  { visible: false, opacity: 0.3, clickable: false }, // member3 (shotaro)
  { visible: false, opacity: 0.3, clickable: false }, // member4 (sohee)
  { visible: false, opacity: 0.3, clickable: false }, // member5 (anton)
];

export default function App() {
  const [members, setMembers] = useState(initialMembers);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mergedImageUrl, setMergedImageUrl] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const trackTimerRef = useRef(null);
  const [showTitle, setShowTitle] = useState(true);
  const [currentView, setCurrentView] = useState('explore');

  const threeRef = useRef();      // ThreeCanvas imperative handle
  const videoRef = useRef();      // CameraOverlay <video> element
  const audioIndicatorRef = useRef(); // AudioControls indicator DOM element

  // ── ThreeCanvas callbacks ────────────────────────────────────────────────

  // Called when a star is collected; collectedCount is 1–5
  const handleMemberReveal = useCallback((collectedCount) => {
    setMembers((prev) => {
      const next = [...prev];
      if (next[collectedCount]) {
        next[collectedCount] = { ...next[collectedCount], visible: true };
      }
      return next;
    });
  }, []);

  // Called when all 5 stars are collected
  const handleAllMembersUnlocked = useCallback(() => {
    setMembers((prev) => prev.map((m) => ({ ...m, clickable: true, opacity: 1 })));
  }, []);

  // Called from the animation loop — direct DOM mutation, no re-render
  const handleAudioIndicatorUpdate = useCallback((text, style) => {
    if (audioIndicatorRef.current) {
      audioIndicatorRef.current.textContent = text;
      Object.assign(audioIndicatorRef.current.style, style);
    }
  }, []);

  const handlePlayStateChange = useCallback((playing) => {
    setIsPlaying(playing);
  }, []);

  const handleSongChange = useCallback((name) => {
    setCurrentTrack(name);
    if (trackTimerRef.current) clearTimeout(trackTimerRef.current);
    trackTimerRef.current = setTimeout(() => setCurrentTrack(null), 3000);
  }, []);

  // ── User interactions ────────────────────────────────────────────────────

  const handleMemberClick = useCallback((modelName) => {
    threeRef.current?.changeModel(modelName);
  }, []);

  const handleCameraToggle = () => setIsCameraActive((prev) => !prev);
  const handleCloseCamera = () => setIsCameraActive(false);

  const handleCapture = async () => {
    if (isProcessing) return;
    // Capture photos immediately; delay the overlay so the button blink is visible
    setTimeout(() => setIsProcessing(true), 300);
    try {
      const userPhotoBlob = await captureUserPhoto(videoRef.current);
      const scenePhotoBlob = await threeRef.current.captureScene();
      const mergedBlob = await processWithVertexAI(userPhotoBlob, scenePhotoBlob);
      const url = URL.createObjectURL(mergedBlob);
      setMergedImageUrl(url);
    } catch (error) {
      console.error('Photo processing error:', error);
      alert('Failed to process photo: ' + error.message);
    } finally {
      setIsProcessing(false);
      setIsCameraActive(false);
    }
  };

  const handleCloseMergedImage = useCallback(() => {
    if (mergedImageUrl) URL.revokeObjectURL(mergedImageUrl);
    setMergedImageUrl(null);
  }, [mergedImageUrl]);

  const handlePlay = () => threeRef.current?.togglePlay();
  const handleNextSong = () => threeRef.current?.nextSong();

  const handleViewToggle = () => {
    const next = currentView === 'explore' ? 'character' : 'explore';
    setCurrentView(next);
    threeRef.current?.switchView(next);
  };

  return (
    <>
      <ThreeCanvas
        ref={threeRef}
        onMemberReveal={handleMemberReveal}
        onAllMembersUnlocked={handleAllMembersUnlocked}
        onAudioIndicatorUpdate={handleAudioIndicatorUpdate}
        onPlayStateChange={handlePlayStateChange}
        onSongChange={handleSongChange}
      />

      <MemberSelector members={members} onMemberClick={handleMemberClick} />

      <div className="bottom-controls">
        <div className="camera-controls">
          <button
            id="camera-btn"
            className="control-btn camera"
            onClick={handleCameraToggle}
            style={isCameraActive ? { backgroundColor: 'rgba(255, 100, 100, 0.8)' } : {}}
          >
            <Camera size={20} weight={isCameraActive ? "fill" : "regular"} />
          </button>
          <button className="control-btn view-toggle" onClick={handleViewToggle}>
            {currentView === 'explore'
              ? <User weight="fill" size={20} />
              : <Mountains weight="fill" size={20} />}
          </button>
        </div>
        <AudioControls
          isPlaying={isPlaying}
          indicatorRef={audioIndicatorRef}
          onPlay={handlePlay}
          onNextSong={handleNextSong}
        />
      </div>

      <CameraOverlay
        ref={videoRef}
        isActive={isCameraActive}
        isProcessing={isProcessing}
        onCapture={handleCapture}
        onClose={handleCloseCamera}
      />

      {showTitle && (
        <div
          className="track-overlay title-overlay"
          onAnimationEnd={() => {
            setShowTitle(false);
            setCurrentView('character');
            threeRef.current?.switchView('character');
          }}
        >
          RIIZE<br />LAND
        </div>
      )}

      {currentTrack && (
        <div className="track-overlay" key={currentTrack}>
          {currentTrack}
        </div>
      )}

      {mergedImageUrl && (
        <MergedImageModal imageUrl={mergedImageUrl} onClose={handleCloseMergedImage} />
      )}
    </>
  );
}

// ── Utility functions ──────────────────────────────────────────────────────

function captureUserPhoto(videoElement) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(videoElement, 0, 0);
    canvas.toBlob(resolve, 'image/jpeg', 0.8);
  });
}

async function processWithVertexAI(userPhotoBlob, scenePhotoBlob) {
  const formData = new FormData();
  formData.append('userPhoto', userPhotoBlob, 'user.jpg');
  formData.append('scenePhoto', scenePhotoBlob, 'scene.jpg');

  try {
    const response = await fetch('/api/merge-images', { method: 'POST', body: formData });

    if (!response.ok) {
      console.log(`Primary endpoint failed (${response.status}), trying simple endpoint...`);
      const fallback = await fetch('/api/merge-images-simple', { method: 'POST', body: formData });
      if (!fallback.ok) throw new Error(`Backend request failed: ${fallback.status}`);
      const result = await fallback.json();
      return base64ToBlob(result.image, result.mimeType || 'image/jpeg');
    }

    const result = await response.json();
    if (!result.success || !result.image) {
      throw new Error('Invalid response from backend: ' + JSON.stringify(result));
    }
    return base64ToBlob(result.image, result.mimeType || 'image/jpeg');
  } catch (error) {
    console.error('Backend processing error:', error);
    return userPhotoBlob; // fallback: show user photo
  }
}

function base64ToBlob(base64, mimeType) {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mimeType });
}
