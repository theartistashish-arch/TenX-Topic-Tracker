import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';
import { CheckCircleIcon, ZapIcon } from '../Icons';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500), // pricing
      setTimeout(() => setPhase(2), 1500), // benefits
      setTimeout(() => setPhase(3), 3500), // final lockup
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-black"
      {...sceneTransitions.fadeBlur}
    >
      <div className="w-full max-w-5xl px-8 flex flex-col items-center">
        
        {phase < 3 ? (
          <motion.div 
            className="flex flex-col items-center w-full"
            exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
          >
            <h2 className="text-[4vw] font-black text-white mb-12 font-display">Go Pro</h2>
            
            <div className="flex gap-8 w-full justify-center mb-12">
              {/* Monthly */}
              <motion.div 
                className="w-72 p-8 rounded-3xl bg-white/5 border border-white/10"
                initial={{ opacity: 0, y: 50 }}
                animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
              >
                <div className="text-white/60 font-bold mb-4">MONTHLY</div>
                <div className="text-4xl font-black mb-1">₹29<span className="text-lg text-white/50 font-normal">/mo</span></div>
              </motion.div>

              {/* Yearly */}
              <motion.div 
                className="w-72 p-8 rounded-3xl bg-gradient-to-b from-primary/20 to-transparent border-2 border-primary relative"
                initial={{ opacity: 0, y: 50 }}
                animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
                transition={{ delay: 0.2 }}
              >
                <div className="absolute -top-4 inset-x-0 flex justify-center">
                  <div className="bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
                    SAVE 29%
                  </div>
                </div>
                <div className="text-white/60 font-bold mb-4">YEARLY</div>
                <div className="text-4xl font-black mb-1">₹249<span className="text-lg text-white/50 font-normal">/yr</span></div>
              </motion.div>
            </div>

            <div className="space-y-4">
              {['Unlimited focus sessions', 'Advanced analytics & rank prediction', 'Exam Mode mock tests'].map((ben, i) => (
                <motion.div 
                  key={i} className="flex items-center gap-3 text-lg"
                  initial={{ opacity: 0, x: -20 }}
                  animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.2 }}
                >
                  <CheckCircleIcon className="w-6 h-6 text-success" />
                  <span>{ben}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1 }}
          >
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-6">
              <ZapIcon className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-[6vw] font-black text-white tracking-tight leading-none mb-4 font-display">NeuroTick</h1>
            <p className="text-[2vw] text-white/60 font-medium mb-6">Free to start. Built to win.</p>
            <div className="flex items-center gap-3">
              <span className="px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white/80 text-[1.4vw] font-semibold">
                ₹29<span className="text-white/50 font-normal">/mo</span>
              </span>
              <span className="text-white/30 text-[1.2vw]">·</span>
              <span className="px-4 py-2 rounded-full bg-primary/20 border border-primary/50 text-white text-[1.4vw] font-semibold">
                ₹249<span className="text-white/50 font-normal">/yr</span>
              </span>
            </div>
          </motion.div>
        )}

      </div>
    </motion.div>
  );
}
