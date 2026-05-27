import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions, charVariants, charContainerVariants, charTransition, charContainerTransition } from '@/lib/video/animations';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]"
      {...sceneTransitions.fadeBlur}
    >
      <div className="absolute inset-0 z-0">
        <video 
          src={`${import.meta.env.BASE_URL}videos/neural-bg.mp4`} 
          autoPlay 
          muted 
          loop 
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-[#0a0a0f]/50" />
      </div>

      <div className="text-center relative z-10 max-w-4xl px-8">
        <motion.div
          variants={charContainerVariants}
          initial="hidden"
          animate={phase >= 1 ? "visible" : "hidden"}
          transition={charContainerTransition}
          className="text-[4vw] font-bold tracking-tighter text-white/80 leading-none mb-6 font-display"
        >
          {'Cracking'.split('').map((char, i) => (
            <motion.span key={i} variants={charVariants} transition={charTransition} className="inline-block">{char === ' ' ? '\u00A0' : char}</motion.span>
          ))}
          <span className="mx-4 text-primary">UPSC</span>·
          <span className="mx-4 text-secondary">NEET</span>·
          <span className="mx-4 text-accent">JEE</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
          animate={phase >= 2 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 30, filter: 'blur(10px)' }}
          transition={{ duration: 0.8, ease: 'circOut' }}
          className="text-[5vw] font-black text-white leading-tight font-display"
        >
          isn't about studying <span className="text-white/40 line-through">more</span>.
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
          animate={phase >= 3 ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : { opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
          transition={{ duration: 0.8, ease: 'circOut', delay: 0.2 }}
          className="text-[6vw] font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent mt-4 font-display"
        >
          It's about studying smarter.
        </motion.div>
      </div>
    </motion.div>
  );
}
