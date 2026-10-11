/**
 * CoreInteraction
 * Handles user interaction for the Neural Core:
 * - Pointer drag with momentum and friction
 * - Multi-touch & trackpad pinch zoom
 * - MediaPipe hand gesture control (PALM -> rotate, PINCH -> zoom, FIST -> pause)
 * - Subtle mouse parallax for spatial 3D presence
 * - Keyboard shortcuts (r/0 to reset, +/- to zoom)
 * - Smooth inertia and damping
 */

export class CoreInteraction {
  public rotX = 0;
  public rotY = 0;
  public zoom = 1.0;

  public velX = 0;
  public velY = 0;
  public velZoom = 0;

  // Parallax offsets for subtle spatial presence
  public targetParallaxX = 0;
  public targetParallaxY = 0;
  public parallaxX = 0;
  public parallaxY = 0;

  private isDragging = false;
  private activePointers = new Map<number, { x: number; y: number }>();
  private initialPinchDist: number | null = null;
  private initialPinchZoom = 1.0;

  // Hand gesture tracking state
  private lastHandX: number | null = null;
  private lastHandY: number | null = null;
  private lastPinchDist: number | null = null;
  private lastPinchY: number | null = null;

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
      this.rotX += this.velX;
      this.rotY += this.velY;
      this.zoom = this.clampZoom(this.zoom + this.velZoom);

      if (!this.isDragging) {
        this.velX *= this.friction;
        this.velY *= this.friction;
      }
      this.velZoom *= this.friction;

      // Gentle continuous ambient drift when idle
      if (!this.isDragging && Math.abs(this.velX) < 0.0001 && Math.abs(this.velY) < 0.0001) {
        this.rotY += 0.0015;
      }
    } else {
      if (!this.isDragging) {
        this.rotY += 0.0005;
      }
    }
  }

  public reset() {
    this.rotX = 0;
    this.rotY = 0;
    this.zoom = 1.0;
    this.velX = 0;
    this.velY = 0;
    this.velZoom = 0;
    this.targetParallaxX = 0;
    this.targetParallaxY = 0;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.lastHandX = null;
    this.lastHandY = null;
    this.lastPinchDist = null;
    this.lastPinchY = null;
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

  public applyGesture(type: string, x: number, y: number, pinchDist?: number) {
    if (type === 'PALM') {
      // OPEN PALM -> ROTATE with smooth velocity
      if (this.lastHandX !== null && this.lastHandY !== null) {
        const dx = x - this.lastHandX;
        const dy = y - this.lastHandY;

        // Anti-jitter deadzone threshold
        if (Math.hypot(dx, dy) > 0.0025) {
          this.velY = -dx * 2.4;
          this.velX = dy * 2.4;
          this.rotY += this.velY;
          this.rotX += this.velX;
        }
      }
      this.lastHandX = x;
      this.lastHandY = y;
      this.lastPinchDist = null;
      this.lastPinchY = null;

    } else if (type === 'PINCH') {
      // PINCH -> ZOOM
      if (pinchDist !== undefined && this.lastPinchDist !== null) {
        const deltaAperture = pinchDist - this.lastPinchDist;
        if (Math.abs(deltaAperture) > 0.0018) {
          const zoomDelta = deltaAperture * 3.5;
          this.velZoom += zoomDelta * 0.25;
          this.zoom = this.clampZoom(this.zoom + zoomDelta);
        }
      }

      if (this.lastPinchY !== null) {
        const deltaY = -(y - this.lastPinchY);
        if (Math.abs(deltaY) > 0.003) {
          const zoomDelta = deltaY * 1.8;
          this.velZoom += zoomDelta * 0.2;
          this.zoom = this.clampZoom(this.zoom + zoomDelta);
        }
      }

      this.lastPinchDist = pinchDist !== undefined ? pinchDist : null;
      this.lastPinchY = y;
      this.lastHandX = null;
      this.lastHandY = null;

    } else if (type === 'FIST' || type === 'PAUSED') {
      // CLOSED FIST -> PAUSE rotation & zoom
      this.velX = 0;
      this.velY = 0;
      this.velZoom = 0;
      this.lastHandX = null;
      this.lastHandY = null;
      this.lastPinchDist = null;
      this.lastPinchY = null;

    } else {
      this.lastHandX = null;
      this.lastHandY = null;
      this.lastPinchDist = null;
      this.lastPinchY = null;
    }
  }
}
