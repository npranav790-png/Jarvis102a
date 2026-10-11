import * as THREE from 'three';
import { THREE_PALETTE, type StateVisualProfile } from '../CoreState';

interface EnergyArcItem {
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  rotationAxis: THREE.Vector3;
  orbitSpeed: number;
  baseOpacity: number;
  phase: number;
  surgeSpeed: number;
}

/**
 * Layer D — Energy Arcs
 * Irregular, broken energy arcs that do NOT form complete circles.
 * Staggered across multiple radii and 3D inclinations with computational flaring.
 */
export class EnergyArcs {
  public group: THREE.Group;
  private arcs: EnergyArcItem[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.buildEnergyArcs();
  }

  private buildEnergyArcs() {
    const numArcs = 18;

    for (let i = 0; i < numArcs; i++) {
      const radius = 1.35 + (i / numArcs) * 1.05 + (Math.random() * 0.15);
      const spanAngle = (Math.PI / 180) * (25 + Math.random() * 65); // 25 to 90 degrees
      const startAngle = Math.random() * Math.PI * 2;
      const steps = 24;

      const points: THREE.Vector3[] = [];
      for (let s = 0; s <= steps; s++) {
        const a = startAngle + (spanAngle * s) / steps;
        // Subtle organic radial jitter for raw quantum energy feel
        const rJitter = radius * (1.0 + (Math.sin(s * 1.2) * 0.015));
        points.push(new THREE.Vector3(Math.cos(a) * rJitter, Math.sin(a) * rJitter, 0));
      }

      const geom = new THREE.BufferGeometry().setFromPoints(points);
      this.geometries.push(geom);

      const isElectric = Math.random() > 0.6;
      const color = isElectric ? THREE_PALETTE.electricCyan : (Math.random() > 0.5 ? THREE_PALETTE.primary : THREE_PALETTE.whiteBlue);
      const baseOpacity = 0.35 + Math.random() * 0.45;

      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.materials.push(mat);

      const line = new THREE.Line(geom, mat);

      // Random 3D inclination
      line.rotation.set(
        (Math.random() - 0.5) * Math.PI * 2,
        (Math.random() - 0.5) * Math.PI * 2,
        (Math.random() - 0.5) * Math.PI * 2
      );

      this.group.add(line);

      const axis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();

      this.arcs.push({
        line,
        material: mat,
        rotationAxis: axis,
        orbitSpeed: (0.003 + Math.random() * 0.009) * (Math.random() > 0.5 ? 1 : -1),
        baseOpacity,
        phase: Math.random() * Math.PI * 2,
        surgeSpeed: 2.0 + Math.random() * 4.0,
      });
    }
  }

  public update(time: number, profile: StateVisualProfile, audioAmplitude: number, reducedMotion: boolean) {
    const speedMult = reducedMotion ? profile.ringSpeedMult * 0.15 : profile.ringSpeedMult;

    this.arcs.forEach(arc => {
      // Rotate around random inclination axis
      arc.line.rotateOnAxis(arc.rotationAxis, arc.orbitSpeed * speedMult);

      if (!reducedMotion) {
        // High-frequency computational surging
        const surge = Math.sin(time * arc.surgeSpeed + arc.phase);
        const computationalSpike = surge > 0.6 ? (surge - 0.6) * 1.5 : 0;
        const voiceBoost = audioAmplitude * 0.4;

        const dynamicOpacity = (arc.baseOpacity + computationalSpike * profile.arcSurgeChance + voiceBoost) *
          (profile.coreBrightness > 1.2 ? 1.25 : 1.0);

        arc.material.opacity = Math.max(0.12, Math.min(0.95, dynamicOpacity));
      }
    });
  }

  public dispose() {
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose());
    this.geometries = [];
    this.materials = [];
    this.arcs = [];
  }
}
