import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';
import { CheckCircleIcon } from '../Icons';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500), // timer start
      setTimeout(() => setPhase(2), 3500), // switch to break / complete
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      {...sceneTransitions.zoomThrough}
    >
      <div className="text-center relative z-10 flex flex-col items-center">
        <motion.h2 
          className="text-[4vw] font-black text-white mb-12 font-display"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Deep Focus
        </motion.h2>

        <div className="relative w-[400px] h-[400px] flex items-center justify-center">
          {/* Ring Background */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
            
            {/* Progress Ring */}
            <motion.circle 
              cx="50" cy="50" r="45" fill="none" 
              stroke={phase >= 2 ? "var(--color-success)" : "var(--color-primary)"} 
              strokeWidth="4"
              strokeDasharray="283"
              initial={{ strokeDashoffset: 283 }}
              animate={{ strokeDashoffset: phase >= 2 ? 0 : 50 }}
              transition={{ duration: phase >= 2 ? 1 : 3, ease: "linear" }}
              strokeLinecap="round"
            />
          </svg>

          <div className="flex flex-col items-center justify-center">
            {phase < 2 ? (
              <motion.div 
                className="text-7xl font-mono font-bold"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                25:00
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring' }}
                className="text-success flex flex-col items-center"
              >
                <CheckCircleIcon className="w-24 h-24 mb-4" />
                <div className="text-2xl font-bold">Session Complete</div>
              </motion.div>
            )}
            
            {phase < 2 && (
              <div className="text-white/50 text-xl tracking-widest uppercase mt-4">FOCUS</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
