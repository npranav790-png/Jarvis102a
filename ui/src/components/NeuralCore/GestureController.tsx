import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useJarvisStore } from '../../store/jarvisStore';
import { Camera, CameraOff, Hand, X, Maximize2, Minimize2 } from 'lucide-react';

interface GestureControllerProps {
  style?: React.CSSProperties;
  className?: string;
  onClose?: () => void;
}

// Complete 21-joint MediaPipe Hand Skeletal Strands & Connections
const HAND_CONNECTIONS: [number, number][] = [
  // Radial Metacarpal Palm Strands (Carpal base / Wrist radiating to each knuckle)
  [0, 1],   // Wrist -> Thumb CMC
  [0, 5],   // Wrist -> Index MCP
  [0, 9],   // Wrist -> Middle MCP (Central longitudinal palm strand)
  [0, 13],  // Wrist -> Ring MCP (Medial longitudinal palm strand)
  [0, 17],  // Wrist -> Pinky MCP (Hypothenar border strand)

  // Transverse Knuckle Arch (Metacarpophalangeal palmar truss)
  [1, 5],   // Thenar space web (Thumb to Index knuckle)
  [5, 9],   // Index to Middle knuckle
  [9, 13],  // Middle to Ring knuckle
  [13, 17], // Ring to Pinky knuckle

  // Palm Structural Cross-Strands & Webbing
  [0, 2],   // Wrist to Thumb MCP (Thenar boundary)
  [1, 9],   // Diagonal transverse palm ray
  [5, 17],  // Transverse palm base truss

  // Thumb Strand (CMC -> MCP -> IP -> Tip)
  [1, 2], [2, 3], [3, 4],

  // Index Finger Strand (MCP -> PIP -> DIP -> Tip)
  [5, 6], [6, 7], [7, 8],

  // Middle Finger Strand (MCP -> PIP -> DIP -> Tip)
  [9, 10], [10, 11], [11, 12],

  // Ring Finger Strand (MCP -> PIP -> DIP -> Tip)
  [13, 14], [14, 15], [15, 16],

  // Pinky Finger Strand (MCP -> PIP -> DIP -> Tip)
  [17, 18], [18, 19], [19, 20],
];

