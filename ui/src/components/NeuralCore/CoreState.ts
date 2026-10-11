import * as THREE from 'three';
import type { SystemState } from '../../store/jarvisStore';

/**
 * JARVIS Neural Core Color Language
 * Premium Holographic Blue / Cyan Palette
 */
export const CORE_PALETTE = {
  primary: '#00C8FF',       // 0x00C8FF - Primary luminous cyan
  secondary: '#0088FF',     // 0x0088FF - Rich azure blue
  deepBlue: '#063BFF',      // 0x063BFF - Deep orbital blue
  electricCyan: '#48E8FF',  // 0x48E8FF - High-energy electric cyan
  whiteBlue: '#D9F8FF',     // 0xD9F8FF - Brilliant white-blue highlights
  darkWarning: '#183868',   // Subtle deep steel-blue for error warning
  lightWarning: '#A8D8FF',  // Subtle arctic highlight for error warning
};

export const THREE_PALETTE = {
  primary: new THREE.Color(CORE_PALETTE.primary),
  secondary: new THREE.Color(CORE_PALETTE.secondary),
  deepBlue: new THREE.Color(CORE_PALETTE.deepBlue),
  electricCyan: new THREE.Color(CORE_PALETTE.electricCyan),
  whiteBlue: new THREE.Color(CORE_PALETTE.whiteBlue),
  darkWarning: new THREE.Color(CORE_PALETTE.darkWarning),
  lightWarning: new THREE.Color(CORE_PALETTE.lightWarning),
};

export interface StateVisualProfile {
  coreBrightness: number;
  ringSpeedMult: number;
  particleSpeedMult: number;
  pulseFrequency: number;
  pulseAmplitude: number;
  arcSurgeChance: number;
  scanInterval: number; // in seconds
  primaryColor: THREE.Color;
  secondaryColor: THREE.Color;
  accentColor: THREE.Color;
}

export function getStateVisualProfile(state: SystemState): StateVisualProfile {
  switch (state) {
    case 'OFFLINE':
      return {
        coreBrightness: 0.35,
        ringSpeedMult: 0.15,
        particleSpeedMult: 0.1,
        pulseFrequency: 0.8,
        pulseAmplitude: 0.03,
        arcSurgeChance: 0.02,
        scanInterval: 12.0,
        primaryColor: new THREE.Color(0x005588),
        secondaryColor: new THREE.Color(0x002255),
        accentColor: new THREE.Color(0x0088cc),
      };

    case 'IDLE':
      return {
        coreBrightness: 1.0,
        ringSpeedMult: 1.0,
        particleSpeedMult: 1.0,
        pulseFrequency: 1.8,
        pulseAmplitude: 0.06,
        arcSurgeChance: 0.15,
        scanInterval: 4.5,
        primaryColor: THREE_PALETTE.primary,
        secondaryColor: THREE_PALETTE.secondary,
        accentColor: THREE_PALETTE.electricCyan,
      };

    case 'LISTENING':
      // When listening: core becomes brighter, center pulse faster, particle motion increases
      return {
        coreBrightness: 1.5,
        ringSpeedMult: 1.35,
        particleSpeedMult: 1.6,
        pulseFrequency: 3.5,
        pulseAmplitude: 0.12,
        arcSurgeChance: 0.35,
        scanInterval: 2.8,
        primaryColor: THREE_PALETTE.electricCyan,
        secondaryColor: THREE_PALETTE.primary,
        accentColor: THREE_PALETTE.whiteBlue,
      };

    case 'THINKING':
      // When processing: orbital speed increases slightly, inner geometry active, arcs rotate faster
      return {
        coreBrightness: 1.6,
        ringSpeedMult: 2.0,
        particleSpeedMult: 2.2,
        pulseFrequency: 4.8,
        pulseAmplitude: 0.15,
        arcSurgeChance: 0.6,
        scanInterval: 2.0,
        primaryColor: THREE_PALETTE.electricCyan,
        secondaryColor: THREE_PALETTE.deepBlue,
        accentColor: THREE_PALETTE.whiteBlue,
      };

    case 'PLANNING':
      return {
        coreBrightness: 1.4,
        ringSpeedMult: 1.6,
        particleSpeedMult: 1.5,
        pulseFrequency: 3.0,
        pulseAmplitude: 0.1,
        arcSurgeChance: 0.45,
        scanInterval: 3.0,
        primaryColor: THREE_PALETTE.primary,
        secondaryColor: THREE_PALETTE.secondary,
        accentColor: THREE_PALETTE.electricCyan,
      };

    case 'EXECUTING':
      // When executing tool/action: stronger core activity, directional energy movement, orbit acceleration
      return {
        coreBrightness: 2.0,
        ringSpeedMult: 2.6,
        particleSpeedMult: 2.8,
        pulseFrequency: 6.0,
        pulseAmplitude: 0.2,
        arcSurgeChance: 0.8,
        scanInterval: 1.5,
        primaryColor: THREE_PALETTE.electricCyan,
        secondaryColor: THREE_PALETTE.primary,
        accentColor: THREE_PALETTE.whiteBlue,
      };

    case 'WAITING':
      return {
        coreBrightness: 0.8,
        ringSpeedMult: 0.6,
        particleSpeedMult: 0.6,
        pulseFrequency: 1.2,
        pulseAmplitude: 0.08,
        arcSurgeChance: 0.1,
        scanInterval: 5.5,
        primaryColor: THREE_PALETTE.primary,
        secondaryColor: THREE_PALETTE.deepBlue,
        accentColor: THREE_PALETTE.secondary,
      };

    case 'VERIFYING':
      return {
        coreBrightness: 1.45,
        ringSpeedMult: 1.7,
        particleSpeedMult: 1.7,
        pulseFrequency: 4.0,
        pulseAmplitude: 0.12,
        arcSurgeChance: 0.5,
        scanInterval: 2.2,
        primaryColor: THREE_PALETTE.electricCyan,
        secondaryColor: THREE_PALETTE.secondary,
        accentColor: THREE_PALETTE.whiteBlue,
      };

    case 'SPEAKING':
      // Voice responds to amplitude dynamically
      return {
        coreBrightness: 1.8,
        ringSpeedMult: 1.4,
        particleSpeedMult: 1.8,
        pulseFrequency: 5.5,
        pulseAmplitude: 0.22,
        arcSurgeChance: 0.7,
        scanInterval: 2.5,
        primaryColor: THREE_PALETTE.whiteBlue,
        secondaryColor: THREE_PALETTE.electricCyan,
        accentColor: THREE_PALETTE.primary,
      };

    case 'ERROR':
      // Temporarily shifts toward darker steel-blue / arctic white warning state, no red takeover
      return {
        coreBrightness: 1.1,
        ringSpeedMult: 0.8,
        particleSpeedMult: 0.9,
        pulseFrequency: 6.5,
        pulseAmplitude: 0.18,
        arcSurgeChance: 0.4,
        scanInterval: 4.0,
        primaryColor: THREE_PALETTE.lightWarning,
        secondaryColor: THREE_PALETTE.darkWarning,
        accentColor: THREE_PALETTE.whiteBlue,
      };

    default:
      return {
        coreBrightness: 1.0,
        ringSpeedMult: 1.0,
        particleSpeedMult: 1.0,
        pulseFrequency: 1.8,
        pulseAmplitude: 0.06,
        arcSurgeChance: 0.15,
        scanInterval: 4.5,
        primaryColor: THREE_PALETTE.primary,
        secondaryColor: THREE_PALETTE.secondary,
        accentColor: THREE_PALETTE.electricCyan,
      };
  }
}
