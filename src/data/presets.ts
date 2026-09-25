import { Activity, Moon, Box, Zap } from 'lucide-react';
import { BreathPattern } from '../types';

const PURAKA_ACTIVE   = 1.5;  // inhale
const KUMBHAKA_RETAIN = 6.0;  // hold
const RECHAKA_PASSIVE = 3.0;  // exhale

export const PATTERNS: BreathPattern[] = [
  {
    id: 'resonance',
    label: 'Resonance',
    description: 'Coherent breathing for heart rate variability balance.',
    icon: Activity,
    durations: {
      idle: 0,
      inhale: 5,
      'hold-in': 0,
      exhale: 5,
      'hold-out': 0,
    }
  },
  {
    id: 'sleep',
    label: '4-7-8 Relax',
    description: 'Natural tranquilizer for the nervous system.',
    icon: Moon,
    durations: {
      idle: 0,
      inhale: 4,
      'hold-in': 7,
      exhale: 8,
      'hold-out': 0,
    }
  },
  {
    id: 'box',
    label: 'Box Focus',
    description: 'Navy SEAL technique for heightened concentration.',
    icon: Box,
    durations: {
      idle: 0,
      inhale: 4,
      'hold-in': 4,
      exhale: 4,
      'hold-out': 4,
    }
  },
  {
    id: 'tirumandiram',
    label: 'Vedic 1:4:2',
    description: 'Tirumandiram Stanza 568. Mathematical Prana alignment.',
    icon: Zap,
    durations: {
      idle: 0,
      inhale: PURAKA_ACTIVE,
      'hold-in': KUMBHAKA_RETAIN,
      exhale: RECHAKA_PASSIVE,
      'hold-out': 0,
    }
  },
];