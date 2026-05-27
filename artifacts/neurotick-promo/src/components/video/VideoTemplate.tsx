import { motion, AnimatePresence } from 'framer-motion';
import { ComponentType, useEffect } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

export const SCENE_DURATIONS: Record<string, number> = {
  hook: 10000,
  meet: 10000,
  home: 12000,
  focus: 10000,
  library: 13000,
  gopro: 10000
};

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  hook: Scene1,
  meet: Scene2,
  home: Scene3,
  focus: Scene4,
  library: Scene5,
  gopro: Scene6,
};

// Background positions for bg1 across scenes for visual continuity
const bgPos = [
  { scale: 1.2, opacity: 0.1, rotate: 0 },
  { scale: 1, opacity: 0.4, rotate: 10 },
  { scale: 1.5, opacity: 0.2, rotate: -5 },
  { scale: 0.8, opacity: 0.6, rotate: 20 },
  { scale: 1.3, opacity: 0.3, rotate: 5 },
  { scale: 1, opacity: 0.1, rotate: 0 },
];

// bg2 cross-fades in on later scenes (focus/library/gopro) for visual depth
const bg2Pos = [
  { scale: 1, opacity: 0, rotate: 0 },
  { scale: 1.1, opacity: 0, rotate: -5 },
  { scale: 0.9, opacity: 0.05, rotate: 3 },
  { scale: 1.2, opacity: 0.15, rotate: -8 },
  { scale: 1, opacity: 0.25, rotate: 5 },
  { scale: 1.3, opacity: 0.2, rotate: -3 },
];

const orb1Pos = [
  { x: '10vw', y: '20vh', scale: 1 },
  { x: '80vw', y: '10vh', scale: 1.5 },
  { x: '20vw', y: '70vh', scale: 0.8 },
  { x: '50vw', y: '50vh', scale: 2 },
  { x: '70vw', y: '80vh', scale: 1.2 },
  { x: '10vw', y: '20vh', scale: 1 },
];

const orb2Pos = [
  { x: '80vw', y: '70vh', scale: 1.5 },
  { x: '10vw', y: '80vh', scale: 1 },
  { x: '70vw', y: '20vh', scale: 2 },
  { x: '20vw', y: '30vh', scale: 0.8 },
  { x: '30vw', y: '60vh', scale: 1.5 },
  { x: '80vw', y: '70vh', scale: 1.5 },
];

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="w-full h-screen overflow-hidden relative bg-[#0a0a0f] text-white">
      {/* Persistent Background Layer */}
      <div className="absolute inset-0 z-0">
        <motion.img
          src={`${import.meta.env.BASE_URL}images/bg1.png`}
          className="absolute inset-0 w-full h-full object-cover"
          animate={bgPos[sceneIndex] ?? bgPos[0]}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        <motion.img
          src={`${import.meta.env.BASE_URL}images/bg2.png`}
          className="absolute inset-0 w-full h-full object-cover mix-blend-screen"
          animate={bg2Pos[sceneIndex] ?? bg2Pos[0]}
          transition={{ duration: 2.5, ease: "easeInOut" }}
        />
        <div className="noise-overlay" />
      </div>

      {/* Persistent Midground Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full bg-primary/20 blur-[100px]"
          animate={orb1Pos[sceneIndex] ?? orb1Pos[0]}
          transition={{ duration: 3, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full bg-secondary/20 blur-[80px]"
          animate={orb2Pos[sceneIndex] ?? orb2Pos[0]}
          transition={{ duration: 3, ease: "easeInOut" }}
        />
      </div>

      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
