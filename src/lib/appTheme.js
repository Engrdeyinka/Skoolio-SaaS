// ─── Color palette definitions ──────────────────────────────────────────────
// Each palette maps the full Tailwind emerald scale (which the app uses as its
// primary color) to a replacement color scale, plus HSL values for the sidebar
// CSS variables defined in index.css.

export const PALETTES = {
  emerald: {
    name: "Emerald",
    description: "Classic green (default)",
    preview: ["#d1fae5", "#10b981", "#047857"],
    shades: null, // default — no override needed
    sidebarHsl: null,
  },
  blue: {
    name: "Ocean Blue",
    description: "Cool and professional",
    preview: ["#dbeafe", "#3b82f6", "#1d4ed8"],
    shades: {
      50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd",
      400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8",
      800: "#1e40af", 900: "#1e3a8a",
    },
    sidebarHsl: {
      bg: "214 100% 97%", fg: "224 76% 20%", primary: "221 83% 53%",
      accent: "214 95% 93%", border: "213 97% 87%", ring: "221 83% 53%",
    },
  },
  purple: {
    name: "Royal Purple",
    description: "Bold and creative",
    preview: ["#f3e8ff", "#a855f7", "#7e22ce"],
    shades: {
      50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe",
      400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce",
      800: "#6b21a8", 900: "#581c87",
    },
    sidebarHsl: {
      bg: "270 100% 98%", fg: "276 91% 22%", primary: "270 91% 55%",
      accent: "270 100% 95%", border: "269 97% 85%", ring: "270 91% 55%",
    },
  },
  rose: {
    name: "Rose",
    description: "Warm and vibrant",
    preview: ["#ffe4e6", "#f43f5e", "#be123c"],
    shades: {
      50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af",
      400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c",
      800: "#9f1239", 900: "#881337",
    },
    sidebarHsl: {
      bg: "356 100% 98%", fg: "347 77% 20%", primary: "347 77% 50%",
      accent: "356 100% 95%", border: "354 100% 90%", ring: "347 77% 50%",
    },
  },
  amber: {
    name: "Amber",
    description: "Energetic and warm",
    preview: ["#fef3c7", "#f59e0b", "#b45309"],
    shades: {
      50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d",
      400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309",
      800: "#92400e", 900: "#78350f",
    },
    sidebarHsl: {
      bg: "48 100% 96%", fg: "26 83% 14%", primary: "38 92% 50%",
      accent: "48 96% 89%", border: "46 97% 70%", ring: "38 92% 50%",
    },
  },
  teal: {
    name: "Deep Teal",
    description: "Calm and sophisticated",
    preview: ["#ccfbf1", "#14b8a6", "#0f766e"],
    shades: {
      50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4",
      400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e",
      800: "#115e59", 900: "#134e4a",
    },
    sidebarHsl: {
      bg: "166 76% 97%", fg: "175 85% 17%", primary: "173 80% 40%",
      accent: "166 76% 90%", border: "167 85% 73%", ring: "173 80% 40%",
    },
  },
  indigo: {
    name: "Indigo",
    description: "Smart and modern",
    preview: ["#e0e7ff", "#6366f1", "#4338ca"],
    shades: {
      50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc",
      400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca",
      800: "#3730a3", 900: "#312e81",
    },
    sidebarHsl: {
      bg: "226 100% 97%", fg: "234 62% 26%", primary: "239 84% 67%",
      accent: "226 100% 94%", border: "226 100% 91%", ring: "239 84% 67%",
    },
  },
  slate: {
    name: "Slate",
    description: "Clean and minimal",
    preview: ["#f1f5f9", "#64748b", "#334155"],
    shades: {
      50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1",
      400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155",
      800: "#1e293b", 900: "#0f172a",
    },
    sidebarHsl: {
      bg: "210 40% 98%", fg: "215 25% 27%", primary: "215 16% 47%",
      accent: "210 40% 94%", border: "214 32% 91%", ring: "215 16% 47%",
    },
  },
};

