const P = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  invoice: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8M9 9h3',
  box: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10',
  book: 'M4 4h11a3 3 0 013 3v14H7a3 3 0 01-3-3zM4 18a3 3 0 013-3h11M8 8h6',
  cake: 'M4 21h16M5 21v-7h14v7M5 14c2 1.5 4.7 1.5 7 0 2.3 1.5 5 1.5 7 0M8 14V9h8v5M12 9V6M12 3.5v.5',
  factory: 'M3 21V10l6 3V10l6 3V6h6v15zM7 17h2M12 17h2M17 17h2',
  history: 'M3 12a9 9 0 103-6.7L3 8M3 3v5h5M12 7v5l3 2',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  camera: 'M3 8h3l2-3h8l2 3h3v12H3zM12 17a4 4 0 100-8 4 4 0 000 8z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  back: 'M15 5l-7 7 7 7',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  snapshot: 'M4 7h3l2-3h6l2 3h3v13H4zM9 13l2 2 4-4',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  scale: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  icecream: 'M7.5 10.5a4.5 4.5 0 119 0M6.5 10.5h11L12 21z',
  bread: 'M6 20h12a1 1 0 001-1v-7.4A3.5 3.5 0 0018 5c-1.4-1.3-3.6-2-6-2s-4.6.7-6 2a3.5 3.5 0 00-1 6.6V19a1 1 0 001 1zM9 9v6M12 8v7M15 9v6',
  cookie: 'M12 3a9 9 0 109 9 3 3 0 01-3.2-3.2A3 3 0 0114.6 5 3 3 0 0112 3zM8.5 10.5h.01M15 15h.01M10.5 16h.01M8 14h.01',
  cup: 'M6 4h12l-1.6 15.2a2 2 0 01-2 1.8H9.6a2 2 0 01-2-1.8zM6.6 9.5h10.8M12 4V2',
  bowl: 'M3 11h18a9 9 0 01-18 0zM9 7.5c0-1.6.8-3 2-3.5M13 7.5c0-1.6.8-3 2-3.5',
  photo: 'M4 6h16v13H4zM4 16l4.5-4.5 3.5 3.5 3-3 5 5M15.5 9.5h.01',
  sparkle: 'M12 3l1.8 4.6L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
};

export function Icon({ name, size, className }) {
  const d = P[name] || P.file;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
