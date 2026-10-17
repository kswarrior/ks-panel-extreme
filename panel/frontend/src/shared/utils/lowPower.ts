// Low-power device detection. Old phones/tablets (e.g. Android 11, 4GB RAM)
// choke on the panel's 120+ backdrop-filter surfaces, so we flag the
// document and the theme stylesheet swaps the GPU-heavy variants for cheap
// ones (see LOW_FX_CSS in themeStore.ts). `ks-low-fx=0` in localStorage is
// an escape hatch for users who prefer the full glass look.
export function initLowPowerMode(): boolean {
  try {
    if (localStorage.getItem('ks-low-fx') === '0') return false;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const small = window.innerWidth <= 1024;
    const lowMem = (nav.deviceMemory ?? 8) <= 2;
    const lowCpu = (nav.hardwareConcurrency ?? 8) <= 2;
    const low = (coarse && small) || lowMem || lowCpu;
    if (low) document.documentElement.classList.add('ks-low-fx');
    return low;
  } catch {
    return false;
  }
}
