import * as THREE from 'three';
import { CoreInteraction } from './CoreInteraction';
import { getStateVisualProfile, type StateVisualProfile } from './CoreState';
import { CoreGeometry } from './layers/CoreGeometry';
import { OuterShell } from './layers/OuterShell';
import { OrbitalRings } from './layers/OrbitalRings';
import { EnergyArcs } from './layers/EnergyArcs';
import { GlyphField } from './layers/GlyphField';
import { ParticleField } from './layers/ParticleField';
import { DebrisField } from './layers/DebrisField';
import { ScanRings } from './layers/ScanRings';
import { PostProcessing } from './PostProcessing';
import { audioAnalyzer } from '../../services/audioAnalyzer';
import type { SystemState } from '../../store/jarvisStore';

/**
 * NeuralCoreScene
 * Coordinates the full Three.js scene graph, camera, animation loop,
 * multi-layered holographic orb, voice/audio reactivity, and state transitions.
 */
export class NeuralCoreScene {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private postProcessing: PostProcessing;

  // Root container for orb rotation
  private orbRoot: THREE.Group;

  // Visual layers
  private coreGeometry: CoreGeometry;
  private outerShell: OuterShell;
  private orbitalRings: OrbitalRings;
  private energyArcs: EnergyArcs;
  private glyphField: GlyphField;
  private particleField: ParticleField;
  private debrisField: DebrisField;
  private scanRings: ScanRings;

  public interaction: CoreInteraction;
  public state: SystemState = 'IDLE';
  public reducedMotion = false;

  private clock = new THREE.Clock();
  private time = 0;
  private currentProfile: StateVisualProfile;

  constructor(canvas: HTMLCanvasElement, interaction: CoreInteraction) {
    this.canvas = canvas;
    this.interaction = interaction;
    this.currentProfile = getStateVisualProfile(this.state);

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    // 1. WebGL Renderer with High-DPI and Transparent Background
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    // 2. Camera Setup
    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 7.8);
    this.camera.lookAt(0, 0, 0);

    // 3. Scene Setup
    this.scene = new THREE.Scene();
    this.orbRoot = new THREE.Group();
    this.scene.add(this.orbRoot);

    // 4. Assemble All Visual Layers
    this.coreGeometry = new CoreGeometry();
    this.outerShell = new OuterShell();
    this.orbitalRings = new OrbitalRings();
    this.energyArcs = new EnergyArcs();
    this.glyphField = new GlyphField();
    this.particleField = new ParticleField();
    this.debrisField = new DebrisField();
    this.scanRings = new ScanRings();

    this.orbRoot.add(this.coreGeometry.group);
    this.orbRoot.add(this.outerShell.group);
    this.orbRoot.add(this.orbitalRings.group);
    this.orbRoot.add(this.energyArcs.group);
    this.orbRoot.add(this.glyphField.group);
    this.orbRoot.add(this.particleField.group);
    this.orbRoot.add(this.debrisField.group);
    this.orbRoot.add(this.scanRings.group);

    // 5. Post-Processing Pipeline
    this.postProcessing = new PostProcessing(
      this.renderer,
      this.scene,
      this.camera,
      width,
      height
    );
  }

  public resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.postProcessing.setSize(width, height);
  }

  public render() {
    const delta = this.clock.getDelta();
    this.time += delta;

    // Update physical interaction momentum
    this.interaction.updatePhysics();

    // Fetch state target profile
    const targetProfile = getStateVisualProfile(this.state);
    this.currentProfile = targetProfile;

    // Fetch live audio amplitude (from voice playback or microphone)
    let audioAmp = audioAnalyzer.getAmplitude();
    if (this.state !== 'SPEAKING' && this.state !== 'LISTENING') {
      audioAmp = 0;
    }

    // Apply interactive rotation to Orb Root
    this.orbRoot.rotation.x = this.interaction.rotX;
    this.orbRoot.rotation.y = this.interaction.rotY;

    // Camera zoom and parallax positioning
    const baseZ = 7.8;
    const targetZ = baseZ / this.interaction.zoom;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.1;
    this.camera.position.x = this.interaction.parallaxX;
    this.camera.position.y = -this.interaction.parallaxY;
    this.camera.lookAt(0, 0, 0);

    // Update all layers
    this.coreGeometry.update(this.time, this.currentProfile, audioAmp, this.reducedMotion);
    this.outerShell.update(this.time, this.currentProfile, this.reducedMotion);
    this.orbitalRings.update(this.time, this.currentProfile, this.reducedMotion);
    this.energyArcs.update(this.time, this.currentProfile, audioAmp, this.reducedMotion);
    this.glyphField.update(this.time, this.currentProfile, this.reducedMotion);
    this.particleField.update(this.time, this.currentProfile, audioAmp, this.reducedMotion);
    this.debrisField.update(this.time, this.currentProfile, this.reducedMotion);
    this.scanRings.update(this.time, this.currentProfile, this.reducedMotion);

    // Render via post-processing (or direct fallback)
    this.postProcessing.render();
  }

  public dispose() {
    this.coreGeometry.dispose();
    this.outerShell.dispose();
    this.orbitalRings.dispose();
    this.energyArcs.dispose();
    this.glyphField.dispose();
    this.particleField.dispose();
    this.debrisField.dispose();
    this.scanRings.dispose();
    this.postProcessing.dispose();
    this.renderer.dispose();
  }
}
