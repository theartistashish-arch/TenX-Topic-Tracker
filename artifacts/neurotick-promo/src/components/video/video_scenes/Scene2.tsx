import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video/animations';
import { PhoneFrame } from '../PhoneFrame';
import { ZapIcon } from '../Icons';

export function Scene2() {
  const [phase, setPhase] = useState(0);
  const [activeGoal, setActiveGoal] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    const interval = setInterval(() => {
      setActiveGoal((prev) => (prev + 1) % 3);
    }, 1500);
    return () => clearInterval(interval);
  }, [phase]);

  const goals = ['UPSC', 'NEET', 'JEE'];

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      {...sceneTransitions.clipPolygon}
    >
      <div className="flex w-full max-w-6xl items-center justify-between px-12">
        {/* Left: Brand */}
        <div className="flex-1 pr-12 relative z-10">
          <motion.div 
            className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-8"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <ZapIcon className="w-16 h-16 text-white" />
          </motion.div>
          
          <motion.h1 
            className="text-[6vw] font-black text-white tracking-tight leading-none mb-4 font-display"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            NeuroTick
          </motion.h1>
          
          <motion.p 
            className="text-[2vw] text-white/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            Your intelligent study companion.
          </motion.p>
        </div>

        {/* Right: Phone UI */}
        <motion.div 
          className="relative z-10"
          initial={{ y: 100, opacity: 0, rotateX: 20 }}
          animate={phase >= 1 ? { y: 0, opacity: 1, rotateX: 0 } : { y: 100, opacity: 0, rotateX: 20 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          style={{ perspective: 1000 }}
        >
          <PhoneFrame>
            <div className="h-full flex flex-col pt-12">
              <h2 className="text-2xl font-bold mb-2">Welcome</h2>
              <p className="text-white/50 text-sm mb-8">What are you preparing for?</p>
              
              <div className="flex-1 space-y-4 relative">
                {goals.map((goal, i) => (
                  <motion.div
                    key={goal}
                    className={`p-4 rounded-2xl border-2 transition-colors ${activeGoal === i ? 'border-primary bg-primary/20' : 'border-white/10 bg-white/5'}`}
                    animate={{ scale: activeGoal === i ? 1.05 : 1 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg">{goal}</span>
                      {activeGoal === i && (
                        <motion.div 
                          layoutId="activeIndicator"
                          className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                        >
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.button 
                className="w-full py-4 rounded-xl bg-white text-black font-bold mt-auto"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Start Journey
              </motion.button>
            </div>
          </PhoneFrame>
        </motion.div>
      </div>
    </motion.div>
  );
}
