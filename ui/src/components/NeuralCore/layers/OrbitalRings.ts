import * as THREE from 'three';
import { THREE_PALETTE, type StateVisualProfile } from '../CoreState';

interface OrbitalLayer {
  group: THREE.Group;
  rotationAxis: THREE.Vector3;
  baseSpeed: number;
  arcs: { line: THREE.Line; baseOpacity: number }[];
}

/**
 * Layer B — Orbital Rings
 * 4 major inclined orbital structures around the core with unique inclinations,
 * broken arc segments, technical graduation ticks, and counter-rotating velocities.
 */
export class OrbitalRings {
  public group: THREE.Group;
  private layers: OrbitalLayer[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.buildOrbitalLayers();
  }

  private buildOrbitalLayers() {
    const layerConfigs = [
      {
        radius: 1.65,
        inclination: new THREE.Euler(0.42, 0.25, 0.75),
        speed: 0.0045,
        arcs: [
          { start: 0, length: Math.PI * 0.75, color: THREE_PALETTE.electricCyan, opacity: 0.75, width: 2 },
          { start: Math.PI * 0.9, length: Math.PI * 0.35, color: THREE_PALETTE.primary, opacity: 0.5, width: 1 },
          { start: Math.PI * 1.4, length: Math.PI * 0.45, color: THREE_PALETTE.secondary, opacity: 0.4, width: 1 },
        ],
        hasTicks: true,
      },
      {
        radius: 2.15,
        inclination: new THREE.Euler(-0.65, 0.85, -0.35),
        speed: -0.0035,
        arcs: [
          { start: 0.2, length: Math.PI * 0.95, color: THREE_PALETTE.primary, opacity: 0.65, width: 2 },
          { start: Math.PI * 1.3, length: Math.PI * 0.55, color: THREE_PALETTE.electricCyan, opacity: 0.7, width: 2 },
        ],
        hasTicks: true,
      },
      {
        radius: 2.95,
        inclination: new THREE.Euler(1.15, -0.4, 0.6),
        speed: 0.0025,
        arcs: [
          { start: -0.4, length: Math.PI * 0.6, color: THREE_PALETTE.whiteBlue, opacity: 0.8, width: 2 },
          { start: Math.PI * 0.5, length: Math.PI * 0.4, color: THREE_PALETTE.secondary, opacity: 0.45, width: 1 },
          { start: Math.PI * 1.1, length: Math.PI * 0.7, color: THREE_PALETTE.primary, opacity: 0.55, width: 1 },
        ],
        hasTicks: false,
      },
      {
        radius: 3.45,
        inclination: new THREE.Euler(-0.3, -0.75, 1.25),
        speed: -0.0018,
        arcs: [
          { start: 0.1, length: Math.PI * 0.5, color: THREE_PALETTE.primary, opacity: 0.45, width: 1 },
          { start: Math.PI * 0.8, length: Math.PI * 0.8, color: THREE_PALETTE.deepBlue, opacity: 0.4, width: 1 },
        ],
        hasTicks: true,
      },
    ];

    layerConfigs.forEach((cfg) => {
      const layerGroup = new THREE.Group();
      layerGroup.rotation.copy(cfg.inclination);
      this.group.add(layerGroup);

      const layerArcs: { line: THREE.Line; baseOpacity: number }[] = [];

      // 1. Arc Segments
      cfg.arcs.forEach((arcCfg) => {
        const points: THREE.Vector3[] = [];
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
          const angle = arcCfg.start + (arcCfg.length * i) / steps;
          points.push(new THREE.Vector3(Math.cos(angle) * cfg.radius, Math.sin(angle) * cfg.radius, 0));
        }

        const geom = new THREE.BufferGeometry().setFromPoints(points);
        this.geometries.push(geom);

        const mat = new THREE.LineBasicMaterial({
          color: arcCfg.color,
          transparent: true,
          opacity: arcCfg.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        this.materials.push(mat);

        const line = new THREE.Line(geom, mat);
        layerGroup.add(line);
        layerArcs.push({ line, baseOpacity: arcCfg.opacity });

        // Endpoint accent pips
        const pipsGeom = new THREE.BufferGeometry().setFromPoints([points[0], points[points.length - 1]]);
        this.geometries.push(pipsGeom);
        const pipsMat = new THREE.PointsMaterial({
          color: THREE_PALETTE.whiteBlue,
          size: 0.08,
          transparent: true,
          opacity: Math.min(1.0, arcCfg.opacity * 1.3),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        this.materials.push(pipsMat);
        const pips = new THREE.Points(pipsGeom, pipsMat);
        layerGroup.add(pips);
      });

      // 2. Technical Graduation Ticks
      if (cfg.hasTicks) {
        const tickPoints: THREE.Vector3[] = [];
        const numTicks = 36;
        for (let i = 0; i < numTicks; i++) {
          // Skip sectors for high-tech asymmetric look
          if (i % 6 === 0 || i % 6 === 1) continue;

          const a = (i * Math.PI * 2) / numTicks;
          const rInner = cfg.radius - 0.04;
          const rOuter = cfg.radius + (i % 3 === 0 ? 0.06 : 0.03);

          tickPoints.push(new THREE.Vector3(Math.cos(a) * rInner, Math.sin(a) * rInner, 0));
          tickPoints.push(new THREE.Vector3(Math.cos(a) * rOuter, Math.sin(a) * rOuter, 0));
        }

        const tickGeom = new THREE.BufferGeometry().setFromPoints(tickPoints);
        this.geometries.push(tickGeom);

        const tickMat = new THREE.LineBasicMaterial({
          color: THREE_PALETTE.primary,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        this.materials.push(tickMat);

        const tickSegments = new THREE.LineSegments(tickGeom, tickMat);
        layerGroup.add(tickSegments);
      }

      this.layers.push({
        group: layerGroup,
        rotationAxis: new THREE.Vector3(0, 0, 1),
        baseSpeed: cfg.speed,
        arcs: layerArcs,
      });
    });
  }

  public update(time: number, profile: StateVisualProfile, reducedMotion: boolean, audioMid = 0) {
    const speedMult = reducedMotion
      ? profile.ringSpeedMult * 0.15
      : profile.ringSpeedMult * (1.0 + audioMid * 0.75);

    this.layers.forEach((layer, idx) => {
      // Local axis rotation (clockwise / counter-clockwise)
      layer.group.rotateOnAxis(layer.rotationAxis, layer.baseSpeed * speedMult);

      // Subtle dynamic breathing in response to high energy states and audio voice frequencies
      if (!reducedMotion) {
        const voicePulse = audioMid * 0.08;
        const pulse = 1.0 + Math.sin(time * profile.pulseFrequency + idx) * (profile.pulseAmplitude * 0.25) + voicePulse;
        layer.group.scale.set(pulse, pulse, pulse);

        layer.arcs.forEach(a => {
          const dynamicOpacity = a.baseOpacity * (0.8 + 0.2 * Math.sin(time * 3 + idx) + audioMid * 0.4) * (profile.coreBrightness > 1.2 ? 1.2 : 1.0);
          (a.line.material as THREE.LineBasicMaterial).opacity = Math.max(0.1, Math.min(0.98, dynamicOpacity));
        });
      }
    });
  }

  public dispose() {
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose());
    this.geometries = [];
    this.materials = [];
    this.layers = [];
  }
}
