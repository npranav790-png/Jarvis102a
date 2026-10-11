import * as THREE from 'three';
import { THREE_PALETTE, type StateVisualProfile } from '../CoreState';

/**
 * Layer C — Inner Core (Central Energy Singularity)
 * Complex multi-layered core featuring:
 * - Glowing energy singularity sphere
 * - 3-axis nested gimbal micro-rings
 * - Faceted internal octahedron
 * - Outer wireframe icosahedron with glowing vertex nodes
 * - Audio-reactive breathing and radiant light pulses
 */
export class CoreGeometry {
  public group: THREE.Group;

  private singularityMesh: THREE.Mesh;
  private singularityMat: THREE.MeshBasicMaterial;

  private haloMesh: THREE.Mesh;
  private haloMat: THREE.MeshBasicMaterial;

  private gimbalRings: THREE.Group;
  private octahedronMesh: THREE.LineSegments;
  private icosahedronLines: THREE.LineSegments;
  private icosahedronPoints: THREE.Points;

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor() {
    this.group = new THREE.Group();

    // 1. Central Luminous Energy Sphere
    const sphereGeom = new THREE.SphereGeometry(0.36, 32, 32);
    this.geometries.push(sphereGeom);
    this.singularityMat = new THREE.MeshBasicMaterial({
      color: THREE_PALETTE.whiteBlue,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.materials.push(this.singularityMat);
    this.singularityMesh = new THREE.Mesh(sphereGeom, this.singularityMat);
    this.group.add(this.singularityMesh);

    // 2. Soft Luminous Halo Sphere
    const haloGeom = new THREE.SphereGeometry(0.68, 24, 24);
    this.geometries.push(haloGeom);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: THREE_PALETTE.electricCyan,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: false,
    });
    this.materials.push(this.haloMat);
    this.haloMesh = new THREE.Mesh(haloGeom, this.haloMat);
    this.group.add(this.haloMesh);

    // 3. 3-Axis Internal Gimbal Rings (Radius 0.52)
    this.gimbalRings = new THREE.Group();
    this.group.add(this.gimbalRings);

    const ringRadii = [0.48, 0.54, 0.60];
    const ringRotations = [
      new THREE.Euler(0, 0, 0),
      new THREE.Euler(Math.PI / 2, 0, 0),
      new THREE.Euler(0, Math.PI / 2, 0),
    ];

    ringRadii.forEach((r, idx) => {
      const ringPts: THREE.Vector3[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const a = (i * Math.PI * 2) / steps;
        ringPts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      const ringGeom = new THREE.BufferGeometry().setFromPoints(ringPts);
      this.geometries.push(ringGeom);

      const ringMat = new THREE.LineBasicMaterial({
        color: idx === 1 ? THREE_PALETTE.whiteBlue : THREE_PALETTE.electricCyan,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.materials.push(ringMat);

      const ringLine = new THREE.Line(ringGeom, ringMat);
      ringLine.rotation.copy(ringRotations[idx]);
      this.gimbalRings.add(ringLine);
    });

    // 4. Faceted Inner Octahedron (Radius 0.75)
    const octaGeom = new THREE.OctahedronGeometry(0.75, 0);
    const octaWire = new THREE.WireframeGeometry(octaGeom);
    this.geometries.push(octaGeom, octaWire);

    const octaMat = new THREE.LineBasicMaterial({
      color: THREE_PALETTE.secondary,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.materials.push(octaMat);
    this.octahedronMesh = new THREE.LineSegments(octaWire, octaMat);
    this.group.add(this.octahedronMesh);

    // 5. Outer Wireframe Icosahedron with Node Vertices (Radius 1.05)
    const icoGeom = new THREE.IcosahedronGeometry(1.05, 1);
    const icoWire = new THREE.WireframeGeometry(icoGeom);
    this.geometries.push(icoGeom, icoWire);

    const icoMat = new THREE.LineBasicMaterial({
      color: THREE_PALETTE.primary,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.materials.push(icoMat);
    this.icosahedronLines = new THREE.LineSegments(icoWire, icoMat);
    this.group.add(this.icosahedronLines);

    // Vertex Points on Icosahedron
    const ptsMat = new THREE.PointsMaterial({
      color: THREE_PALETTE.whiteBlue,
      size: 0.06,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.materials.push(ptsMat);
    this.icosahedronPoints = new THREE.Points(icoGeom, ptsMat);
    this.group.add(this.icosahedronPoints);
  }

  public update(time: number, profile: StateVisualProfile, audioAmplitude: number, reducedMotion: boolean) {
    const speedMult = reducedMotion ? profile.ringSpeedMult * 0.15 : profile.ringSpeedMult;

    // 1. Core Breathing & Audio Flare
    const basePulse = Math.sin(time * profile.pulseFrequency) * profile.pulseAmplitude;
    const voiceBoost = audioAmplitude * 0.45;
    const totalScale = 1.0 + basePulse + voiceBoost;

    this.singularityMesh.scale.set(totalScale, totalScale, totalScale);
    this.haloMesh.scale.set(
      totalScale * (1.0 + audioAmplitude * 0.35),
      totalScale * (1.0 + audioAmplitude * 0.35),
      totalScale * (1.0 + audioAmplitude * 0.35)
    );

    // Brightness Modulation
    const brightnessMult = profile.coreBrightness * (1.0 + audioAmplitude * 1.2);
    this.singularityMat.opacity = Math.min(1.0, 0.75 * brightnessMult);
    this.haloMat.opacity = Math.min(0.85, 0.22 * brightnessMult);

    // 2. High-speed nested Gimbal rotations
    if (!reducedMotion) {
      this.gimbalRings.children.forEach((child, i) => {
        const factor = (i + 1) * 0.012 * speedMult;
        child.rotation.z += factor;
        child.rotation.x += factor * 0.7;
      });

      // Octahedron tumbling
      this.octahedronMesh.rotation.x += 0.006 * speedMult;
      this.octahedronMesh.rotation.y += 0.009 * speedMult;

      // Icosahedron slow noble rotation
      this.icosahedronLines.rotation.y -= 0.003 * speedMult;
      this.icosahedronLines.rotation.x = Math.sin(time * 0.8) * 0.1;
      this.icosahedronPoints.rotation.copy(this.icosahedronLines.rotation);
    }
  }

  public dispose() {
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose());
    this.geometries = [];
    this.materials = [];
  }
}
