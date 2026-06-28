import React from "react";

const LoadingLines: React.FC = () => {
  const letters = "TARANGA+".split("");

  return (
    <div className="relative flex items-center justify-center h-[120px] w-auto m-8 text-[1.6em] font-semibold select-none text-white scale-[2]">
      {letters.map((letter, idx) => (
        <span
          key={idx}
          className="relative inline-block opacity-0 z-[2] animate-[letterAnim_4s_linear_infinite] text-black dark:text-white"
          style={{ animationDelay: `${0.1 + idx * 0.105}s` }}
        >
          {letter}
        </span>
      ))}

      <div className="absolute top-0 left-0 w-full h-full z-[1] bg-transparent [mask:repeating-linear-gradient(90deg,transparent_0,transparent_6px,black_7px,black_8px)]">
        <div className="absolute top-0 left-0 w-full h-full
          [background-image:radial-gradient(circle_at_50%_50%,#ff0_0%,transparent_50%),radial-gradient(circle_at_45%_45%,#f00_0%,transparent_45%),radial-gradient(circle_at_55%_55%,#0ff_0%,transparent_45%),radial-gradient(circle_at_45%_55%,#0f0_0%,transparent_45%),radial-gradient(circle_at_55%_45%,#00f_0%,transparent_45%)]
          [mask:radial-gradient(circle_at_50%_50%,transparent_0%,transparent_10%,black_25%)]
          animate-[transformAnim_2s_infinite_alternate_cubic-bezier(0.6,0.8,0.5,1),opacityAnim_4s_infinite]" />
      </div>
    </div>
  );
};

export default LoadingLines;
