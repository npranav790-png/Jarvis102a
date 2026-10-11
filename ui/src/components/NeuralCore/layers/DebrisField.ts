import * as THREE from 'three';
import { THREE_PALETTE, type StateVisualProfile } from '../CoreState';

interface DebrisData {
  radius: number;
  inclination: THREE.Euler;
  orbitAngle: number;
  orbitSpeed: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  scale: number;
}

/**
 * Layer G — Orbiting Debris
 * 160 tiny geometric fragments (tetrahedrons/micro-polyhedrons)
 * moving around the orb at varying distances via InstancedMesh (1 draw call).
 */
export class DebrisField {
  public group: THREE.Group;
  private instancedMesh: THREE.InstancedMesh;
  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshBasicMaterial;
  private debrisList: DebrisData[] = [];
  private dummyMatrix = new THREE.Matrix4();
  private dummyPosition = new THREE.Vector3();
  private dummyRotation = new THREE.Euler();
  private dummyScale = new THREE.Vector3();

  constructor() {
    this.group = new THREE.Group();
    const count = 160;

    this.geometry = new THREE.TetrahedronGeometry(0.038);
    this.material = new THREE.MeshBasicMaterial({
      color: THREE_PALETTE.electricCyan,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.instancedMesh);

    // Initialize debris properties
    for (let i = 0; i < count; i++) {
      const radius = 1.75 + Math.random() * 1.65;
      const inclination = new THREE.Euler(
        (Math.random() - 0.5) * Math.PI,
        (Math.random() - 0.5) * Math.PI,
        (Math.random() - 0.5) * Math.PI
      );

      this.debrisList.push({
        radius,
        inclination,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed: (0.0015 + Math.random() * 0.004) * (Math.random() > 0.5 ? 1 : -1),
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        rotZ: Math.random() * Math.PI * 2,
        rotSpeedX: (Math.random() - 0.5) * 0.04,
        rotSpeedY: (Math.random() - 0.5) * 0.04,
        rotSpeedZ: (Math.random() - 0.5) * 0.04,
        scale: 0.7 + Math.random() * 0.6,
      });
    }
  }

  public update(_time: number, profile: StateVisualProfile, reducedMotion: boolean) {
    const speedMult = reducedMotion ? profile.ringSpeedMult * 0.15 : profile.ringSpeedMult;

    for (let i = 0; i < this.debrisList.length; i++) {
      const d = this.debrisList[i];
      d.orbitAngle += d.orbitSpeed * speedMult;
      d.rotX += d.rotSpeedX * speedMult;
      d.rotY += d.rotSpeedY * speedMult;
      d.rotZ += d.rotSpeedZ * speedMult;

      // Position along inclined orbit
      const localX = Math.cos(d.orbitAngle) * d.radius;
      const localZ = Math.sin(d.orbitAngle) * d.radius;
      const localY = Math.sin(d.orbitAngle * 2 + i) * 0.12;

      this.dummyPosition.set(localX, localY, localZ);
      this.dummyPosition.applyEuler(d.inclination);

      this.dummyRotation.set(d.rotX, d.rotY, d.rotZ);
      this.dummyScale.set(d.scale, d.scale, d.scale);

      this.dummyMatrix.makeRotationFromEuler(this.dummyRotation);
      this.dummyMatrix.setPosition(this.dummyPosition);
      this.dummyMatrix.scale(this.dummyScale);

      this.instancedMesh.setMatrixAt(i, this.dummyMatrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.material.opacity = Math.min(0.7, 0.35 * (profile.coreBrightness > 1.2 ? 1.3 : 1.0));
  }

  public dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.debrisList = [];
  }
}
