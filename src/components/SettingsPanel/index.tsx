import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Moon, Sun, Monitor, Info, ExternalLink } from 'lucide-react';
import { slideInRight } from '../../animations/variants';
import { AppSettings } from '../../types';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppSettings['theme'];
  onThemeChange: (theme: AppSettings['theme']) => void;
  accentColor: string;
  onAccentColorChange: (color: string) => void;
}

/**
 * Settings panel (slide-in panel from right).
 * ONLY 4 SETTINGS: Theme, Accent Color, About, Privacy Policy
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  isOpen, 
  onClose,
  theme,
  onThemeChange,
  accentColor,
  onAccentColorChange
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity"
          />

          {/* Panel */}
          <motion.div
            variants={slideInRight}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-0 right-0 h-full w-[340px] max-w-[90vw] bg-[var(--color-bg-surface)] border-l border-[var(--color-border)] z-50 flex flex-col shadow-[var(--glow-card)] overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)] font-ui">Settings</h2>
              <button 
                onClick={onClose}
                className="p-2 -mr-2 text-[var(--color-text-muted)] hover:text-white rounded-full transition-colors"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-8 font-ui">
              
              {/* 1. Theme Setting */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-[var(--color-muted)] uppercase tracking-wider">Appearance</h3>
                
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => onThemeChange('dark')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                      theme === 'dark' 
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' 
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-white/20'
                    }`}
                  >
                    <Moon size={20} />
                    <span className="text-xs font-medium">Dark</span>
                  </button>
                  <button 
                    onClick={() => onThemeChange('light')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                      theme === 'light' 
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' 
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-white/20'
                    }`}
                  >
                    <Sun size={20} />
                    <span className="text-xs font-medium">Light</span>
                  </button>
                  <button 
                    onClick={() => onThemeChange('system')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                      theme === 'system' 
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' 
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-white/20'
                    }`}
                  >
                    <Monitor size={20} />
                    <span className="text-xs font-medium">System</span>
                  </button>
                </div>
              </div>

              {/* 2. Accent Color Setting */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-[var(--color-muted)] uppercase tracking-wider">Accent Color</h3>
                <div className="grid grid-cols-6 gap-2">
                  {[
                    "#e50914", // Taranga Red
                    "#ff3c00", // Orange
                    "#ff006e", // Pink
                    "#8338ec", // Purple
                    "#3a86ff", // Blue
                    "#06ffa5", // Mint
                  ].map((color) => (
                    <button
                      key={color}
                      onClick={() => onAccentColorChange(color)}
                      className={`w-10 h-10 rounded-full border-2 transition-transform ${
                        accentColor === color 
                          ? 'border-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.4)]' 
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ background: color }}
                      aria-label={`Set color to ${color}`}
                    />
                  ))}
                </div>
              </div>

              {/* 3. About */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-[var(--color-muted)] uppercase tracking-wider">About</h3>
                <div className="p-4 rounded-xl bg-[var(--color-surface-2)] flex flex-col gap-1">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Info size={16} className="text-[var(--color-accent)]" /> 
                    Taranga+
                  </div>
                  <p className="text-sm text-[var(--color-muted)] mt-1">
                    Version 2.0.0
                    <br />
                    A premium OTT experience for PC.
                  </p>
                </div>
              </div>

              {/* 3. Privacy Policy */}
              <div className="space-y-4">
                <a 
                  href="#" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-surface-2)] hover:bg-white/5 transition-colors group text-sm text-[var(--color-muted)] hover:text-white"
                >
                  <span className="font-medium">Privacy Policy</span>
                  <ExternalLink size={16} className="opacity-50 group-hover:opacity-100" />
                </a>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
