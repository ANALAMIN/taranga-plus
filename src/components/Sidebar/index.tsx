import React from 'react';
import { LayoutGrid, Trophy, Film, Music, Tv, Smile, BookOpen } from 'lucide-react';
import { Category } from '../../types';

interface SidebarProps {
  activeCategory: Category;
  onCategorySelect: (category: Category) => void;
}

const CATEGORIES: { id: Category; Icon: React.ElementType }[] = [
  { id: 'all', Icon: LayoutGrid },
  { id: 'sports', Icon: Trophy },
  { id: 'movies', Icon: Film },
  { id: 'music', Icon: Music },
  { id: 'entertainment', Icon: Tv },
  { id: 'kids', Icon: Smile },
  { id: 'documentary', Icon: BookOpen },
];

/**
 * SVG Filter Component for Liquid Glass Effect
 */
const GlassFilter: React.FC = () => (
  <svg style={{ display: "none" }}>
    <filter
      id="glass-distortion"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      filterUnits="objectBoundingBox"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.001 0.005"
        numOctaves={1}
        seed={17}
        result="turbulence"
      />
      <feComponentTransfer in="turbulence" result="mapped">
        <feFuncR type="gamma" amplitude={1} exponent={10} offset={0.5} />
        <feFuncG type="gamma" amplitude={0} exponent={1} offset={0} />
        <feFuncB type="gamma" amplitude={0} exponent={1} offset={0.5} />
      </feComponentTransfer>
      <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
      <feSpecularLighting
        in="softMap"
        surfaceScale={5}
        specularConstant={1}
        specularExponent={100}
        lightingColor="white"
        result="specLight"
      >
        <fePointLight x="-200" y="-200" z="300" />
      </feSpecularLighting>
      <feComposite
        in="specLight"
        operator="arithmetic"
        k1={0}
        k2={1}
        k3={1}
        k4={0}
        result="litImage"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="softMap"
        scale={200}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </svg>
);

/**
 * Liquid Glass Button Implementation
 */
const GlassButton: React.FC<{ category: typeof CATEGORIES[0], isActive: boolean, onClick: () => void }> = ({ category, isActive, onClick }) => {
  const Icon = category.Icon;

  const glassStyle = {
    boxShadow: "0 6px 6px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 0, 0, 0.2)",
    transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
  };

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center justify-center w-[72px] h-[72px] mx-auto rounded-[24px] overflow-hidden outline-none transition-all duration-700 cursor-pointer group hover:scale-[1.08] ${isActive ? 'scale-110 !rounded-[20px]' : ''}`}
      style={glassStyle}
    >
      {/* Glass Layers */}
      <div
        className="absolute inset-0 z-0 overflow-hidden rounded-inherit rounded-[24px]"
        style={{
          backdropFilter: "blur(3px)",
          filter: "url(#glass-distortion)",
          isolation: "isolate",
        }}
      />
      <div
        className="absolute inset-0 z-10 transition-colors duration-500 rounded-[24px]"
        style={{ background: isActive ? "rgba(229, 9, 20, 0.15)" : "rgba(255, 255, 255, 0.04)" }}
      />
      <div
        className="absolute inset-0 z-20 rounded-[24px] overflow-hidden transition-shadow duration-500"
        style={{
          boxShadow: isActive 
             ? "inset 2px 2px 1px 0 rgba(229, 9, 20, 0.5), inset -1px -1px 1px 1px rgba(229, 9, 20, 0.3)"
             : "inset 1px 1px 1px 0 rgba(255, 255, 255, 0.2), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.1)",
        }}
      />

      {/* Content */}
      <div className="relative z-30 flex items-center justify-center transition-all duration-700" style={{ transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)" }}>
         <Icon
           size={40}
           strokeWidth={1.25}
           className={`transition-all duration-500 ${isActive ? 'text-[var(--color-accent)] drop-shadow-[0_0_12px_rgba(229,9,20,0.8)] scale-110' : 'text-white/60 group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] scale-100'}`}
         />
      </div>
    </button>
  );
};

/**
 * Sidebar component: Liquid Glass Interface
 */
export const Sidebar: React.FC<SidebarProps> = ({ activeCategory, onCategorySelect }) => {
  return (
    <aside className="flex-none w-[120px] h-full bg-[#050505] border-r border-[#151515] flex flex-col z-30 shadow-[8px_0_32px_rgba(0,0,0,0.6)] relative isolate">
      <GlassFilter />

      <div className="flex-1 flex flex-col items-center justify-between w-full h-full px-5 py-6 gap-4">
         {CATEGORIES.map(cat => (
            <GlassButton 
              key={cat.id} 
              category={cat} 
              isActive={activeCategory === cat.id} 
              onClick={() => onCategorySelect(cat.id)} 
            />
         ))}
      </div>
    </aside>
  );
};

