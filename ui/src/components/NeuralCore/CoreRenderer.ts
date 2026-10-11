import { CoreInteraction } from './CoreInteraction';
import { NeuralCoreScene } from './NeuralCoreScene';
import type { SystemState } from '../../store/jarvisStore';

/**
 * CoreRenderer
 * High-performance WebGL renderer bridge connecting the HTML5 canvas
 * to the modular Three.js NeuralCoreScene.
 * Maintains complete API compatibility with NeuralCore.tsx and GestureController.tsx.
 */
export class CoreRenderer {
  public interaction: CoreInteraction;
  private scene: NeuralCoreScene;

  public get state(): SystemState {
    return this.scene.state;
  }

  public set state(val: SystemState) {
    this.scene.state = val;
  }

  public get reducedMotion(): boolean {
    return this.scene.reducedMotion;
  }

  public set reducedMotion(val: boolean) {
    this.scene.reducedMotion = val;
    this.interaction.setReducedMotion(val);
  }

  constructor(canvas: HTMLCanvasElement) {
    this.interaction = new CoreInteraction();
    this.scene = new NeuralCoreScene(canvas, this.interaction);
  }

  public resize(width: number, height: number) {
    this.scene.resize(width, height);
  }

  public render() {
    this.scene.render();
  }

  public dispose() {
    this.scene.dispose();
  }
}
