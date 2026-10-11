import * as THREE from 'three';
import { THREE_PALETTE, type StateVisualProfile } from '../CoreState';

/**
 * Layer A — Outer Sphere (Holographic Wireframe Shell)
 * Procedural spherical structure featuring broken latitude/meridian rings,
 * partial arcs, flowing holographic energy lines, and depth-based fading.
 */
export class OuterShell {
  public group: THREE.Group;
  private shellA: THREE.Group;
  private shellB: THREE.Group;
  private materials: THREE.LineBasicMaterial[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private animatedLines: { line: THREE.Line; baseAlpha: number; speed: number; phase: number }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.shellA = new THREE.Group();
    this.shellB = new THREE.Group();
    this.group.add(this.shellA);
    this.group.add(this.shellB);

    this.buildShellA(2.4);
    this.buildShellB(2.6);
  }

  private buildShellA(radius: number) {
    // 1. Latitude rings with broken arcs
    const latitudes = [-1.1, -0.8, -0.5, -0.25, 0, 0.25, 0.5, 0.8, 1.1];
    latitudes.forEach((lat, latIdx) => {
      const rAtLat = radius * Math.cos(lat);
      const yAtLat = radius * Math.sin(lat);
      const numSegments = 5 + (latIdx % 3);

      for (let s = 0; s < numSegments; s++) {
        // Skip random gaps to create broken technical segments
        if ((s + latIdx) % 3 === 0) continue;

        const startAngle = (s * Math.PI * 2) / numSegments + (latIdx * 0.4);
        const arcLength = (Math.PI * 2 / numSegments) * (0.45 + Math.random() * 0.45);
        const points: THREE.Vector3[] = [];
        const steps = 16;

        for (let i = 0; i <= steps; i++) {
          const a = startAngle + (arcLength * i) / steps;
          points.push(new THREE.Vector3(Math.cos(a) * rAtLat, yAtLat, Math.sin(a) * rAtLat));
        }

        const geom = new THREE.BufferGeometry().setFromPoints(points);
        this.geometries.push(geom);

        const isHighlight = Math.random() > 0.75;
        const baseAlpha = isHighlight ? 0.75 : 0.28 + Math.random() * 0.25;
        const color = isHighlight ? THREE_PALETTE.electricCyan : THREE_PALETTE.primary;

        const mat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: baseAlpha,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        this.materials.push(mat);

        const line = new THREE.Line(geom, mat);
        this.shellA.add(line);

        this.animatedLines.push({
          line,
          baseAlpha,
          speed: 1.0 + Math.random() * 2.0,
          phase: Math.random() * Math.PI * 2,
        });
      }
    });

    // 2. Meridian / Longitude Broken Arcs
    const numMeridians = 12;
    for (let m = 0; m < numMeridians; m++) {
      const lon = (m * Math.PI * 2) / numMeridians;
      const numArcs = 3;

      for (let a = 0; a < numArcs; a++) {
        const startLat = -Math.PI / 2 + (a * Math.PI) / numArcs + 0.15;
        const latSpan = (Math.PI / numArcs) * 0.7;
        const points: THREE.Vector3[] = [];
        const steps = 14;

        for (let i = 0; i <= steps; i++) {
          const curLat = startLat + (latSpan * i) / steps;
          const x = radius * Math.cos(curLat) * Math.cos(lon);
          const y = radius * Math.sin(curLat);
          const z = radius * Math.cos(curLat) * Math.sin(lon);
          points.push(new THREE.Vector3(x, y, z));
        }

        const geom = new THREE.BufferGeometry().setFromPoints(points);
        this.geometries.push(geom);

        const baseAlpha = 0.22 + Math.random() * 0.3;
        const mat = new THREE.LineBasicMaterial({
          color: THREE_PALETTE.secondary,
          transparent: true,
          opacity: baseAlpha,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        this.materials.push(mat);

        const line = new THREE.Line(geom, mat);
        this.shellA.add(line);

        this.animatedLines.push({
          line,
          baseAlpha,
          speed: 0.8 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  private buildShellB(radius: number) {
    // Secondary counter-shell with fine triangular geodesics and partial scanning arcs
    const pointsOnSphere: THREE.Vector3[] = [];
    const count = 38;
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      pointsOnSphere.push(
        new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi)
        )
      );
    }

    // Connect close neighbors with fine holographic lines
    for (let i = 0; i < pointsOnSphere.length; i++) {
      for (let j = i + 1; j < pointsOnSphere.length; j++) {
        const dist = pointsOnSphere[i].distanceTo(pointsOnSphere[j]);
        if (dist < 1.35) {
          const geom = new THREE.BufferGeometry().setFromPoints([pointsOnSphere[i], pointsOnSphere[j]]);
          this.geometries.push(geom);

          const baseAlpha = 0.18 + Math.random() * 0.25;
          const mat = new THREE.LineBasicMaterial({
            color: THREE_PALETTE.deepBlue,
            transparent: true,
            opacity: baseAlpha,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          this.materials.push(mat);

          const line = new THREE.Line(geom, mat);
          this.shellB.add(line);

          this.animatedLines.push({
            line,
            baseAlpha,
            speed: 1.2 + Math.random() * 1.8,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
    }
  }

  public update(time: number, profile: StateVisualProfile, reducedMotion: boolean) {
    const speedMult = reducedMotion ? profile.ringSpeedMult * 0.15 : profile.ringSpeedMult;

    // Independent multi-axis rotations
    this.shellA.rotation.y += 0.0025 * speedMult;
    this.shellA.rotation.x = Math.sin(time * 0.3) * 0.08;

    this.shellB.rotation.y -= 0.0018 * speedMult;
    this.shellB.rotation.z += 0.0012 * speedMult;

    // Dynamic fading and pulsing along broken segments
    if (!reducedMotion) {
      this.animatedLines.forEach(item => {
        const pulse = Math.sin(time * item.speed + item.phase);
        const dynamicAlpha = item.baseAlpha * (0.6 + 0.4 * pulse) * (profile.coreBrightness > 1.2 ? 1.25 : 1.0);
        (item.line.material as THREE.LineBasicMaterial).opacity = Math.max(0.08, Math.min(0.95, dynamicAlpha));
      });
    }
  }

  public dispose() {
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose());
    this.geometries = [];
    this.materials = [];
    this.animatedLines = [];
  }
}
