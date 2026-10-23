import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useJarvisStore } from '../../store/jarvisStore';
import { CoreRenderer } from './CoreRenderer';

export const NeuralCore: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CoreRenderer | null>(null);
  const location = useLocation();

  const isHomePage = location.pathname === '/' || location.pathname === '';
  const isHomePageRef = useRef(isHomePage);

  useEffect(() => {
    isHomePageRef.current = isHomePage;
    if (!isHomePage && rendererRef.current) {
      // Whenever navigating away from the Home view, smoothly reset any custom rotation or zoom
      // so the core stays centered in its calm ambient state for other pages.
      rendererRef.current.interaction.reset();
    }
  }, [isHomePage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CoreRenderer(canvas);
    rendererRef.current = renderer;
    (window as any).jarvisCoreInteraction = renderer.interaction;

    // Sizing function strictly based on container bounds
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : window.innerHeight;

      renderer.resize(w, h);
    };

    resizeCanvas();

    let animationFrameId: number;
    const renderLoop = () => {
      renderer.render();
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    // Events routing — strictly active on the Home view only
    const onPointerDown = (e: PointerEvent) => {
      if (!isHomePageRef.current) return;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      renderer.interaction.onPointerDown(e);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isHomePageRef.current) return;
      renderer.interaction.onPointerMove(e);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isHomePageRef.current) return;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
      renderer.interaction.onPointerUp(e);
    };

    const onWheel = (e: WheelEvent) => {
      if (!isHomePageRef.current) return;
      e.preventDefault();
      renderer.interaction.onWheel(e);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isHomePageRef.current) return;
      renderer.interaction.handleKeyDown(e);
    };

    const onDblClick = () => {
      if (!isHomePageRef.current) return;
      renderer.interaction.reset();
    };

    const onGesture = (e: CustomEvent) => {
      if (!isHomePageRef.current) return;
      const { type, x, y, pinchDist, tilt, pitch, isVertical, isCupped, depth } = e.detail;
      renderer.interaction.applyGesture(type, x, y, pinchDist, tilt, pitch, isVertical, isCupped, depth);
    };

    // Observers & Listeners
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
      });
      resizeObserver.observe(canvas.parentElement);
    }

    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('jarvis-gesture' as any, onGesture);

    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('jarvis-gesture' as any, onGesture);

      renderer.dispose();
      rendererRef.current = null;
      if ((window as any).jarvisCoreInteraction === renderer.interaction) {
        delete (window as any).jarvisCoreInteraction;
      }
    };
  }, []);

  const systemState = useJarvisStore(state => state.systemState);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.state = systemState;
    }
  }, [systemState]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (rendererRef.current) {
        rendererRef.current.reducedMotion = e.matches;
      }
    };
    handleMotionChange(mediaQuery);
    mediaQuery.addEventListener('change', handleMotionChange);
    return () => mediaQuery.removeEventListener('change', handleMotionChange);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="core-canvas-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        touchAction: 'none',
        display: 'block',
        pointerEvents: isHomePage ? 'auto' : 'none',
      }}
    />
  );
};
