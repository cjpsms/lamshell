// Line icons for buttons (16px, stroke = currentColor), so buttons match the window controls instead of using emoji.
const P = {
  bulb: '<path d="M8 1.8a4.2 4.2 0 0 0-2.4 7.6c.5.4.8.9.8 1.5v.9h3.2v-.9c0-.6.3-1.1.8-1.5A4.2 4.2 0 0 0 8 1.8z"/><path d="M6.6 14h2.8"/>',
  rewind: '<path d="M3.2 8.6a4.9 4.9 0 1 0 1.3-4.1"/><path d="M4.3 1.9v2.8h2.8"/><path d="M8 5.4V8l1.8 1.3"/>',
  book: '<path d="M8 4.2C6.6 3 4.5 2.8 2 3.2v9.3c2.5-.4 4.6-.2 6 1 1.4-1.2 3.5-1.4 6-1V3.2c-2.5-.4-4.6-.2-6 1z"/><path d="M8 4.2v9.3"/>',
  map: '<path d="M1.8 3.6l4-1.4 4.4 1.6 4-1.4v10l-4 1.4-4.4-1.6-4 1.4z"/><path d="M5.8 2.2v10M10.2 3.8v10"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  mouse: '<rect x="4.2" y="1.8" width="7.6" height="12.4" rx="3.8"/><path d="M8 1.8v4.4M4.2 6.2h7.6"/>',
};
export const icon = (name, size = 16) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