export const GestureController: React.FC<GestureControllerProps> = ({ style, className, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { gesturesEnabled, setGesturesEnabled } = useJarvisStore();

  const [status, setStatus] = useState('Standby');
  const [gesture, setGesture] = useState('NONE');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [handDetected, setHandDetected] = useState(false);
  const [handsCount, setHandsCount] = useState<number>(0);
  const [pinchPercent, setPinchPercent] = useState<number>(0);
  const [isDualPinchActive, setIsDualPinchActive] = useState<boolean>(false);
  const [palmSpan, setPalmSpan] = useState<number>(0);
  const [palmTilt, setPalmTilt] = useState<number>(0);
  const [palmPitch, setPalmPitch] = useState<number>(0);
  const [isVerticalHand, setIsVerticalHand] = useState(false);
  const [isHoldingOrb, setIsHoldingOrb] = useState(false);
  const [motionVector, setMotionVector] = useState<string>('STEADY');
  const [palmCoords, setPalmCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isExpanded, setIsExpanded] = useState(false);

  const landmarkerRef = useRef<HandLandmarker | null>(null);

  useEffect(() => {
    let active = true;
    let reqFrameId: number;

    // Adaptive Exponential Moving Average state for ultra-smooth jitter-free tracking
    let smoothPalmX = 0.5;
    let smoothPalmY = 0.5;
    let lastMirroredPalmX = 0.5;
    let lastSmoothPalmY = 0.5;
    let smoothTiltRad = 0;
    let smoothPitchRad = 0;
    let isHoldingActive = false;
    let initialized = false;
    let frameCount = 0;

    const init = async () => {
      if (!gesturesEnabled) {
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((t) => t.stop());
          videoRef.current.srcObject = null;
        }
        setStatus('Standby');
        setHandDetected(false);
        setHandsCount(0);
        setConfidence(null);
        setGesture('NONE');
        return;
      }

      setStatus('Loading Vision AI...');
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
        );

        // Track up to 2 hands simultaneously for dual-palm pinch zooming
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });

        if (!active) return;
        setStatus('Connecting Camera...');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 60, min: 30 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('Active');

        let lastVideoTime = -1;
        const historySize = 3;
        const gestureHistory: string[] = [];
        let currentStableGesture = 'NONE';

        const predict = () => {
          if (!active) return;

          const video = videoRef.current;
          const canvas = canvasRef.current;
          const landmarker = landmarkerRef.current;

          if (video && canvas && landmarker && video.readyState >= 2) {
            const width = video.videoWidth || 320;
            const height = video.videoHeight || 240;

            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width;
              canvas.height = height;
            }

            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, width, height);

              if (video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                frameCount++;
                const results = landmarker.detectForVideo(video, performance.now());

                let detected = 'NONE';
                let conf: number | null = null;
                const numHands = results.landmarks ? results.landmarks.length : 0;
                const isHandPresent = numHands > 0;
                let computedTilt = 0;
                let computedPitch = 0;
                let computedTiltRad = 0;
                let computedPitchRad = 0;
                let isHandVertical = false;
                let isHandCuppedHoldingOrb = false;
                let isDualPinch = false;
                let singleHandPinch = false;
                let currentMotionDir = 'STEADY';
                let currentMotionSymbol = '●';
                let computedPinchPct = 0;
                let computedSpanPct = 0;
                let mirroredPalmX = 0.5;
                let dualPinchSpanDist: number | undefined = undefined;

                // 3D Distance helper
                const dist3D = (
                  p1: { x: number; y: number; z?: number },
                  p2: { x: number; y: number; z?: number }
                ) => {
                  const dx = p1.x - p2.x;
                  const dy = p1.y - p2.y;
                  const dz = (p1.z || 0) - (p2.z || 0);
                  return Math.hypot(dx, dy, dz);
                };

                if (isHandPresent) {
                  conf = Math.round((results.handedness?.[0]?.[0]?.score || 0.95) * 100);

                  // Deterministically sort detected hands left-to-right across camera frame
                  // This completely prevents index flipping/jitter between Hand 0 and Hand 1!
                  const rawLandmarks = results.landmarks || [];
                  const sortedLandmarks = [...rawLandmarks].sort((a, b) => {
                    const palmXA = (a[0].x + a[5].x + a[9].x + a[17].x) / 4;
                    const palmXB = (b[0].x + b[5].x + b[9].x + b[17].x) / 4;
                    return palmXA - palmXB;
                  });

                  // 1. Analyze Hand 0 (Leftmost Hand)
                  const lm0 = sortedLandmarks[0];
                  const pinchDist0 = dist3D(lm0[4], lm0[8]);
                  const isPinch0 = pinchDist0 < 0.068;

                  // 2. Analyze Hand 1 (Rightmost Hand, if 2 hands present)
                  let isPinch1 = false;
                  let lm1: typeof lm0 | null = null;
                  if (numHands > 1) {
                    lm1 = sortedLandmarks[1];
                    const pinchDist1 = dist3D(lm1[4], lm1[8]);
                    isPinch1 = pinchDist1 < 0.068;
                  }

                  // 3. DUAL PALM PINCH CHECK
                  // STRICT RULE: Zoom activates ONLY when BOTH palms are pinched simultaneously!
                  isDualPinch = numHands >= 2 && isPinch0 && isPinch1;
                  singleHandPinch = (isPinch0 || isPinch1) && !isDualPinch;

                  // Midpoints of pinch points
                  const pinchMid0 = {
                    x: (lm0[4].x + lm0[8].x) / 2,
                    y: (lm0[4].y + lm0[8].y) / 2,
                    z: ((lm0[4].z || 0) + (lm0[8].z || 0)) / 2,
                  };
                  let pinchMid1 = { x: 0.5, y: 0.5, z: 0 };
                  if (lm1) {
                    pinchMid1 = {
                      x: (lm1[4].x + lm1[8].x) / 2,
                      y: (lm1[4].y + lm1[8].y) / 2,
                      z: ((lm1[4].z || 0) + (lm1[8].z || 0)) / 2,
                    };
                  }

                  if (isDualPinch) {
                    dualPinchSpanDist = dist3D(pinchMid0, pinchMid1);
                    computedPinchPct = Math.max(0, Math.min(100, Math.round((dualPinchSpanDist / 0.65) * 100)));
                  }

                  // 4. Determine Primary Tracking Hand:
                  // If one hand pinches and the other is open, use the open hand for palm orientation & rotation!
                  let primaryLm = lm0;
                  if (numHands > 1 && !isDualPinch) {
                    if (isPinch0 && !isPinch1 && lm1) {
                      primaryLm = lm1;
                    }
                  }
                  const primaryWrist = primaryLm[0];
                  const primaryThumbTip = primaryLm[4];
                  const primaryIndexTip = primaryLm[8];
                  const primaryMiddleTip = primaryLm[12];
                  const primaryRingTip = primaryLm[16];
                  const primaryPinkyTip = primaryLm[20];
                  const primaryIndexMcp = primaryLm[5];
                  const primaryMiddleMcp = primaryLm[9];
                  const primaryPinkyMcp = primaryLm[17];

                  // Primary Palm Centroid & Motion Tracking
                  const rawPalmX = (primaryWrist.x + primaryIndexMcp.x + primaryMiddleMcp.x + primaryPinkyMcp.x) / 4;
                  const rawPalmY = (primaryWrist.y + primaryIndexMcp.y + primaryMiddleMcp.y + primaryPinkyMcp.y) / 4;

                  if (!initialized) {
                    smoothPalmX = rawPalmX;
                    smoothPalmY = rawPalmY;
                    lastMirroredPalmX = 1 - rawPalmX;
                    lastSmoothPalmY = rawPalmY;
                    initialized = true;
                  } else {
                    const dist = Math.hypot(rawPalmX - smoothPalmX, rawPalmY - smoothPalmY);
                    const alpha = Math.min(Math.max(dist * 7.5, 0.28), 0.85);
                    smoothPalmX = smoothPalmX + alpha * (rawPalmX - smoothPalmX);
                    smoothPalmY = smoothPalmY + alpha * (rawPalmY - smoothPalmY);
                  }

                  mirroredPalmX = 1 - smoothPalmX;

                  const deltaX = mirroredPalmX - lastMirroredPalmX;
                  const deltaY = smoothPalmY - lastSmoothPalmY;
                  if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    if (deltaX > 0.0035) {
                      currentMotionDir = 'RIGHT';
                      currentMotionSymbol = '►';
                    } else if (deltaX < -0.0035) {
                      currentMotionDir = 'LEFT';
                      currentMotionSymbol = '◄';
                    }
                  } else {
                    if (deltaY > 0.0035) {
                      currentMotionDir = 'DOWN';
                      currentMotionSymbol = '▼';
                    } else if (deltaY < -0.0035) {
                      currentMotionDir = 'UP';
                      currentMotionSymbol = '▲';
                    }
                  }
                  lastMirroredPalmX = mirroredPalmX;
                  lastSmoothPalmY = smoothPalmY;

                  // 5. Compute 3D Orientation (Roll, Pitch, Verticality, Cupping) with Vector Geometry
                  // Longitudinal axis vector L (Wrist -> Middle MCP)
                  const lx = (1 - primaryMiddleMcp.x) - (1 - primaryWrist.x);
                  const ly = primaryWrist.y - primaryMiddleMcp.y; // positive when fingers point upward
                  const lz = (primaryMiddleMcp.z || 0) - (primaryWrist.z || 0);
                  const lLen = Math.hypot(lx, ly, lz) || 1;
                  const Lx = lx / lLen;
                  const Ly = ly / lLen;
                  const Lz = lz / lLen;

                  // Transverse axis vector T (Index MCP -> Pinky MCP)
                  const tx = (1 - primaryPinkyMcp.x) - (1 - primaryIndexMcp.x);
                  const ty = primaryIndexMcp.y - primaryPinkyMcp.y;
                  const tz = (primaryPinkyMcp.z || 0) - (primaryIndexMcp.z || 0);
                  const tLen = Math.hypot(tx, ty, tz) || 1;
                  const Tx = tx / tLen;
                  const Ty = ty / tLen;
                  const Tz = tz / tLen;

                  // Palm Normal Vector N = L x T
                  const nx = Ly * Tz - Lz * Ty;
                  const ny = Lz * Tx - Lx * Tz;
                  const nz = Lx * Ty - Ly * Tx;
                  const nLen = Math.hypot(nx, ny, nz) || 1;
                  const Nx = nx / nLen;
                  const Ny = ny / nLen;

                  // Roll Angle (wrist tilt clockwise/counterclockwise)
                  const rawTiltRad = Math.atan2(Lx, Ly);

                  // Pitch Angle (wrist tilted forward towards camera or backward away from camera)
                  // Mathematically bounded to prevent singularities
                  const rawPitchRad = Math.asin(Math.max(-0.95, Math.min(0.95, -Lz)));

                  // Adaptive Exponential Moving Average filter on 3D angles to eliminate webcam depth jitter
                  if (!initialized) {
                    smoothTiltRad = rawTiltRad;
                    smoothPitchRad = rawPitchRad;
                  } else {
                    smoothTiltRad += (rawTiltRad - smoothTiltRad) * 0.22;
                    smoothPitchRad += (rawPitchRad - smoothPitchRad) * 0.22;
                  }

                  computedTiltRad = smoothTiltRad;
                  computedPitchRad = smoothPitchRad;
                  computedTilt = Math.round((computedTiltRad * 180) / Math.PI);
                  computedPitch = Math.round((computedPitchRad * 180) / Math.PI);

                  // Tips and cupping analysis
                  const tips = [primaryThumbTip, primaryIndexTip, primaryMiddleTip, primaryRingTip, primaryPinkyTip];
                  const avgTipDist =
                    tips.reduce(
                      (acc, t) => acc + dist3D(t, { x: rawPalmX, y: rawPalmY, z: primaryWrist.z || 0 }),
                      0
                    ) / 5;
                  computedSpanPct = Math.max(0, Math.min(100, Math.round((avgTipDist / 0.38) * 100)));

                  // Cupped check: at least 2 fingertips curved inward towards camera relative to their knuckles
                  const cuppedCount = [
                    (primaryIndexTip.z || 0) < (primaryIndexMcp.z || 0) - 0.018,
                    (primaryMiddleTip.z || 0) < (primaryMiddleMcp.z || 0) - 0.018,
                    (primaryRingTip.z || 0) < (primaryPinkyMcp.z || 0) - 0.018,
                  ].filter(Boolean).length;
                  const isCuppedHand = cuppedCount >= 2;

                  // Vertical / sideways hand (palm normal facing sideways or fingers tilted past 32 deg)
                  isHandVertical = Math.abs(Nx) > 0.42 || Math.abs(Ny) > 0.42 || Math.abs(computedTiltRad) > 0.55;

                  // Hysteresis for "Holding the Orb" (HOLD mode) to prevent high-frequency flickering
                  const holdTrigger = (isCuppedHand || Math.abs(Nx) > 0.45 || Math.abs(Ny) > 0.45 || Math.abs(computedTiltRad) > 0.55);
                  const holdRelease = (!isCuppedHand && Math.abs(Nx) < 0.28 && Math.abs(Ny) < 0.28 && Math.abs(computedTiltRad) < 0.35);

                  if (holdTrigger && !isDualPinch) {
                    isHoldingActive = true;
                  } else if (holdRelease || isDualPinch) {
                    isHoldingActive = false;
                  }
                  isHandCuppedHoldingOrb = isHoldingActive;

                  // 6. Action Gesture Decision Tree
                  if (isDualPinch) {
                    detected = 'ZOOM';
                  } else if (isHandCuppedHoldingOrb) {
                    detected = 'HOLD';
                  } else {
                    detected = 'PALM';
                  }

                  // Update debounce buffer
                  gestureHistory.push(detected);
                  if (gestureHistory.length > historySize) {
                    gestureHistory.shift();
                  }

                  const counts = gestureHistory.reduce((acc, g) => {
                    acc[g] = (acc[g] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                  let majority = detected;
                  let maxCount = 0;
                  for (const [g, count] of Object.entries(counts)) {
                    if (count > maxCount) {
                      maxCount = count;
                      majority = g;
                    }
                  }

                  currentStableGesture = majority;

                  // Dispatch gesture event to Neural Core with 3D orientation
                  const customEvent = new CustomEvent('jarvis-gesture', {
                    detail: {
                      type: currentStableGesture,
                      x: mirroredPalmX,
                      y: smoothPalmY,
                      pinchDist: isDualPinch ? dualPinchSpanDist : undefined,
                      span: avgTipDist,
                      tilt: computedTiltRad,
                      pitch: computedPitchRad,
                      isVertical: isHandVertical,
                      isCupped: isHandCuppedHoldingOrb,
                      depth: dist3D(primaryWrist, primaryMiddleMcp),
                    },
                  });
                  window.dispatchEvent(customEvent);

                  // ==========================================
                  // 7. RENDER BOTH HANDS & SKELETAL STRANDS ON CANVAS
                  // ==========================================

                  // A. Futuristic HUD Corner Brackets
                  ctx.strokeStyle = isDualPinch
                    ? 'rgba(255, 214, 0, 0.75)'
                    : isHandCuppedHoldingOrb
                    ? 'rgba(0, 255, 200, 0.65)'
                    : 'rgba(0, 229, 255, 0.5)';
                  ctx.lineWidth = 1.5;
                  const pad = 12;
                  const bracketLen = 18;
                  // Brackets
                  ctx.beginPath();
                  ctx.moveTo(pad, pad + bracketLen);
                  ctx.lineTo(pad, pad);
                  ctx.lineTo(pad + bracketLen, pad);
                  ctx.moveTo(width - pad - bracketLen, pad);
                  ctx.lineTo(width - pad, pad);
                  ctx.lineTo(width - pad, pad + bracketLen);
                  ctx.moveTo(pad, height - pad - bracketLen);
                  ctx.lineTo(pad, height - pad);
                  ctx.lineTo(pad + bracketLen, height - pad);
                  ctx.moveTo(width - pad - bracketLen, height - pad);
                  ctx.lineTo(width - pad, height - pad);
                  ctx.lineTo(width - pad, height - pad - bracketLen);
                  ctx.stroke();

                  // B. Render All Detected Hands
                  sortedLandmarks.forEach((lm, hIdx) => {
                    const isHandPinching =
                      hIdx === 0 ? isPinch0 : hIdx === 1 ? isPinch1 : false;

                    const handPalmX = (lm[0].x + lm[5].x + lm[9].x + lm[17].x) / 4;
                    const handPalmY = (lm[0].y + lm[5].y + lm[9].y + lm[17].y) / 4;
                    const hpcX = (1 - handPalmX) * width;
                    const hpcY = handPalmY * height;

                    // Palm Centroid Webbing Matrix
                    ctx.strokeStyle = isDualPinch
                      ? 'rgba(255, 214, 0, 0.35)'
                      : isHandCuppedHoldingOrb
                      ? 'rgba(0, 255, 200, 0.45)'
                      : 'rgba(0, 229, 255, 0.35)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([2, 2]);
                    [0, 1, 5, 9, 13, 17].forEach((jointIdx) => {
                      const j = lm[jointIdx];
                      ctx.beginPath();
                      ctx.moveTo(hpcX, hpcY);
                      ctx.lineTo((1 - j.x) * width, j.y * height);
                      ctx.stroke();
                    });
                    ctx.setLineDash([]);

                    // Hand Skeletal Strands
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
                      const start = lm[startIdx];
                      const end = lm[endIdx];

                      const x1 = (1 - start.x) * width;
                      const y1 = start.y * height;
                      const x2 = (1 - end.x) * width;
                      const y2 = end.y * height;

                      ctx.beginPath();
                      ctx.moveTo(x1, y1);
                      ctx.lineTo(x2, y2);

                      if (isDualPinch) {
                        ctx.strokeStyle = '#ffd600';
                        ctx.lineWidth = 2.8;
                        ctx.shadowColor = '#ffd600';
                        ctx.shadowBlur = 10;
                      } else if (isHandPinching && (startIdx === 4 || endIdx === 4 || startIdx === 8 || endIdx === 8)) {
                        ctx.strokeStyle = '#ffd600';
                        ctx.lineWidth = 3.0;
                        ctx.shadowColor = '#ffd600';
                        ctx.shadowBlur = 10;
                      } else if (isHandCuppedHoldingOrb && lm === primaryLm) {
                        ctx.strokeStyle = 'rgba(0, 255, 200, 0.95)';
                        ctx.lineWidth = 2.4;
                        ctx.shadowColor = '#00ffc8';
                        ctx.shadowBlur = 9;
                      } else {
                        const isPalmRay =
                          startIdx === 0 &&
                          (endIdx === 1 || endIdx === 5 || endIdx === 9 || endIdx === 13 || endIdx === 17);
                        ctx.strokeStyle = isPalmRay ? 'rgba(0, 255, 230, 0.95)' : 'rgba(0, 229, 255, 0.85)';
                        ctx.lineWidth = isPalmRay ? 2.4 : 2;
                        ctx.shadowColor = '#00e5ff';
                        ctx.shadowBlur = 8;
                      }
                      ctx.stroke();
                    });

                    // 21 Landmark Nodes
                    lm.forEach((joint, idx) => {
                      const jx = (1 - joint.x) * width;
                      const jy = joint.y * height;
                      const isFingertip = idx === 4 || idx === 8 || idx === 12 || idx === 16 || idx === 20;
                      const isWrist = idx === 0;

                      ctx.shadowBlur = isFingertip ? 12 : isWrist ? 8 : 4;
                      ctx.shadowColor = isDualPinch
                        ? '#ffd600'
                        : isHandPinching && (idx === 4 || idx === 8)
                        ? '#ffd600'
                        : isHandCuppedHoldingOrb
                        ? '#00ffc8'
                        : '#00e5ff';

                      ctx.beginPath();
                      ctx.arc(jx, jy, isFingertip ? 5 : isWrist ? 4 : 3, 0, Math.PI * 2);
                      ctx.fillStyle = isFingertip
                        ? '#ffffff'
                        : isDualPinch || (isHandPinching && (idx === 4 || idx === 8))
                        ? '#ffd600'
                        : isHandCuppedHoldingOrb
                        ? '#00ffc8'
                        : '#00e5ff';
                      ctx.fill();

                      ctx.beginPath();
                      ctx.arc(jx, jy, isFingertip ? 6.5 : isWrist ? 5.5 : 4, 0, Math.PI * 2);
                      ctx.strokeStyle = isFingertip ? '#00e5ff' : 'rgba(255, 255, 255, 0.8)';
                      ctx.lineWidth = 1;
                      ctx.stroke();
                    });

                    // Single Hand Pinch Indicator if only 1 hand pinched
                    if (singleHandPinch && isHandPinching) {
                      const tipX = ((1 - lm[4].x) * width + (1 - lm[8].x) * width) / 2;
                      const tipY = (lm[4].y * height + lm[8].y * height) / 2;
                      ctx.shadowBlur = 0;
                      ctx.font = 'bold 8px "Space Mono", monospace';
                      ctx.fillStyle = '#ffd600';
                      ctx.textAlign = 'center';
                      ctx.fillText('PINCH 1/2 (PINCH BOTH TO ZOOM)', tipX, Math.max(tipY - 14, 14));
                    }
                  });

                  // C. DUAL PINCH HOLOGRAPHIC LASER TETHER (Rendered when BOTH palms are pinched!)
                  if (isDualPinch && lm1) {
                    const p0X = (1 - pinchMid0.x) * width;
                    const p0Y = pinchMid0.y * height;
                    const p1X = (1 - pinchMid1.x) * width;
                    const p1Y = pinchMid1.y * height;

                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#ffd600';
                    ctx.strokeStyle = '#ffd600';
                    ctx.lineWidth = 2.5;
                    ctx.setLineDash([5, 5]);

                    ctx.beginPath();
                    ctx.moveTo(p0X, p0Y);
                    ctx.lineTo(p1X, p1Y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Dual Pinch Target Rings at both hands
                    [ { x: p0X, y: p0Y }, { x: p1X, y: p1Y } ].forEach(pt => {
                      ctx.beginPath();
                      ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
                      ctx.strokeStyle = '#ffd600';
                      ctx.lineWidth = 1.5;
                      ctx.stroke();
                    });

                    // Central Dual Pinch Zoom Badge
                    const midLaserX = (p0X + p1X) / 2;
                    const midLaserY = (p0Y + p1Y) / 2;
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'rgba(2, 8, 18, 0.92)';
                    const bW = 140;
                    const bH = 24;
                    ctx.fillRect(midLaserX - bW / 2, midLaserY - bH / 2, bW, bH);
                    ctx.strokeStyle = '#ffd600';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(midLaserX - bW / 2, midLaserY - bH / 2, bW, bH);

                    ctx.font = 'bold 8.5px "Space Mono", monospace';
                    ctx.fillStyle = '#ffd600';
                    ctx.textAlign = 'center';
                    ctx.fillText(`◄ DUAL PINCH ZOOM: ${computedPinchPct}% ►`, midLaserX, midLaserY + 4);
                  }

                  // D. Holographic "HOLDING THE ORB" Reticle / Cradle for Primary Hand
                  const pcX = (1 - smoothPalmX) * width;
                  const pcY = smoothPalmY * height;

                  if (isHandCuppedHoldingOrb && !isDualPinch) {
                    ctx.shadowBlur = 18;
                    ctx.shadowColor = '#00ffc8';
                    ctx.strokeStyle = '#00ffc8';
                    ctx.lineWidth = 1.8;

                    ctx.beginPath();
                    ctx.arc(pcX, pcY, 22, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.ellipse(pcX, pcY, 24, 9, computedTiltRad, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
                    ctx.lineWidth = 1.2;
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.arc(pcX, pcY, 4, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = 10;
                    ctx.fill();
                  }

                  // E. Floating Tactical HUD Data Tag for Primary Palm
                  if (!isDualPinch) {
                    ctx.shadowBlur = 0;
                    const tagW = 126;
                    const tagH = 34;
                    const tagX = Math.min(Math.max(pcX - tagW / 2, 8), width - tagW - 8);
                    const tagY = Math.max(pcY - 48, 10);

                    ctx.beginPath();
                    ctx.moveTo(pcX, pcY - 18);
                    ctx.lineTo(tagX + tagW / 2, tagY + tagH);
                    ctx.strokeStyle = isHandCuppedHoldingOrb ? 'rgba(0, 255, 200, 0.6)' : 'rgba(0, 229, 255, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.fillStyle = 'rgba(2, 8, 18, 0.9)';
                    ctx.fillRect(tagX, tagY, tagW, tagH);
                    ctx.strokeStyle = isHandCuppedHoldingOrb
                      ? 'rgba(0, 255, 200, 0.85)'
                      : 'rgba(0, 229, 255, 0.7)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(tagX, tagY, tagW, tagH);

                    ctx.font = 'bold 8.5px "Space Mono", monospace';
                    ctx.fillStyle = isHandCuppedHoldingOrb
                      ? '#00ffc8'
                      : '#00e5ff';
                    ctx.textAlign = 'left';
                    ctx.fillText(
                      isHandCuppedHoldingOrb
                        ? `● HOLDING ORB (3D)`
                        : `● PALM ACTIVE [${computedSpanPct}%]`,
                      tagX + 6,
                      tagY + 11
                    );

                    ctx.font = '8px "Space Mono", monospace';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    ctx.fillText(
                      `POS: X:${(mirroredPalmX * 100).toFixed(0)}% Y:${(smoothPalmY * 100).toFixed(0)}%`,
                      tagX + 6,
                      tagY + 21
                    );

                    ctx.fillStyle = isHandCuppedHoldingOrb ? '#00ffc8' : 'rgba(0, 229, 255, 0.85)';
                    ctx.fillText(
                      `T:${computedTilt > 0 ? '+' : ''}${computedTilt}° P:${computedPitch > 0 ? '+' : ''}${computedPitch}° [${currentMotionSymbol}]`,
                      tagX + 6,
                      tagY + 30
                    );
                  }
                } else {
                  // NO HAND PRESENT:
                  // Cleanly reset tracking references to prevent re-entry delta spikes
                  initialized = false;
                  smoothTiltRad = 0;
                  smoothPitchRad = 0;
                  isHoldingActive = false;
                  gestureHistory.length = 0;
                  currentStableGesture = 'NONE';

                  // Dispatch 'NONE' event to reset CoreInteraction tracking anchors
                  const noneEvent = new CustomEvent('jarvis-gesture', {
                    detail: {
                      type: 'NONE',
                      x: 0.5,
                      y: 0.5,
                    },
                  });
                  window.dispatchEvent(noneEvent);

                  // Cybernetic Scanning Reticle on camera canvas when waiting for hand
                  ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
                  ctx.lineWidth = 1;
                  const pad = 12;
                  const bracketLen = 18;
                  ctx.beginPath();
                  ctx.moveTo(pad, pad + bracketLen); ctx.lineTo(pad, pad); ctx.lineTo(pad + bracketLen, pad);
                  ctx.moveTo(width - pad - bracketLen, pad); ctx.lineTo(width - pad, pad); ctx.lineTo(width - pad, pad + bracketLen);
                  ctx.moveTo(pad, height - pad - bracketLen); ctx.lineTo(pad, height - pad); ctx.lineTo(pad + bracketLen, height - pad);
                  ctx.moveTo(width - pad - bracketLen, height - pad); ctx.lineTo(width - pad, height - pad); ctx.lineTo(width - pad, height - pad - bracketLen);
                  ctx.stroke();

                  // Subtle pulsing center scanning ring
                  const pulseR = 26 + Math.sin(frameCount * 0.08) * 5;
                  ctx.beginPath();
                  ctx.arc(width / 2, height / 2, pulseR, 0, Math.PI * 2);
                  ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
                  ctx.stroke();

                  ctx.font = '8px "Space Mono", monospace';
                  ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
                  ctx.textAlign = 'center';
                  ctx.fillText('AWAITING HAND GESTURE...', width / 2, height / 2 + 42);
                }

                // Throttle React state updates to ~20 FPS for silky performance
                if (frameCount % 3 === 0 || detected !== gesture) {
                  setHandDetected(isHandPresent);
                  setHandsCount(numHands);
                  setConfidence(conf);
                  setPalmCoords({
                    x: Math.round(mirroredPalmX * 100),
                    y: Math.round(smoothPalmY * 100),
                  });
                  setPinchPercent(computedPinchPct);
                  setIsDualPinchActive(isDualPinch);
                  setPalmSpan(computedSpanPct);
                  setPalmTilt(computedTilt);
                  setPalmPitch(computedPitch);
                  setIsVerticalHand(isHandVertical);
                  setIsHoldingOrb(isHandCuppedHoldingOrb);
                  setMotionVector(isHandPresent ? `${currentMotionSymbol} ${currentMotionDir}` : 'IDLE');

                  if (!isHandPresent) {
                    setGesture('NONE');
                  } else if (currentStableGesture === 'ZOOM') {
                    setGesture('ZOOM');
                  } else if (currentStableGesture === 'HOLD') {
                    setGesture('HOLD');
                  } else if (currentStableGesture === 'PALM') {
                    setGesture('ROTATE');
                  } else {
                    setGesture('NONE');
                  }
                }
              }
            }
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
        stream.getTracks().forEach((t) => t.stop());
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
        background: 'rgba(4, 10, 20, 0.95)',
        border: `1px solid ${isDualPinchActive ? 'rgba(255, 214, 0, 0.6)' : 'rgba(0, 229, 255, 0.4)'}`,
        borderRadius: '12px',
        padding: '12px',
        backdropFilter: 'blur(16px)',
        boxShadow: isDualPinchActive
          ? '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 214, 0, 0.3)'
          : '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 25px rgba(0, 229, 255, 0.25)',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '0.74rem',
          letterSpacing: '1.5px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0, 229, 255, 0.15)',
          paddingBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Hand size={14} style={{ color: isDualPinchActive ? '#ffd600' : isHoldingOrb ? '#00ffc8' : '#00e5ff' }} />
          <span style={{ fontWeight: 700, color: '#e0f7fa', fontFamily: 'var(--font-mono)' }}>
            OPTICAL PALM SENSOR
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            className="font-mono"
            style={{
              fontSize: '9px',
              padding: '2px 7px',
              borderRadius: '4px',
              background: cameraActive
                ? isDualPinchActive
                  ? 'rgba(255, 214, 0, 0.2)'
                  : isHoldingOrb
                  ? 'rgba(0, 255, 200, 0.2)'
                  : 'rgba(0, 255, 136, 0.15)'
                : 'rgba(255, 255, 255, 0.08)',
              color: cameraActive
                ? isDualPinchActive
                  ? '#ffd600'
                  : isHoldingOrb
                  ? '#00ffc8'
                  : '#00ff88'
                : 'var(--text-muted)',
              border: `1px solid ${
                cameraActive
                  ? isDualPinchActive
                    ? '#ffd600'
                    : isHoldingOrb
                    ? '#00ffc8'
                    : '#00ff88'
                  : 'transparent'
              }`,
              fontWeight: 600,
            }}
          >
            {cameraActive
              ? handDetected
                ? isDualPinchActive
                  ? 'DUAL PINCH ZOOM ACTIVE'
                  : handsCount > 1
                  ? '2 PALMS DETECTED'
                  : isHoldingOrb
                  ? 'HOLDING ORB (3D LOCKED)'
                  : '1 PALM LOCKED'
                : 'ONLINE // SCANNING'
              : 'OFFLINE'}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Compact View' : 'Expand View'}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(0, 229, 255, 0.7)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Minimize Preview"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Optical Camera Viewport with Integrated Live Palm Readings HUD */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: isExpanded ? '280px' : '220px',
          background: '#010408',
          border: `1px solid ${
            isDualPinchActive
              ? 'rgba(255, 214, 0, 0.6)'
              : isHoldingOrb
              ? 'rgba(0, 255, 200, 0.5)'
              : 'rgba(0, 229, 255, 0.3)'
          }`,
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isDualPinchActive
            ? 'inset 0 0 25px rgba(255, 214, 0, 0.25), 0 0 20px rgba(255, 214, 0, 0.2)'
            : isHoldingOrb
            ? 'inset 0 0 25px rgba(0, 255, 200, 0.2), 0 0 15px rgba(0, 255, 200, 0.15)'
            : 'inset 0 0 20px rgba(0, 0, 0, 0.85)',
          transition: 'all 0.25s ease',
        }}
      >
        {gesturesEnabled ? (
          <>
            <video
              ref={videoRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
              }}
              playsInline
              muted
            />

            {/* Neon Skeletal Strands & HUD Overlay Canvas */}
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            />

            {/* Top HUD Telemetry Ribbon (Directly on Camera Feed) */}
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                right: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              {/* Sensor State Badge */}
              <div
                style={{
                  fontSize: '9px',
                  color: handDetected
                    ? isDualPinchActive
                      ? '#ffd600'
                      : isHoldingOrb
                      ? '#00ffc8'
                      : '#00ff88'
                    : 'rgba(0, 229, 255, 0.8)',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(2, 6, 14, 0.85)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${
                    isDualPinchActive
                      ? 'rgba(255, 214, 0, 0.6)'
                      : isHoldingOrb
                      ? 'rgba(0, 255, 200, 0.5)'
                      : 'rgba(0, 229, 255, 0.3)'
                  }`,
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: handDetected
                      ? isDualPinchActive
                        ? '#ffd600'
                        : isHoldingOrb
                        ? '#00ffc8'
                        : '#00ff88'
                      : '#00e5ff',
                    boxShadow: `0 0 8px ${
                      handDetected
                        ? isDualPinchActive
                          ? '#ffd600'
                          : isHoldingOrb
                          ? '#00ffc8'
                          : '#00ff88'
                        : '#00e5ff'
                    }`,
                    display: 'inline-block',
                  }}
                />
                <span>
                  {handDetected
                    ? isDualPinchActive
                      ? 'DUAL PINCH ZOOM ENGAGED'
                      : handsCount > 1
                      ? '2 PALMS DETECTED (PINCH BOTH TO ZOOM)'
                      : isHoldingOrb
                      ? 'ORB CRADLED // 3D LOCKED'
                      : '1 PALM LOCKED'
                    : 'SEARCHING PALMS...'}
                </span>
              </div>

              {/* Confidence & Joints Badge */}
              <div
                style={{
                  fontSize: '9px',
                  color: isDualPinchActive ? '#ffd600' : isHoldingOrb ? '#00ffc8' : '#00e5ff',
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(2, 6, 14, 0.85)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${
                    isDualPinchActive
                      ? 'rgba(255, 214, 0, 0.6)'
                      : isHoldingOrb
                      ? 'rgba(0, 255, 200, 0.5)'
                      : 'rgba(0, 229, 255, 0.3)'
                  }`,
                  backdropFilter: 'blur(4px)',
                }}
              >
                {handDetected && confidence !== null
                  ? `${handsCount} PALM${handsCount > 1 ? 'S' : ''} | CONF: ${confidence}%`
                  : 'AI VISION 60 FPS'}
              </div>
            </div>

            {/* Prompt when no hand is in frame */}
            {!handDetected && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(1, 4, 10, 0.55)',
                  pointerEvents: 'none',
                  gap: '6px',
                  textAlign: 'center',
                  padding: '0 20px',
                }}
              >
                <Hand size={28} style={{ color: 'rgba(0, 229, 255, 0.6)' }} />
                <span
                  className="font-mono"
                  style={{
                    fontSize: '11px',
                    color: '#00e5ff',
                    letterSpacing: '1px',
                    fontWeight: 700,
                  }}
                >
                  PLACE PALM(S) IN FRONT OF CAMERA
                </span>
                <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.65)' }}>
                  ROTATE: Single Palm • HOLD: Cradle 3D Orb • ZOOM: Pinch Both Palms
                </span>
              </div>
            )}



            {/* Integrated On-Camera Palm Readings HUD Dock (Bottom Strip) */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(180deg, rgba(2, 6, 14, 0.75) 0%, rgba(2, 6, 14, 0.96) 100%)',
                backdropFilter: 'blur(8px)',
                borderTop: `1px solid ${
                  isDualPinchActive
                    ? 'rgba(255, 214, 0, 0.6)'
                    : isHoldingOrb
                    ? 'rgba(0, 255, 200, 0.5)'
                    : 'rgba(0, 229, 255, 0.35)'
                }`,
                padding: '6px 10px',
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr 1fr 1.3fr 0.9fr',
                gap: '6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                pointerEvents: 'none',
              }}
            >
              {/* Item 1: Action Gesture */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '8px' }}>ACTION</span>
                <span
                  style={{
                    color:
                      gesture === 'ZOOM'
                        ? '#ffd600'
                        : gesture === 'HOLD'
                        ? '#00ffc8'
                        : gesture === 'ROTATE'
                        ? '#00e5ff'
                        : 'rgba(255, 255, 255, 0.4)',
                    fontWeight: 800,
                  }}
                >
                  {handDetected
                    ? gesture === 'ZOOM'
                      ? 'DUAL PINCH ZOOM'
                      : gesture === 'HOLD'
                      ? 'HOLDING ORB'
                      : gesture
                    : 'STANDBY'}
                </span>
              </div>

              {/* Item 2: Mirrored Coordinates */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '8px' }}>PALM X/Y</span>
                <span style={{ color: '#00e5ff', fontWeight: 700 }}>
                  {handDetected ? `${palmCoords.x}% ${palmCoords.y}%` : '--'}
                </span>
              </div>

              {/* Item 3: Hands & Posture */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '8px' }}>HANDS / SPAN</span>
                <span
                  style={{
                    color: isDualPinchActive
                      ? '#ffd600'
                      : isHoldingOrb
                      ? '#00ffc8'
                      : isVerticalHand
                      ? '#00e5ff'
                      : '#ffffff',
                    fontWeight: 700,
                  }}
                >
                  {handDetected
                    ? `${handsCount}H (${isVerticalHand ? 'VERT' : 'FLAT'} ${palmSpan}%)`
                    : '--'}
                </span>
              </div>

              {/* Item 4: 3D Tilt & Pitch Readings */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '8px' }}>TILT / PITCH</span>
                <span
                  style={{
                    color: isDualPinchActive
                      ? '#ffd600'
                      : isHoldingOrb
                      ? '#00ffc8'
                      : '#00e5ff',
                    fontWeight: 700,
                  }}
                >
                  {handDetected
                    ? `T:${palmTilt > 0 ? '+' : ''}${palmTilt}° P:${palmPitch > 0 ? '+' : ''}${palmPitch}°`
                    : '--'}
                </span>
              </div>

              {/* Item 5: Pinch State (Dual Required!) */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '8px' }}>PINCH / DIR</span>
                <span
                  style={{
                    color: isDualPinchActive
                      ? '#ffd600'
                      : pinchPercent > 0
                      ? '#ffd600'
                      : '#00e5ff',
                    fontWeight: 700,
                  }}
                >
                  {isDualPinchActive
                    ? `DUAL: ${pinchPercent}%`
                    : pinchPercent > 0
                    ? `1/2 [${motionVector}]`
                    : motionVector}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-muted)',
            }}
          >
            <CameraOff size={28} style={{ opacity: 0.7 }} />
            <span className="font-mono" style={{ fontSize: '11px', letterSpacing: '1px' }}>
              CAMERA SENSOR OFF
            </span>
            <span style={{ fontSize: '9px', opacity: 0.7 }}>
              Enable to cradle orb with single palm or pinch with both palms to zoom
            </span>
          </div>
        )}
      </div>

      {/* Prominent Optical Sensor Toggle Button */}
      <button
        type="button"
        onClick={() => setGesturesEnabled(!gesturesEnabled)}
        style={{
          background: gesturesEnabled
            ? 'linear-gradient(135deg, rgba(255, 51, 85, 0.25), rgba(255, 51, 85, 0.1))'
            : 'linear-gradient(135deg, rgba(0, 229, 255, 0.25), rgba(0, 229, 255, 0.1))',
          color: gesturesEnabled ? '#ff3366' : '#00e5ff',
          border: `1px solid ${gesturesEnabled ? '#ff3366' : '#00e5ff'}`,
          padding: '8px 14px',
          borderRadius: '6px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          letterSpacing: '1.5px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          boxShadow: gesturesEnabled
            ? '0 0 15px rgba(255, 51, 85, 0.3)'
            : '0 0 15px rgba(0, 229, 255, 0.3)',
          transition: 'all 0.2s ease',
        }}
      >
        {gesturesEnabled ? <CameraOff size={14} /> : <Camera size={14} />}
        {gesturesEnabled ? 'DISENGAGE OPTICAL SENSOR' : 'ENGAGE OPTICAL SENSOR'}
      </button>
    </div>
  );
};
