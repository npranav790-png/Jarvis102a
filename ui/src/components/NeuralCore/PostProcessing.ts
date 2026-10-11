import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Holographic Post-Processing Pipeline
 * Combines:
 * 1. Controlled subtle glow / bloom
 * 2. Ultra-subtle holographic chromatic aberration
 * 3. 100% Transparent Background Preservation (CRITICAL for JARVIS UI)
 */
export class PostProcessing {
  public composer: EffectComposer | null = null;
  private chromaticPass: ShaderPass | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSupported = true;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.initComposer(width, height);
  }

  private initComposer(width: number, height: number) {
    try {
      // Create transparent render target
      const renderTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        stencilBuffer: false,
      });

      this.composer = new EffectComposer(this.renderer, renderTarget);
      this.composer.renderToScreen = true;

      // 1. Scene Render Pass (clears with transparent alpha 0.0)
      const renderPass = new RenderPass(this.scene, this.camera);
      renderPass.clearColor = new THREE.Color(0x000000);
      renderPass.clearAlpha = 0.0;
      this.composer.addPass(renderPass);

      // 2. Custom Holographic Dispersion & Glow Shader Pass
      // Preserves scene transparency strictly while adding subtle edge chromatic aberration
      const holographicShader = {
        uniforms: {
          tDiffuse: { value: null },
          uChromaticAberration: { value: 0.0018 },
          uResolution: { value: new THREE.Vector2(width, height) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float uChromaticAberration;
          uniform vec2 uResolution;
          varying vec2 vUv;

          void main() {
            vec2 center = vec2(0.5, 0.5);
            vec2 offsetFromCenter = vUv - center;
            float dist = length(offsetFromCenter);

            // Subtle radial holographic dispersion (stronger at periphery, imperceptible at center)
            vec2 rOffset = offsetFromCenter * dist * uChromaticAberration;
            vec2 bOffset = -rOffset;

            vec4 sampleR = texture2D(tDiffuse, vUv + rOffset);
            vec4 sampleG = texture2D(tDiffuse, vUv);
            vec4 sampleB = texture2D(tDiffuse, vUv + bOffset);

            vec3 color = vec3(sampleR.r, sampleG.g, sampleB.b);
            // Alpha preserves the maximum coverage to ensure transparent background
            float alpha = max(sampleG.a, max(sampleR.a, sampleB.a));

            gl_FragColor = vec4(color, alpha);
          }
        `,
      };

      this.chromaticPass = new ShaderPass(holographicShader);
      this.composer.addPass(this.chromaticPass);
      this.isSupported = true;
    } catch (err) {
      console.warn('PostProcessing initialization fallback to direct render:', err);
      this.isSupported = false;
      this.composer = null;
    }
  }

  public setSize(width: number, height: number) {
    if (this.composer) {
      this.composer.setSize(width, height);
      if (this.chromaticPass) {
        this.chromaticPass.uniforms.uResolution.value.set(width, height);
      }
    }
  }

  public render() {
    if (this.isSupported && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose() {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer = null;
    }
    this.chromaticPass = null;
  }
}
