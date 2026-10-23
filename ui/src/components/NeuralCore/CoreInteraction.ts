/**
 * CoreInteraction
 * Handles user interaction for the Neural Core:
 * - Pointer drag with momentum and friction
 * - Multi-touch & trackpad pinch zoom
 * - MediaPipe hand gesture control (PALM -> rotate, DUAL PINCH -> zoom, HOLD -> cradle 3D orb)
 * - Subtle mouse parallax for spatial 3D presence
 * - Keyboard shortcuts (r/0 to reset, +/- to zoom)
 * - Smooth inertia and damping
 */

export class CoreInteraction {
  public rotX = 0;
  public rotY = 0;
  public rotZ = 0;
  public zoom = 1.0;

  public velX = 0;
  public velY = 0;
  public velZ = 0;
  public velZoom = 0;

  // Parallax offsets for subtle spatial presence
  public targetParallaxX = 0;
  public targetParallaxY = 0;
  public parallaxX = 0;
  public parallaxY = 0;

  // Target orientation for "Holding the Orb" spring tracking
  public targetRotX = 0;
  public targetRotZ = 0;
  public isHoldingOrbMode = false;
  public isHandActive = false;

  private isDragging = false;
  private activePointers = new Map<number, { x: number; y: number }>();
  private initialPinchDist: number | null = null;
  private initialPinchZoom = 1.0;

  // Hand gesture & 3D orientation tracking state
  private lastHandX: number | null = null;
  private lastHandY: number | null = null;
  private lastTilt: number | null = null;
  private lastPitch: number | null = null;
  private lastDepth: number | null = null;
  private lastPinchDist: number | null = null;

  public readonly MIN_ZOOM = 0.45;
  public readonly MAX_ZOOM = 2.8;