// ─── Color math helpers ──────────────────────────────────────────────────────

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  const hNorm = h / 360, sNorm = s / 100, lNorm = l / 100;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (sNorm === 0) { r = g = b = lNorm; }
  else {
    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hue2rgb(p, q, hNorm + 1 / 3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1 / 3);
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Generates a 10-shade scale (50–900) from a single base hex color
export function generateCustomScale(hex) {
  const [h, s] = hexToHsl(hex);
  const sat = Math.min(s + 10, 90);
  const stops = [97, 93, 86, 75, 63, 50, 40, 31, 23, 15];
  const levels = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  const shades = {};
  levels.forEach((l, i) => { shades[l] = hslToHex(h, sat, stops[i]); });
  return shades;
}

// ─── CSS generation ──────────────────────────────────────────────────────────

// Override both emerald-* AND blue-* to the theme color.
// The app uses blue as a secondary "primary" across buttons, stat cards, and icons.
// Emerald (the Tailwind base) and blue both map to the same theme shades.
// When theme=emerald we skip overrides entirely, so blue stays blue by default.
function buildOverrideCSS(shades) {
  const levels = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  const colorNames = ["emerald", "blue"];
  // Opacity steps used across the codebase (bg-emerald-50/60, border-emerald-200/70, etc.)
  const opacities = [5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95];
  let css = "";
  for (const name of colorNames) {
    for (const l of levels) {
      const c = shades[l];
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      // Solid utilities
      css += `.bg-${name}-${l}{background-color:${c}!important}`;
      css += `.text-${name}-${l}{color:${c}!important}`;
      css += `.border-${name}-${l}{border-color:${c}!important}`;
      css += `.ring-${name}-${l}{--tw-ring-color:${c}!important}`;
      css += `.fill-${name}-${l}{fill:${c}!important}`;
      css += `.stroke-${name}-${l}{stroke:${c}!important}`;
      css += `.from-${name}-${l}{--tw-gradient-from:${c}!important}`;
      css += `.to-${name}-${l}{--tw-gradient-to:${c}!important}`;
      css += `.via-${name}-${l}{--tw-gradient-via:${c}!important}`;
      css += `.shadow-${name}-${l}{--tw-shadow-color:${c}!important}`;
      // Opacity modifier variants (bg-emerald-50/70 → .bg-emerald-50\/70)
      for (const op of opacities) {
        const a = (op / 100).toFixed(2);
        css += `.bg-${name}-${l}\\/${op}{background-color:rgb(${r} ${g} ${b}/${a})!important}`;
        css += `.border-${name}-${l}\\/${op}{border-color:rgb(${r} ${g} ${b}/${a})!important}`;
        css += `.text-${name}-${l}\\/${op}{color:rgb(${r} ${g} ${b}/${a})!important}`;
        css += `.ring-${name}-${l}\\/${op}{--tw-ring-color:rgb(${r} ${g} ${b}/${a})!important}`;
        css += `.shadow-${name}-${l}\\/${op}{--tw-shadow-color:rgb(${r} ${g} ${b}/${a})!important}`;
        css += `.from-${name}-${l}\\/${op}{--tw-gradient-from:rgb(${r} ${g} ${b}/${a})!important}`;
        css += `.via-${name}-${l}\\/${op}{--tw-gradient-via:rgb(${r} ${g} ${b}/${a})!important}`;
        css += `.to-${name}-${l}\\/${op}{--tw-gradient-to:rgb(${r} ${g} ${b}/${a})!important}`;
      }
      // Hover / focus / active / group states
      css += `.hover\\:bg-${name}-${l}:hover{background-color:${c}!important}`;
      css += `.hover\\:text-${name}-${l}:hover{color:${c}!important}`;
      css += `.hover\\:border-${name}-${l}:hover{border-color:${c}!important}`;
      css += `.hover\\:fill-${name}-${l}:hover{fill:${c}!important}`;
      css += `.focus\\:ring-${name}-${l}:focus{--tw-ring-color:${c}!important}`;
      css += `.focus\\:border-${name}-${l}:focus{border-color:${c}!important}`;
      css += `.focus-visible\\:ring-${name}-${l}:focus-visible{--tw-ring-color:${c}!important}`;
      css += `.active\\:bg-${name}-${l}:active{background-color:${c}!important}`;
      css += `.active\\:text-${name}-${l}:active{color:${c}!important}`;
      css += `.group:hover .group-hover\\:bg-${name}-${l}{background-color:${c}!important}`;
      css += `.group:hover .group-hover\\:text-${name}-${l}{color:${c}!important}`;
    }
  }
  return css;
}

function buildSidebarCSS(hsl) {
  return `:root{--sidebar-background:${hsl.bg};--sidebar-foreground:${hsl.fg};--sidebar-primary:${hsl.primary};--sidebar-primary-foreground:0 0% 100%;--sidebar-accent:${hsl.accent};--sidebar-accent-foreground:${hsl.fg};--sidebar-border:${hsl.border};--sidebar-ring:${hsl.ring}}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const STORAGE_KEY = "app_theme";
export const CUSTOM_HEX_KEY = "app_theme_custom_hex";

export function applyTheme(key, customHex) {
  let styleEl = document.getElementById("__app_theme__");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "__app_theme__";
    document.head.appendChild(styleEl);
  }

  if (key === "emerald") {
    styleEl.textContent = "";
    return;
  }

  if (key === "custom") {
    const hex = customHex || localStorage.getItem(CUSTOM_HEX_KEY) || "#3b82f6";
    const shades = generateCustomScale(hex);
    const [h, s] = hexToHsl(hex);
    const hsl = {
      bg:      `${h} ${Math.min(s, 60)}% 97%`,
      fg:      `${h} ${Math.min(s + 20, 90)}% 15%`,
      primary: `${h} ${Math.min(s + 10, 85)}% 42%`,
      accent:  `${h} ${Math.min(s, 60)}% 93%`,
      border:  `${h} ${Math.min(s, 60)}% 80%`,
      ring:    `${h} ${Math.min(s + 10, 85)}% 42%`,
    };
    styleEl.textContent = buildSidebarCSS(hsl) + buildOverrideCSS(shades);
    return;
  }

  const palette = PALETTES[key];
  if (!palette) return;

  styleEl.textContent =
    buildSidebarCSS(palette.sidebarHsl) + buildOverrideCSS(palette.shades);
}

export function initTheme() {
  const key = localStorage.getItem(STORAGE_KEY) || "emerald";
  const hex = localStorage.getItem(CUSTOM_HEX_KEY);
  applyTheme(key, hex);
}

export function saveTheme(key, customHex) {
  localStorage.setItem(STORAGE_KEY, key);
  if (key === "custom" && customHex) {
    localStorage.setItem(CUSTOM_HEX_KEY, customHex);
  }
  applyTheme(key, customHex);
}

export function getCurrentTheme() {
  return {
    key: localStorage.getItem(STORAGE_KEY) || "emerald",
    customHex: localStorage.getItem(CUSTOM_HEX_KEY) || "#3b82f6",
  };
}
