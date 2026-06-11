// Soft atlas-style palette - mid-pastel tones chosen to sit happily
// together on a white panel (no neon, no muddy lows). Order roughly
// walks the color wheel so adjacent providers stay distinct.
const PALETTE = [
  '#7CA9C9', // atlas blue
  '#E6B17A', // warm sand
  '#91B89C', // sage
  '#B898C8', // lilac
  '#E5C374', // mustard
  '#82BDB9', // seafoam
  '#D08F8F', // soft clay
  '#9BA1B0', // cool gray
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}
