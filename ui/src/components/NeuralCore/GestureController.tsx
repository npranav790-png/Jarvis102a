import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useJarvisStore } from '../../store/jarvisStore';
import { Camera, CameraOff, Focus } from 'lucide-react';

interface GestureControllerProps {
  style?: React.CSSProperties;
  className?: string;
}

export const GestureController: React.FC<GestureControllerProps> = ({ style, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { gesturesEnabled, setGesturesEnabled } = useJarvisStore();
  
  const [status, setStatus] = useState('Standby');
  const [gesture, setGesture] = useState('NONE');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [handDetected, setHandDetected] = useState(false);
  const [stabilizing, setStabilizing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [liveZoom, setLiveZoom] = useState(1);
  const [liveRot, setLiveRot] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const inter = (window as any).jarvisCoreInteraction;
      if (inter) {
        setLiveZoom(inter.zoom);
        setLiveRot({ x: inter.rotX, y: inter.rotY });
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);
  
  const landmarkerRef = useRef<HandLandmarker | null>(null);

  useEffect(() => {
    let active = true;
    let reqFrameId: number;

    const init = async () => {
      if (!gesturesEnabled) {
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(t => t.stop());
          videoRef.current.srcObject = null;
        }
        setStatus('Standby');
        setHandDetected(false);
        setConfidence(null);
        setGesture('NONE');
        return;
      }

      setStatus('Loading models...');
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.7,
          minTrackingConfidence: 0.7
        });

        if (!active) return;
        setStatus('Requesting camera...');
        
        // Local-only media stream (never transmitted to cloud/LLM)
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setStatus('Active');

        let lastVideoTime = -1;
        const historySize = 5;
        const gestureHistory: string[] = [];
        let currentStableGesture = 'NONE';
        let currentPausedState = false;

        const predict = async () => {
          if (!active || !videoRef.current || !landmarkerRef.current) return;
          
          try {
            if (videoRef.current.readyState >= 2 && videoRef.current.currentTime !== lastVideoTime) {
              lastVideoTime = videoRef.current.currentTime;
              const results = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
            
              let detected = 'NONE';
              let conf: number | null = null;
              let isHandPresent = false;

              if (results.landmarks && results.landmarks.length > 0) {
                isHandPresent = true;
                const lm = results.landmarks[0];
                conf = Math.round((results.handedness[0][0].score || 0) * 100);
                
                const thumbTip = lm[4];
                const indexTip = lm[8];
                const middleTip = lm[12];
                
                const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
                const isPinch = pinchDist < 0.05;
                const isFist = (indexTip.y > lm[5].y) && (middleTip.y > lm[9].y);
                
                if (isPinch) detected = 'PINCH';
                else if (isFist) detected = 'FIST';
                else detected = 'PALM';
              }

              setHandDetected(isHandPresent);
              setConfidence(conf);

              if (conf !== null && conf < 70 && conf > 0) {
                setStabilizing(true);
              } else {
                setStabilizing(false);
              }

              gestureHistory.push(detected);
              if (gestureHistory.length > historySize) {
                gestureHistory.shift();
              }

              const counts = gestureHistory.reduce((acc, g) => {
                acc[g] = (acc[g] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);

              let majority = 'NONE';
              let maxCount = 0;
              for (const [g, count] of Object.entries(counts)) {
                if (count > maxCount) {
                  maxCount = count;
                  majority = g;
                }
              }

              // Stabilize state if dominant for 4/5 frames
              if (maxCount >= 4) {
                if (majority === 'FIST' && !currentPausedState) {
                  currentPausedState = true;
                  setIsPaused(true);
                } else if (majority === 'PALM' && currentPausedState) {
                  currentPausedState = false;
                  setIsPaused(false);
                }
                currentStableGesture = majority;
              }

              if (currentPausedState) {
                setGesture('PAUSED');
              } else if (currentStableGesture === 'PINCH') {
                setGesture('ZOOM');
              } else if (currentStableGesture === 'PALM') {
                setGesture('ROTATE');
              } else {
                setGesture('NONE');
              }

              if (!currentPausedState && currentStableGesture !== 'NONE' && results.landmarks?.length > 0) {
                const lm = results.landmarks[0];
                const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
                
                const customEvent = new CustomEvent('jarvis-gesture', { detail: { 
                  type: currentStableGesture, 
                  x: lm[0].x, 
                  y: lm[0].y,
                  pinchDist
                }});
                window.dispatchEvent(customEvent);
              }
            }
          } catch (err) {
            console.error('Gesture predict error:', err);
          }
          reqFrameId = requestAnimationFrame(predict);
        };
        predict();

      } catch (e: any) {
        setStatus(`Error: ${e.message}`);
      }
    };

    init();

    return () => {
      active = false;
      cancelAnimationFrame(reqFrameId);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
      }
    };
  }, [gesturesEnabled]);

  const cameraActive = gesturesEnabled && status === 'Active';

  return (
    <div 
      className={`panel ${className || ''}`} 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '10px', 
        background: 'rgba(6, 11, 18, 0.92)', 
        border: '1px solid var(--border-active)',
        padding: '14px',
        ...style 
      }}
    >
      <div className="panel-header" style={{ fontSize: '0.72rem', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Focus size={13} className="text-cyan" /> 
        <span>GESTURE CONTROL</span>
      </div>
      
      {/* Real Live Telemetry Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-muted">CAMERA:</span>
          <span style={{ color: cameraActive ? 'var(--status-online)' : 'var(--text-muted)', fontWeight: 600 }}>
            {cameraActive ? 'ACTIVE' : gesturesEnabled ? status.toUpperCase() : 'OFF'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-muted">GESTURE:</span>
          <span style={{ color: cameraActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
            {cameraActive ? (stabilizing ? 'DETECTING...' : gesture) : 'STANDBY'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-muted">HAND:</span>
          <span style={{ color: handDetected ? 'var(--status-online)' : 'var(--text-muted)' }}>
            {cameraActive ? (handDetected ? '1 DETECTED' : 'NONE') : 'NONE'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-muted">CONFIDENCE:</span>
          <span style={{ color: confidence && confidence > 70 ? 'var(--status-online)' : 'var(--text-secondary)' }}>
            {cameraActive && handDetected && confidence !== null ? `${confidence}%` : '--'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-muted">ACTION:</span>
          <span style={{ color: gesture !== 'NONE' && gesture !== 'PAUSED' ? 'var(--status-online)' : 'var(--text-muted)' }}>
            {cameraActive && handDetected ? gesture : 'NONE'}
          </span>
        </div>

        {/* Temporary Gesture & Core Debug Readout */}
        <div style={{ borderTop: '1px solid rgba(0, 240, 255, 0.2)', paddingTop: '6px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9.5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">CORE ZOOM:</span>
            <span className="text-cyan font-mono" style={{ fontWeight: 700 }}>{liveZoom.toFixed(2)}x</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">CORE ROTATION:</span>
            <span className="font-mono text-cyan">X: {liveRot.x.toFixed(2)} | Y: {liveRot.y.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Camera Preview Area (Local only) */}
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        height: '110px', 
        background: '#020408', 
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)', 
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {gesturesEnabled ? (
          <>
            <video 
              ref={videoRef} 
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
              playsInline 
              muted 
            />
            {isPaused && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-cyan)', letterSpacing: '2px', fontWeight: 700 }}>PAUSED</span>
              </div>
            )}
            <div style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '9px', color: 'var(--status-online)', fontFamily: 'var(--font-mono)' }}>
              ● LIVE (LOCAL ONLY)
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
            <CameraOff size={20} />
            <span className="font-mono" style={{ fontSize: '10px', letterSpacing: '1px' }}>CAMERA OFF</span>
            <span style={{ fontSize: '8px', opacity: 0.7 }}>Optical tracking standby</span>
          </div>
        )}
      </div>

      {/* Prominent Enable / Disable Control Button */}
      <button 
        type="button"
        onClick={() => setGesturesEnabled(!gesturesEnabled)}
        style={{
          background: gesturesEnabled ? 'rgba(255, 51, 85, 0.15)' : 'rgba(0, 240, 255, 0.15)',
          color: gesturesEnabled ? 'var(--status-offline)' : 'var(--accent-cyan)',
          border: `1px solid ${gesturesEnabled ? 'var(--status-offline)' : 'var(--accent-cyan)'}`,
          padding: '8px 14px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          letterSpacing: '1.5px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          boxShadow: gesturesEnabled ? '0 0 10px rgba(255, 51, 85, 0.3)' : '0 0 10px rgba(0, 240, 255, 0.3)',
          transition: 'all 0.2s ease',
          marginTop: '2px'
        }}
      >
        {gesturesEnabled ? <CameraOff size={14} /> : <Camera size={14} />}
        {gesturesEnabled ? 'DISABLE CAMERA' : 'ENABLE CAMERA'}
      </button>
    </div>
  );
};
