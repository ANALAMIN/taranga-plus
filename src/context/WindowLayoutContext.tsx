import React, { createContext, useContext } from 'react';
import { useWindowState, WindowLayoutState, LayoutTier } from '../hooks/useWindowState';

const Ctx = createContext<WindowLayoutState>({
  width: 1280,
  height: 720,
  isMaximized: false,
  isSnapped: false,
  tier: 'wide',
});

export interface WindowLayoutProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the app and exposes the current window layout tier + raw geometry.
 * Defaults to a safe `wide` tier for any consumer rendered outside the provider.
 */
export const WindowLayoutProvider: React.FC<WindowLayoutProviderProps> = ({ children }) => {
  const state = useWindowState();
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
};

/**
 * Read the current window layout tier. Must be used within <WindowLayoutProvider>.
 */
export function useWindowLayout(): WindowLayoutState {
  return useContext(Ctx);
}

export type { LayoutTier };
