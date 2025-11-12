"use client";

export const TileBackground = () => {
  const tiles = Array.from({ length: 120 }, (_, i) => i);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="grid grid-cols-12 gap-1.5 p-2 h-full w-full">
        {tiles.map((tile) => (
          <div
            key={tile}
            className="relative group aspect-square pointer-events-auto"
          >
            <div className="absolute inset-0 rounded-md opacity-20 group-hover:opacity-50 transition-all duration-300 ease-out group-hover:scale-110 group-hover:shadow-xl group-hover:-translate-y-2 border tile-bg" />
          </div>
        ))}
      </div>
    </div>
  );
};

