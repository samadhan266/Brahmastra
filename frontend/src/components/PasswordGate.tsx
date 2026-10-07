import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skull, Eye, EyeOff, AlertTriangle } from 'lucide-react';

const CORRECT_PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'HELLINHEAVEN';

interface PasswordGateProps {
  onUnlock: () => void;
}

const PasswordGate: React.FC<PasswordGateProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [bloodDrops, setBloodDrops] = useState<Array<{ id: number; x: number; delay: number; size: number }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const drops = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 8,
      size: 2 + Math.random() * 4,
    }));
    setBloodDrops(drops);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === CORRECT_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setPassword('');
      setTimeout(() => { setShake(false); setError(false); }, 800);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
         style={{ background: '#050000' }}>

      {/* Blood drip animation */}
      {bloodDrops.map(drop => (
        <motion.div
          key={drop.id}
          className="absolute rounded-full"
          style={{
            left: `${drop.x}%`,
            width: `${drop.size}px`,
            background: 'linear-gradient(180deg, #8B0000, #4a0000)',
            opacity: 0.6,
          }}
          initial={{ top: '-5%', height: 0 }}
          animate={{
            top: ['−5%', '105%'],
            height: [0, 40 + Math.random() * 80],
            opacity: [0.8, 0],
          }}
          transition={{
            duration: 4 + Math.random() * 6,
            delay: drop.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      {/* Fog / mist overlay */}
      <div className="absolute inset-0"
           style={{
             background: 'radial-gradient(ellipse at center, rgba(80,0,0,0.15) 0%, rgba(0,0,0,0.95) 70%)',
           }} />

      {/* Pulse glow behind card */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(139,0,0,0.2) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Main card */}
      <motion.div
        className="relative z-10 w-full max-w-md mx-4"
        initial={{ opacity: 0, scale: 0.8, y: 30 }}
        animate={{
          opacity: 1,
          scale: shake ? [1, 1.05, 0.95, 1.02, 1] : 1,
          y: 0,
        }}
        transition={{ duration: shake ? 0.5 : 0.8, ease: 'easeOut' }}
      >
        <div className="rounded-2xl p-8 border border-red-900/40 relative overflow-hidden"
             style={{
               background: 'linear-gradient(180deg, rgba(15,0,0,0.95) 0%, rgba(5,0,0,0.98) 100%)',
               boxShadow: '0 0 80px rgba(139,0,0,0.15), inset 0 1px 0 rgba(139,0,0,0.2)',
             }}>

          {/* Corner blood smears */}
          <div className="absolute top-0 left-0 w-32 h-32 opacity-20"
               style={{
                 background: 'radial-gradient(circle at 0% 0%, #8B0000, transparent 70%)',
               }} />
          <div className="absolute bottom-0 right-0 w-32 h-32 opacity-20"
               style={{
                 background: 'radial-gradient(circle at 100% 100%, #8B0000, transparent 70%)',
               }} />

          {/* Skull icon */}
          <div className="flex justify-center mb-6">
            <motion.div
              className="relative"
              animate={{ rotateZ: [0, 2, -2, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                   style={{
                     background: 'radial-gradient(circle, rgba(139,0,0,0.3), rgba(5,0,0,0.8))',
                     border: '2px solid rgba(139,0,0,0.4)',
                     boxShadow: '0 0 30px rgba(139,0,0,0.2)',
                   }}>
                <Skull className="w-10 h-10 text-red-500" style={{ filter: 'drop-shadow(0 0 10px rgba(139,0,0,0.5))' }} />
              </div>
              <motion.div
                className="absolute -inset-2 rounded-full border border-red-900/30"
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
          </div>

          {/* Title */}
          <h1 className="text-center text-2xl font-bold tracking-[0.3em] mb-1"
              style={{
                color: '#8B0000',
                textShadow: '0 0 20px rgba(139,0,0,0.4)',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
            BRAHMASTRA
          </h1>
          <p className="text-center text-[10px] font-mono tracking-[0.5em] mb-6 uppercase"
             style={{ color: 'rgba(139,0,0,0.5)' }}>
            Autonomous Pentest System
          </p>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,0,0,0.4), transparent)' }} />
            <AlertTriangle className="w-3.5 h-3.5 text-red-900/60" />
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,0,0,0.4), transparent)' }} />
          </div>

          {/* Warning text */}
          <motion.p
            className="text-center text-sm font-mono mb-6"
            style={{ color: 'rgba(139,0,0,0.7)' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            Please Enter password to enter Devil Mode
          </motion.p>

          {/* Password form */}
          <form onSubmit={handleSubmit}>
            <div className="relative mb-4">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter access code..."
                className="w-full px-4 py-3.5 pr-12 rounded-lg text-sm font-mono tracking-wider outline-none transition-all"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  border: error ? '1px solid rgba(255,0,0,0.6)' : '1px solid rgba(139,0,0,0.3)',
                  color: '#cc0000',
                  caretColor: '#8B0000',
                  boxShadow: error
                    ? '0 0 20px rgba(255,0,0,0.15), inset 0 0 20px rgba(255,0,0,0.05)'
                    : 'inset 0 2px 4px rgba(0,0,0,0.3)',
                }}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-900/20 transition-colors"
              >
                {showPassword
                  ? <EyeOff className="w-4 h-4 text-red-900/60" />
                  : <Eye className="w-4 h-4 text-red-900/60" />
                }
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs font-mono text-red-500 mb-3 text-center"
                >
                  ACCESS DENIED — Invalid password
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              className="w-full py-3 rounded-lg text-sm font-mono font-bold tracking-wider transition-all"
              style={{
                background: 'linear-gradient(135deg, rgba(139,0,0,0.4), rgba(80,0,0,0.6))',
                border: '1px solid rgba(139,0,0,0.5)',
                color: '#cc0000',
                boxShadow: '0 0 20px rgba(139,0,0,0.15)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(139,0,0,0.3)';
                e.currentTarget.style.borderColor = 'rgba(139,0,0,0.8)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 0 20px rgba(139,0,0,0.15)';
                e.currentTarget.style.borderColor = 'rgba(139,0,0,0.5)';
              }}
            >
              ENTER THE VOID
            </button>
          </form>

          {/* Bottom warning */}
          <p className="text-center text-[9px] font-mono mt-5 tracking-wider"
             style={{ color: 'rgba(139,0,0,0.3)' }}>
            UNAUTHORIZED ACCESS IS MONITORED AND LOGGED
          </p>
        </div>
      </motion.div>

      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none z-20"
           style={{
             background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
           }} />
    </div>
  );
};

export default PasswordGate;
