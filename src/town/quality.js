// Phones get a lighter town: fewer trees and smaller shadow maps, so the
// build fits in mobile memory and finishes quickly.
const touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;
const lowMemory = typeof navigator !== 'undefined' && navigator.deviceMemory !== undefined && navigator.deviceMemory < 4;
export const LITE = touch || lowMemory || new URLSearchParams(location.search).has('lite');
export const DENSITY = LITE ? 0.4 : 1;
