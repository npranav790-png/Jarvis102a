import * as THREE from 'three';
import { THREE_PALETTE, type StateVisualProfile } from '../CoreState';

/**
 * Layer F — Particle Field
 * 1800 ambient particles categorized into:
 * - Inner particles: Dense near core (R: 0.45 - 1.45)
 * - Outer particles: Sparse around orb (R: 1.45 - 2.85)
 * - Ambient dust: Faint atmospheric dust extending outwards (R: 2.85 - 4.6)
 *
 * GPU-driven via custom ShaderMaterial with camera depth attenuation and 1 draw call.
 */
export class ParticleField {
  public group: THREE.Group;
  private pointsMesh: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  constructor() {
    this.group = new THREE.Group();

    const count = 1800;
    const positions = new Float32Array(count * 3);
    const originalPos = new Float32Array(count * 3); // radius, theta, phi
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const groups = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      let radius: number;
      let groupType: number;
      let size: number;
      let col: THREE.Color;

      if (i < 700) {
        // Inner particles
        groupType = 0;
        radius = 0.45 + Math.random() * 0.95;
        size = 2.4 + Math.random() * 2.2;
        col = Math.random() > 0.4 ? THREE_PALETTE.electricCyan : THREE_PALETTE.whiteBlue;
      } else if (i < 1450) {
        // Outer particles
        groupType = 1;
        radius = 1.45 + Math.random() * 1.4;
        size = 1.8 + Math.random() * 1.8;
        col = Math.random() > 0.5 ? THREE_PALETTE.primary : THREE_PALETTE.secondary;
      } else {
        // Ambient dust
        groupType = 2;
        radius = 2.85 + Math.random() * 1.75;
        size = 1.2 + Math.random() * 1.2;
        col = THREE_PALETTE.deepBlue;
      }

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      originalPos[i * 3] = radius;
      originalPos[i * 3 + 1] = theta;
      originalPos[i * 3 + 2] = phi;

      speeds[i] = (0.08 + Math.random() * 0.25) * (groupType === 0 ? 1.6 : 0.8) * (Math.random() > 0.5 ? 1 : -1);
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = size;

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      groups[i] = groupType;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aOriginalPos', new THREE.BufferAttribute(originalPos, 3));
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('aGroup', new THREE.BufferAttribute(groups, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSpeedMult: { value: 1.0 },
        uBrightness: { value: 1.0 },
        uAudio: { value: 0 },
      },
      vertexShader: `
        attribute vec3 aOriginalPos;
        attribute float aSpeed;
        attribute float aPhase;
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aGroup;

        uniform float uTime;
        uniform float uSpeedMult;
        uniform float uAudio;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = aColor;

          float r = aOriginalPos.x;
          float theta = aOriginalPos.y;
          float phi = aOriginalPos.z;

          // Swirl orbital rotation
          float audioSwirl = (aGroup == 0.0) ? uAudio * 1.5 : 0.0;
          float curTheta = theta + (aSpeed * (uSpeedMult + audioSwirl) * uTime);
          
          // Organic spherical coordinate displacement
          float rDynamic = r + sin(uTime * 1.5 + aPhase) * 0.04 * (1.0 + uAudio * 0.6);
          float curPhi = phi + cos(uTime * 0.8 + aPhase) * 0.03;

          vec3 pos;
          pos.x = rDynamic * sin(curPhi) * cos(curTheta);
          pos.y = rDynamic * cos(curPhi);
          pos.z = rDynamic * sin(curPhi) * sin(curTheta);

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // Depth-based particle scale attenuation
          float distToCam = -mvPosition.z;
          float pSize = aSize * (450.0 / max(1.0, distToCam));
          if (aGroup == 0.0) {
            pSize *= (1.0 + uAudio * 0.8);
          }
          gl_PointSize = clamp(pSize, 1.0, 32.0);

          // Depth-based opacity fading: closer slightly brighter, distant dimmer
          float depthFade = clamp(1.2 - (distToCam / 14.0), 0.25, 1.0);
          float groupBaseAlpha = (aGroup == 0.0) ? 0.85 : ((aGroup == 1.0) ? 0.65 : 0.35);
          vAlpha = groupBaseAlpha * depthFade;
        }
      `,
      fragmentShader: `
        uniform float uBrightness;
        uniform float uAudio;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Circular Gaussian point sprite
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;

          float falloff = smoothstep(0.5, 0.02, dist);
          float finalAlpha = falloff * vAlpha * (uBrightness + uAudio * 0.5);

          gl_FragColor = vec4(vColor, clamp(finalAlpha, 0.0, 1.0));
        }
      `,
    });

    this.pointsMesh = new THREE.Points(this.geometry, this.material);
    this.group.add(this.pointsMesh);
  }

  public update(time: number, profile: StateVisualProfile, audioAmplitude: number, reducedMotion: boolean) {
    const speedMult = reducedMotion ? profile.particleSpeedMult * 0.15 : profile.particleSpeedMult;

    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uSpeedMult.value = speedMult;
    this.material.uniforms.uBrightness.value = profile.coreBrightness;
    this.material.uniforms.uAudio.value = audioAmplitude;
  }

  public dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