  private friction = 0.92;
  private momentumActive = true;

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.momentumActive = false;
    }
  }

  public setReducedMotion(reduced: boolean) {
    this.momentumActive = !reduced;
  }

  public getPinchDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  public clampZoom(z: number): number {
    return Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, z));
  }

  public onPointerDown(e: PointerEvent) {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.velX = 0;
      this.velY = 0;
    } else if (this.activePointers.size === 2) {
      this.isDragging = false;
      const pts = Array.from(this.activePointers.values());
      this.initialPinchDist = this.getPinchDistance(pts[0], pts[1]);
      this.initialPinchZoom = this.zoom;
    }
  }

  public onPointerMove(e: PointerEvent) {
    // Parallax update (subtle camera shift)
    if (typeof window !== 'undefined') {
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      this.targetParallaxX = ((e.clientX - halfW) / halfW) * 0.12;
      this.targetParallaxY = ((e.clientY - halfH) / halfH) * 0.08;
    }

    if (!this.activePointers.has(e.pointerId)) return;
    const lastPos = this.activePointers.get(e.pointerId)!;

    if (this.activePointers.size === 1 && this.isDragging) {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;

      this.velY = dx * 0.0035;
      this.velX = dy * 0.0035;

      if (!this.momentumActive) {
        this.rotY += this.velY;
        this.rotX += this.velX;
      }
    } else if (this.activePointers.size === 2 && this.initialPinchDist) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = Array.from(this.activePointers.values());
      const currentDist = this.getPinchDistance(pts[0], pts[1]);
      const delta = currentDist / this.initialPinchDist;
      this.zoom = this.clampZoom(this.initialPinchZoom * delta);
    }

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  public onPointerUp(e: PointerEvent) {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.initialPinchDist = null;
    }
    if (this.activePointers.size === 1) {
      this.isDragging = true;
    }
    if (this.activePointers.size === 0) {
      this.isDragging = false;
    }
  }

  public onWheel(e: WheelEvent) {
    const zoomFactor = -e.deltaY * 0.0012;
    this.velZoom += zoomFactor;
    this.zoom = this.clampZoom(this.zoom + zoomFactor);
  }

  public updatePhysics() {
    // Parallax spring interpolation
    this.parallaxX += (this.targetParallaxX - this.parallaxX) * 0.05;
    this.parallaxY += (this.targetParallaxY - this.parallaxY) * 0.05;

    if (this.momentumActive) {
      if (this.isHoldingOrbMode) {
        // Holding the orb:
        // 1. Physically align roll (Z) smoothly to cupped hand tilt
        this.rotZ += (this.targetRotZ - this.rotZ) * 0.14;
        // 2. Translational motion and wrist pitch drive pitch (X) and yaw (Y)
        this.rotX += this.velX;
        this.rotY += this.velY;
        this.velX *= this.friction;
        this.velY *= this.friction;
      } else {
        // Regular palm mode
        this.rotX += this.velX;
        this.rotY += this.velY;
        this.rotZ += this.velZ;

        if (!this.isDragging) {
          this.velX *= this.friction;
          this.velY *= this.friction;
          this.velZ *= this.friction;
        }

        // Return towards level roll when idle
        this.rotZ *= 0.985;
      }

      this.zoom = this.clampZoom(this.zoom + this.velZoom);
      this.velZoom *= this.friction;

      // Gentle continuous ambient drift ONLY when completely idle (no drag, no active hand)
      if (
        !this.isDragging &&
        !this.isHandActive &&
        Math.abs(this.velX) < 0.0001 &&
        Math.abs(this.velY) < 0.0001 &&
        Math.abs(this.velZ) < 0.0001
      ) {
        this.rotY += 0.0015;
      }
    } else {
      if (!this.isDragging && !this.isHandActive) {
        this.rotY += 0.0005;
      }
    }
  }

  public reset() {
    this.rotX = 0;
    this.rotY = 0;
    this.rotZ = 0;
    this.zoom = 1.0;
    this.velX = 0;
    this.velY = 0;
    this.velZ = 0;
    this.velZoom = 0;
    this.targetRotX = 0;
    this.targetRotZ = 0;
    this.isHoldingOrbMode = false;
    this.isHandActive = false;
    this.targetParallaxX = 0;
    this.targetParallaxY = 0;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.lastHandX = null;
    this.lastHandY = null;
    this.lastTilt = null;
    this.lastPitch = null;
    this.lastDepth = null;
    this.lastPinchDist = null;
  }

  public handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const key = e.key;
    if (key === 'r' || key === 'R' || key === '0') {
      this.reset();
    } else if (key === '+' || key === '=') {
      this.velZoom += 0.06;
      this.zoom = this.clampZoom(this.zoom + 0.12);
    } else if (key === '-' || key === '_') {
      this.velZoom -= 0.06;
      this.zoom = this.clampZoom(this.zoom - 0.12);
    }
  }

  public applyGesture(
    type: string,
    x: number,
    y: number,
    pinchDist?: number,
    tilt?: number,
    pitch?: number,
    isVertical?: boolean,
    isCupped?: boolean,
    depth?: number
  ) {
    if (type === 'NONE') {
      this.isHandActive = false;
      this.isHoldingOrbMode = false;
      this.lastHandX = null;
      this.lastHandY = null;
      this.lastTilt = null;
      this.lastPitch = null;
      this.lastDepth = null;
      this.lastPinchDist = null;
      return;
    }

    this.isHandActive = true;

    if (type === 'PALM' || type === 'ROTATE' || type === 'HOLD') {
      const isHoldingOrb = Boolean(type === 'HOLD' || isCupped || isVertical);
      this.isHoldingOrbMode = isHoldingOrb;

      // 1. Translation velocity (moving hand in X/Y — fully active for both modes!)
      if (this.lastHandX !== null && this.lastHandY !== null) {
        // Clamp raw deltas to [-0.045, 0.045] to prevent sudden velocity bursts
        const rawDx = x - this.lastHandX;
        const rawDy = y - this.lastHandY;
        const dx = Math.max(-0.045, Math.min(0.045, rawDx));
        const dy = Math.max(-0.045, Math.min(0.045, rawDy));

        // Micro-gesture threshold
        if (Math.hypot(dx, dy) > 0.0006) {
          const mult = isHoldingOrb ? 3.0 : 2.6;
          this.velY = dx * mult;
          this.velX = dy * mult; // Fully enabled for vertical control!
          if (!this.momentumActive) {
            this.rotY += this.velY;
            this.rotX += this.velX;
          }
        } else {
          this.velX *= 0.85;
          this.velY *= 0.85;
        }
      }

      // 2. Wrist Roll alignment in HOLD mode, or free roll delta in PALM mode
      if (tilt !== undefined) {
        if (isHoldingOrb) {
          this.targetRotZ = Math.max(-1.3, Math.min(1.3, tilt * 1.1));
        } else if (this.lastTilt !== null) {
          let dTilt = tilt - this.lastTilt;
          if (dTilt > Math.PI) dTilt -= 2 * Math.PI;
          if (dTilt < -Math.PI) dTilt += 2 * Math.PI;
          if (Math.abs(dTilt) > 0.006 && Math.abs(dTilt) < 0.4) {
            this.velZ = dTilt * 1.5;
          }
        }
      }

      // 3. Wrist Pitch delta (tilting wrist up/down adds smooth pitch velocity in both modes)
      if (pitch !== undefined && this.lastPitch !== null) {
        let dPitch = pitch - this.lastPitch;
        if (dPitch > Math.PI) dPitch -= 2 * Math.PI;
        if (dPitch < -Math.PI) dPitch += 2 * Math.PI;
        if (Math.abs(dPitch) > 0.006 && Math.abs(dPitch) < 0.4) {
          this.velX += -dPitch * 1.6;
        }
      }

      // 4. Depth proximity scaling (moving cupped hand closer/farther like pulling/pushing orb)
      if (depth !== undefined && this.lastDepth !== null && isHoldingOrb) {
        const dDepth = depth - this.lastDepth;
        if (Math.abs(dDepth) > 0.0035 && Math.abs(dDepth) < 0.12) {
          const zoomDelta = dDepth * 2.6;
          this.velZoom += zoomDelta * 0.2;
          this.zoom = this.clampZoom(this.zoom + zoomDelta);
        }
      }

      this.lastHandX = x;
      this.lastHandY = y;
      this.lastTilt = tilt !== undefined ? tilt : null;
      this.lastPitch = pitch !== undefined ? pitch : null;
      this.lastDepth = depth !== undefined ? depth : null;
      this.lastPinchDist = null;

    } else if (type === 'PINCH' || type === 'ZOOM' || type === 'DUAL_PINCH') {
      this.isHoldingOrbMode = false;
      // Lock rotation to prevent erratic spinning while zooming
      this.velX = 0;
      this.velY = 0;
      this.velZ = 0;

      // DUAL PALM PINCH ZOOM: Zoom in when expanding distance between both pinched hands, zoom out when contracting
      if (pinchDist !== undefined && this.lastPinchDist !== null) {
        const deltaSpan = pinchDist - this.lastPinchDist;
        const clampedSpan = Math.max(-0.06, Math.min(0.06, deltaSpan));
        if (Math.abs(clampedSpan) > 0.001) {
          const zoomDelta = clampedSpan * 3.8;
          this.velZoom += zoomDelta * 0.25;
          this.zoom = this.clampZoom(this.zoom + zoomDelta);
        }
      }

      this.lastPinchDist = pinchDist !== undefined ? pinchDist : null;
      this.lastHandX = null;
      this.lastHandY = null;
      this.lastTilt = null;
      this.lastPitch = null;
      this.lastDepth = null;

    } else if (type === 'FIST' || type === 'PAUSED') {
      // CLOSED FIST -> PAUSE rotation & zoom
      this.isHoldingOrbMode = false;
      this.velX = 0;
      this.velY = 0;
      this.velZ = 0;
      this.velZoom = 0;
      this.lastHandX = null;
      this.lastHandY = null;
      this.lastTilt = null;
      this.lastPitch = null;
      this.lastDepth = null;
      this.lastPinchDist = null;

    } else {
      this.isHoldingOrbMode = false;
      this.lastHandX = null;
      this.lastHandY = null;
      this.lastTilt = null;
      this.lastPitch = null;
      this.lastDepth = null;
      this.lastPinchDist = null;
    }
  }
}
