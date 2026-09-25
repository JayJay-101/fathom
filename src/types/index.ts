export type Phase = 'idle' | 'inhale' | 'hold-in' | 'exhale' | 'hold-out';
export type VisualMode = 'geometry' | 'mandala' | 'aurora' | 'orbital';
export type AudioOutputMode = 'earphones' | 'speaker';

export interface BreathPattern {
  id: string;
  label: string;
  description: string;
  icon: any;
  durations: { [key in Phase]: number };
}