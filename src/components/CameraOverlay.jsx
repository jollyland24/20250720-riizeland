import { forwardRef, useEffect, useRef } from 'react';
import { Camera, X } from "@phosphor-icons/react";

const CameraOverlay = forwardRef(function CameraOverlay(
  { isActive, isProcessing, onCapture, onClose },
  videoRef
) {
  const streamRef = useRef(null);

  useEffect(() => {
    if (isActive) {
      navigator.mediaDevices
        .getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => console.error('Camera error:', err));
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isActive]);

  return (
    <div
      className="camera-overlay"
      id="camera-overlay"
      style={{ display: isActive ? 'block' : 'none' }}
    >
      <div className="camera-container">
        <button className="camera-close-btn" id="camera-close-btn" onClick={onClose}>
          <X size={16} />
        </button>
        <video ref={videoRef} id="camera-video" className={isProcessing ? 'processing' : ''} autoPlay muted playsInline />
        {isProcessing ? (
          <div className="processing-indicator" id="processing-indicator">
            <div className="spinner"></div>
            <span>Generating AI image...</span>
          </div>
        ) : (
          <button className="photo-capture-btn" id="photo-capture-btn" onClick={onCapture}>
            <Camera size={24} weight="fill" />
          </button>
        )}
      </div>
    </div>
  );
});

export default CameraOverlay;
