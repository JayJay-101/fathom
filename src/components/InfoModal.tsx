import React from 'react';
import { X } from 'lucide-react';

interface InfoModalProps {
  onClose: () => void;
  onReplayTour: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ onClose, onReplayTour }) => (
  <div
    className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
    onClick={(e) => e.stopPropagation()}
  >
    <div className="w-full max-w-sm p-8 border border-white/10 bg-panel relative pointer-events-auto">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/30 hover:text-white transition-colors"
        type="button"
      >
        <X size={20} />
      </button>
      <h3 className="text-lg font-light text-white mb-6">Fathom v2</h3>
      <p className="text-xs text-white/60 leading-relaxed mb-6">
        Bio-Generative Asset Engine
        <br />
        <span className="text-white/40 text-[9px] mt-2 block">
          Zero-latency streaming · Pre-rendered psychoacoustics
        </span>
      </p>
      <button
        onClick={onReplayTour}
        className="w-full py-3 rounded-full border border-white/10 text-[10px] tracking-[0.2em] uppercase text-white/50 hover:text-white hover:border-white/30 transition-colors"
        type="button"
      >
        Replay tutorial
      </button>
    </div>
  </div>
);
