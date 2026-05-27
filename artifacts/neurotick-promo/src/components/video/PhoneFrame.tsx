import { motion, HTMLMotionProps } from 'framer-motion';

interface PhoneFrameProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  glowColor?: string;
}

export function PhoneFrame({ children, className = '', innerClassName = '', glowColor = 'var(--color-primary)', ...props }: PhoneFrameProps) {
  return (
    <motion.div
      className={`relative w-[320px] h-[650px] rounded-[40px] border-4 border-[#1e1e24] bg-black shadow-2xl overflow-hidden ${className}`}
      style={{
        boxShadow: `0 0 80px -20px ${glowColor}`,
      }}
      {...props}
    >
      {/* Notch */}
      <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50">
        <div className="w-24 h-full bg-[#1e1e24] rounded-b-xl" />
      </div>

      {/* Screen */}
      <div className={`relative w-full h-full bg-[#0a0a0f] text-white pt-8 pb-4 px-4 overflow-hidden ${innerClassName}`}>
        {children}
      </div>
      
      {/* Bottom Bar */}
      <div className="absolute bottom-2 inset-x-0 flex justify-center z-50">
        <div className="w-24 h-1 bg-white/20 rounded-full" />
      </div>
    </motion.div>
  );
}
