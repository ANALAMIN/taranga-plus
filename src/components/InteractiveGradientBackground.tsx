import React from "react";
import { Component as GradientBarsContainer } from "./ui/gradient-bars-background";

interface InteractiveGradientBackgroundProps {
  children?: React.ReactNode;
}

export function InteractiveGradientBackground({ children }: InteractiveGradientBackgroundProps) {
  // Use the global CSS variable for the gradient color, fallback to white if not set.
  // The global CSS variables are managed by useSettings and SettingsPanel.
  return (
    <GradientBarsContainer
      numBars={11}
      gradientFrom="rgba(var(--color-accent-rgb), 1)"
      gradientTo="transparent"
      animationDuration={2}
      backgroundColor="transparent"
    >
      {/* The actual content (Channel Grid) */}
      <div className="w-full h-full relative z-10 overflow-hidden">
        {children}
      </div>
    </GradientBarsContainer>
  );
}
