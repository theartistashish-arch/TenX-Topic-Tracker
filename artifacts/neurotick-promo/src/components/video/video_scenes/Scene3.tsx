import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';
import { PhoneFrame } from '../PhoneFrame';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500), // streak tick
      setTimeout(() => setPhase(3), 2500), // cards
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      {...sceneTransitions.slideLeft}
    >
      <div className="flex w-full max-w-6xl items-center justify-between px-12">
        <motion.div 
          className="relative z-10"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <PhoneFrame>
            <div className="pt-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-white/60 text-sm">Today</h3>
                  <div className="text-xl font-bold">14 Oct</div>
                </div>
                <motion.div 
                  className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-500 font-bold flex items-center gap-1"
                  animate={phase >= 2 ? { scale: [1, 1.2, 1] } : {}}
                >
                  <span>🔥</span>
                  <span>{phase >= 2 ? '13' : '12'}</span>
                </motion.div>
              </div>

              <div className="mb-6">
                <div className="text-sm font-bold text-white/60 mb-3">DUE TODAY</div>
                <div className="space-y-3">
                  {['Physics: Kinematics', 'Chemistry: Thermodynamics', 'Math: Calculus'].map((topic, i) => (
                    <motion.div 
                      key={topic}
                      className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                      transition={{ delay: phase >= 3 ? i * 0.15 : 0 }}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {i + 1}
                      </div>
                      <div className="font-medium">{topic}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
            
            <motion.div 
              className="absolute bottom-8 inset-x-4"
              initial={{ y: 50, opacity: 0 }}
              animate={phase >= 3 ? { y: 0, opacity: 1 } : { y: 50, opacity: 0 }}
              transition={{ delay: 1 }}
            >
              <motion.button 
                className="w-full py-4 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2"
                animate={{ boxShadow: ['0 0 0 0 rgba(79, 70, 229, 0)', '0 0 0 10px rgba(79, 70, 229, 0.3)', '0 0 0 0 rgba(79, 70, 229, 0)'] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <span>+</span> New Topic
              </motion.button>
            </motion.div>
          </PhoneFrame>
        </motion.div>

        <div className="flex-1 pl-16 relative z-10">
          <motion.h2 
            className="text-[5vw] font-black text-white leading-none mb-4 font-display"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Stay on Track.
          </motion.h2>
          <motion.p 
            className="text-[2vw] text-white/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Build habits. Maintain streaks. Conveys daily accountability.
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}
