import * as THREE from 'three';
import { CORE_PALETTE, type StateVisualProfile } from '../CoreState';

const GLYPH_WORDS = [
  'SYS', 'CORE', 'SYNC', 'AI', 'NEURAL', 'EXEC',
  'MEM', 'TASK', 'NODE', 'AUTH', 'DATA', '0x01',
  '0xFF', '1010', 'ONLINE', 'PROCESS', 'LINK', 'MCP', 'AGENT'
];

interface GlyphItem {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  orbitRadius: number;
  orbitAngle: number;
  orbitSpeed: number;
  yPos: number;
  yDriftSpeed: number;
  baseOpacity: number;
  phase: number;
}

/**
 * Layer E — Technical Glyphs
 * Subtle floating technical telemetry markers around the core.
 * Low opacity, small scale, depth-positioned, slow orbital drift.
 */
export class GlyphField {
  public group: THREE.Group;
  private glyphs: GlyphItem[] = [];
  private textures: THREE.CanvasTexture[] = [];
  private materials: THREE.SpriteMaterial[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.buildGlyphs();
  }

  private createGlyphTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 32);
    ctx.font = '600 13px "Courier New", monospace';
    ctx.fillStyle = CORE_PALETTE.primary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 4;
    ctx.shadowColor = CORE_PALETTE.electricCyan;
    ctx.fillText(text, 64, 16);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.textures.push(texture);
    return texture;
  }

  private buildGlyphs() {
    GLYPH_WORDS.forEach((word, idx) => {
      const texture = this.createGlyphTexture(word);
      const baseOpacity = 0.16 + (idx % 4) * 0.05; // Faint, subtle

      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.materials.push(mat);

      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.32, 0.08, 1);

      const orbitRadius = 1.85 + (idx % 6) * 0.25;
      const orbitAngle = (idx * Math.PI * 2) / GLYPH_WORDS.length;
      const yPos = ((idx % 7) - 3) * 0.32;

      sprite.position.set(
        Math.cos(orbitAngle) * orbitRadius,
        yPos,
        Math.sin(orbitAngle) * orbitRadius
      );

      this.group.add(sprite);

      this.glyphs.push({
        sprite,
        material: mat,
        orbitRadius,
        orbitAngle,
        orbitSpeed: (0.001 + (idx % 5) * 0.0006) * ((idx % 2 === 0) ? 1 : -1),
        yPos,
        yDriftSpeed: 0.001 + (idx % 3) * 0.0005,
        baseOpacity,
        phase: Math.random() * Math.PI * 2,
      });
    });
  }

  public update(time: number, profile: StateVisualProfile, reducedMotion: boolean) {
    const speedMult = reducedMotion ? profile.ringSpeedMult * 0.15 : profile.ringSpeedMult;

    this.glyphs.forEach(g => {
      g.orbitAngle += g.orbitSpeed * speedMult;
      const curY = g.yPos + Math.sin(time * g.yDriftSpeed + g.phase) * 0.12;

      g.sprite.position.x = Math.cos(g.orbitAngle) * g.orbitRadius;
      g.sprite.position.z = Math.sin(g.orbitAngle) * g.orbitRadius;
      g.sprite.position.y = curY;

      if (!reducedMotion) {
        // Slow subtle fade in / fade out cycle
        const fade = 0.5 + 0.5 * Math.sin(time * 0.8 + g.phase);
        g.material.opacity = g.baseOpacity * fade * (profile.coreBrightness > 1.2 ? 1.2 : 1.0);
      }
    });
  }

  public dispose() {
    this.textures.forEach(t => t.dispose());
    this.materials.forEach(m => m.dispose());
    this.textures = [];
    this.materials = [];
    this.glyphs = [];
  }
}
