export type IconName = 'cube' | 'grid' | 'folder' | 'building' | 'scan' | 'arrow' | 'plus' | 'search' | 'logout' | 'chevron' | 'menu' | 'check' | 'upload' | 'shield' | 'close' | 'planner'
const paths: Record<IconName, string> = {
 planner: 'M4 3h16v18H4zM4 8h16M9 8v13M9 14h11M14 8v6',
 cube: 'M12 3 3 8v9l9 5 9-5V8l-9-5ZM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5',
 grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 folder: 'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z',
 building: 'M4 21V5h10v16M14 10h6v11M2 21h20M7 8h4M7 12h4M7 16h4M17 13v2M17 17v2',
 scan: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 8l5-3 5 3v7l-5 3-5-3V8ZM7 8l5 3 5-3M12 11v7',
 arrow: 'M5 12h14M13 6l6 6-6 6', plus: 'M12 5v14M5 12h14',
 search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
 logout: 'M9 4H4v16h5M10 12h11M16 7l5 5-5 5',
 chevron: 'm9 5 7 7-7 7', menu: 'M4 6h16M4 12h16M4 18h16',
 check: 'm5 12 4 4L19 6', upload: 'M12 16V3M7 8l5-5 5 5M4 15v6h16v-6',
 shield: 'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4ZM8 12l3 3 5-6', close: 'm6 6 12 12M6 18 18 6',
}
export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
 return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}
