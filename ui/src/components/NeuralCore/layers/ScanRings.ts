import * as THREE from 'three';
import { THREE_PALETTE, type StateVisualProfile } from '../CoreState';

interface ScanPulse {
  mesh: THREE.Line;
  material: THREE.LineBasicMaterial;
  progress: number;
  active: boolean;
  inclination: THREE.Euler;
  speed: number;
}

/**
 * Scanning Effect (Scan Rings)
 * Periodic holographic scanning waves that expand outward from the core,
 * sweep through the outer shell, fade, and repeat.
 */
export class ScanRings {
  public group: THREE.Group;
  private pulses: ScanPulse[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private lastTriggerTime = 0;

  private readonly R_MIN = 0.45;
  private readonly R_MAX = 4.2;

  constructor() {
    this.group = new THREE.Group();

    // 2 scan wave ring structures
    for (let p = 0; p < 2; p++) {
      const points: THREE.Vector3[] = [];
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const a = (i * Math.PI * 2) / steps;
        points.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      }

      const geom = new THREE.BufferGeometry().setFromPoints(points);
      this.geometries.push(geom);

      const mat = new THREE.LineBasicMaterial({
        color: THREE_PALETTE.electricCyan,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.materials.push(mat);

      const line = new THREE.Line(geom, mat);
      const inc = new THREE.Euler(
        (p === 0 ? 0.15 : -0.35),
        0,
        (p === 0 ? -0.2 : 0.4)
      );
      line.rotation.copy(inc);
      this.group.add(line);

      this.pulses.push({
        mesh: line,
        material: mat,
        progress: 1.0, // inactive initially
        active: false,
        inclination: inc,
        speed: 0.55 + p * 0.1,
      });
    }
  }

  public triggerScan() {
    const inactive = this.pulses.find(p => !p.active);
    if (inactive) {
      inactive.active = true;
      inactive.progress = 0;
    }
  }

  public update(time: number, profile: StateVisualProfile, reducedMotion: boolean, audioBass = 0) {
    if (reducedMotion) return;

    // Periodic trigger check or audio bass surge trigger
    const interval = audioBass > 0.35 ? profile.scanInterval * 0.45 : profile.scanInterval;
    if (time - this.lastTriggerTime > interval) {
      this.lastTriggerTime = time;
      this.triggerScan();
    }

    this.pulses.forEach(pulse => {
      if (!pulse.active) return;

      pulse.progress += 0.012 * pulse.speed;

      if (pulse.progress >= 1.0) {
        pulse.active = false;
        pulse.progress = 1.0;
        pulse.material.opacity = 0;
        return;
      }

      // Smooth expansion from R_MIN to R_MAX
      const curRadius = this.R_MIN + Math.pow(pulse.progress, 0.85) * (this.R_MAX - this.R_MIN);
      pulse.mesh.scale.set(curRadius, curRadius, curRadius);

      // Fade envelope: rises quickly near core, peaks, fades gently as it passes shell
      let alpha: number;
      if (pulse.progress < 0.2) {
        alpha = pulse.progress / 0.2;
      } else {
        alpha = Math.max(0, 1.0 - (pulse.progress - 0.2) / 0.8);
      }

      pulse.material.opacity = alpha * 0.75 * (profile.coreBrightness > 1.2 ? 1.3 : 1.0);
    });
  }

  public dispose() {
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose());
    this.geometries = [];
    this.materials = [];
    this.pulses = [];
  }
}
