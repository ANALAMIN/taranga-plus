import React from 'react';
import { LayoutGrid, Heart, Trophy, Film, Music, Tv, Smile, BookOpen } from 'lucide-react';
import { Category } from '../../types';

interface LiquidGlassSidebarProps {
  activeCategory: Category;
  onCategorySelect: (category: Category) => void;
}

const CATEGORIES: { id: Category; Icon: React.ElementType }[] = [
  { id: 'all', Icon: LayoutGrid },
  { id: 'favorites', Icon: Heart },
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
const RealismButton: React.FC<{ category: typeof CATEGORIES[0], isActive: boolean, onClick: () => void }> = ({ category, isActive, onClick }) => {
  const Icon = category.Icon;

  return (
    <button 
      onClick={onClick}
      className={`group relative p-[2px] rounded-[16px] text-[1.4rem] border-none cursor-pointer bg-[radial-gradient(circle_80px_at_80%_-10%,_#ffffff,_#181b1b)] transition-all flex-shrink-0 w-[72px] h-[72px] mx-auto ${isActive ? 'scale-[1.05]' : ''}`}
    >
      {/* Glow behind button */}
      <div className={`absolute top-0 right-0 w-[65%] h-[60%] rounded-[120px] transition-all duration-300 ease-out -z-10 ${isActive ? 'shadow-[0_0_40px_#ffffff60]' : 'shadow-[0_0_20px_#ffffff38] group-hover:shadow-[0_0_40px_#ffffff60]'}`} />

      {/* Bottom-left theme blob */}
      <div 
        className={`absolute bottom-0 left-0 h-[50%] rounded-[17px] transition-all duration-300 ease-out ${isActive ? 'w-[70px]' : 'w-[50px] group-hover:w-[90px]'}`} 
        style={{
          background: 'radial-gradient(circle 60px at 0% 100%, var(--color-accent), rgba(var(--color-accent-rgb), 0.3), transparent)',
          boxShadow: isActive ? '-4px 1px 45px rgba(var(--color-accent-rgb), 0.4)' : '-2px 9px 40px rgba(var(--color-accent-rgb), 0.25)'
        }}
      />

      {/* Inner content */}
      <div className={`relative w-full h-full flex items-center justify-center rounded-[14px] text-white bg-[radial-gradient(circle_80px_at_80%_-50%,_#777777,_#0f1111)] z-10 transition-all duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
        <Icon size={32} strokeWidth={1.5} className="text-white drop-shadow-md" />

        {/* Inner glow layer */}
        <div className="absolute inset-0 rounded-[14px] z-[-1]" 
          style={{
            background: 'radial-gradient(circle 60px at 0% 100%, rgba(var(--color-accent-rgb), 0.1), rgba(var(--color-accent-rgb), 0.05), transparent)'
          }}
        />
      </div>
    </button>
  );
};

export const LiquidGlassSidebar: React.FC<LiquidGlassSidebarProps> = ({ activeCategory, onCategorySelect }) => {
  return (
    <aside className="flex-none w-[120px] h-full bg-[#050505] border-r border-[#151515] flex flex-col z-30 shadow-[8px_0_32px_rgba(0,0,0,0.6)] relative isolate">
      <GlassFilter />

      <div className="flex-1 flex flex-col items-center justify-start w-full h-full px-5 py-6 gap-6 overflow-y-auto overflow-x-hidden">
         {CATEGORIES.map(cat => (
            <RealismButton 
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
