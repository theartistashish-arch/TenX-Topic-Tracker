import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';
import { PhoneFrame } from '../PhoneFrame';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // pulse reveal
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      {...sceneTransitions.wipe}
    >
      <div className="flex w-full max-w-6xl items-center justify-center gap-12 px-8">
        
        {/* Left Phone: Library */}
        <motion.div 
          className="relative z-10"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          <PhoneFrame glowColor="var(--color-secondary)">
            <div className="pt-8">
              <h2 className="text-3xl font-bold mb-6">Library</h2>
              
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <motion.div 
                    key={i}
                    className="p-4 bg-white/5 rounded-xl border border-white/10 relative overflow-hidden"
                    initial={{ opacity: 0, x: -20 }}
                    animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    <div className="text-sm text-secondary font-bold mb-1">MODULE {i}</div>
                    <div className="text-lg font-bold mb-3">Topic Title Here</div>
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-white/50">12 items</div>
                      {i === 1 && (
                        <div className="px-2 py-1 bg-accent/20 text-accent text-xs font-bold rounded">
                          EXAM MODE
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </PhoneFrame>
        </motion.div>

        {/* Right Phone: Pulse */}
        <motion.div 
          className="relative z-10"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
        >
          <PhoneFrame glowColor="var(--color-accent)">
            <div className="pt-8">
              <h2 className="text-3xl font-bold mb-6">Pulse</h2>
              
              <motion.div 
                className="p-6 bg-gradient-to-br from-primary/30 to-secondary/30 rounded-2xl border border-white/20 mb-6 flex flex-col items-center"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={phase >= 2 ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
              >
                <div className="text-white/60 text-sm mb-2">ESTIMATED RANK</div>
                <div className="text-4xl font-black text-accent">Top 5%</div>
              </motion.div>

              <div className="mb-6">
                <div className="text-sm font-bold text-white/60 mb-4">WEEKLY PROGRESS</div>
                <div className="flex items-end gap-2 h-32">
                  {[40, 60, 30, 80, 50, 90, 70].map((h, i) => (
                    <div key={i} className="flex-1 bg-white/10 rounded-t-sm relative group">
                      <motion.div 
                        className="absolute bottom-0 inset-x-0 bg-accent rounded-t-sm"
                        initial={{ height: 0 }}
                        animate={phase >= 2 ? { height: `${h}%` } : { height: 0 }}
                        transition={{ delay: 2.2 + (i * 0.1), duration: 0.5 }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {['Physics', 'Chemistry'].map((s, i) => (
                  <motion.div 
                    key={s} className="flex items-center gap-3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                    transition={{ delay: 2.8 + (i * 0.1) }}
                  >
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <div className="flex-1 text-sm">{s}</div>
                    <div className="text-sm font-bold">{80 - (i*15)}%</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </PhoneFrame>
        </motion.div>

      </div>
    </motion.div>
  );
}
