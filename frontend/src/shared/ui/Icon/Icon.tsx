export type IconName = 'cube' | 'grid' | 'folder' | 'building' | 'scan' | 'arrow' | 'plus' | 'search' | 'logout' | 'chevron' | 'menu' | 'check' | 'upload' | 'shield' | 'close' | 'planner'
 | 'home' | 'spaces' | 'learn' | 'camera' | 'image' | 'share' | 'link' | 'code' | 'download' | 'play' | 'eye' | 'pin' | 'flag' | 'retake' | 'clock' | 'chart' | 'user' | 'users' | 'help' | 'trash' | 'edit' | 'external' | 'queue' | 'layers' | 'sun' | 'phone' | 'back' | 'more' | 'copy' | 'info' | 'warning'
const paths: Record<IconName, string> = {
 planner: 'M4 3h16v18H4zM4 8h16M9 8v13M9 14h11M14 8v6',
 cube: 'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9',
 grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 folder: 'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z',
 building: 'M4 21V5h10v16M14 10h6v11M2 21h20M7 8h4M7 12h4M7 16h4M17 13v2M17 17v2',
 scan: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 8l5-3 5 3v7l-5 3-5-3V8ZM7 8l5 3 5-3M12 11v7',
 arrow: 'M5 12h14M13 6l6 6-6 6', plus: 'M12 5v14M5 12h14',
 search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
 logout: 'M9 4H4v16h5M10 12h11M16 7l5 5-5 5',
 chevron: 'm9 5 7 7-7 7', menu: 'M4 6h16M4 12h16M4 18h16',
 check: 'm5 12.5 4.5 4.5L19 7.5', upload: 'M12 16V3M7 8l5-5 5 5M4 15v6h16v-6',
 shield: 'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4ZM8 12l3 3 5-6', close: 'm6 6 12 12M6 18 18 6',
 home: 'M4 11 12 4l8 7v8.5h-5.5V14h-5v5.5H4V11Z',
 spaces: 'M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z',
 learn: 'M4 6.5c3-1.3 5.5-1.3 8 0 2.5-1.3 5-1.3 8 0V18c-3-1.3-5.5-1.3-8 0-2.5-1.3-5-1.3-8 0V6.5ZM12 6.5V18',
 camera: 'M4 8.5h3.200L8.800 6h6.400l1.600 2.500H20V19H4V8.500ZM15.200 13.500a3.200 3.200 0 1 1-6.400 0 3.200 3.200 0 0 1 6.400 0Z',
 image: 'M4 5h16v14H4zM4 15.5l4.500-4.500 4 4 2.500-2.500 5 5M16.500 9.500a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
 share: 'M12 15V4M8 7.500l4-4 4 4M7 11H5v9h14v-9h-2',
 link: 'M10 14a4 4 0 0 0 5.700 0l3-3A4 4 0 0 0 13 5.300l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3A4 4 0 0 0 11 18.700l1-1',
 code: 'm8.500 7-5 5 5 5M15.500 7l5 5-5 5',
 download: 'M12 4v11M7.500 11l4.500 4.500 4.500-4.500M5 19.500h14',
 play: 'M8 5.500v13l10.500-6.500L8 5.500Z',
 eye: 'M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12ZM14.800 12a2.800 2.800 0 1 1-5.600 0 2.800 2.800 0 0 1 5.600 0Z',
 pin: 'M12 21s6.500-5.600 6.500-10.500a6.500 6.500 0 0 0-13 0C5.500 15.400 12 21 12 21ZM14.300 10.500a2.300 2.300 0 1 1-4.600 0 2.300 2.300 0 0 1 4.600 0Z',
 flag: 'M5.500 21V4M5.500 5h11l-2 4 2 4h-11',
 retake: 'M4.500 12a7.500 7.500 0 0 1 13-5.100L19.500 9M19.500 4.500V9H15M19.500 12a7.500 7.500 0 0 1-13 5.100L4.500 15M4.500 19.500V15H9',
 chart: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
 clock: 'M20.500 12a8.500 8.500 0 1 1-17 0 8.500 8.500 0 0 1 17 0ZM12 7.500V12l3 2',
 user: 'M15.500 8a3.500 3.500 0 1 1-7 0 3.500 3.500 0 0 1 7 0ZM5 20c.6-3.400 3.400-5.500 7-5.500s6.400 2.100 7 5.500',
 users: 'M12.500 8.500a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3.500 19.500c.5-3 2.900-4.800 6-4.800s5.500 1.800 6 4.800M15.500 5.800a3 3 0 0 1 0 5.400M17.500 14.900c1.600.6 2.700 2 3 4.100',
 help: 'M20.500 12a8.500 8.500 0 1 1-17 0 8.500 8.500 0 0 1 17 0ZM9.700 9.500a2.400 2.400 0 1 1 3.500 2.100c-.8.5-1.200 1-1.200 1.900M12 16.600v.1',
 trash: 'M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12.500h9.400L17.500 7M10 11v5M14 11v5',
 edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4',
 external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
 queue: 'M4 13.500 6.500 5h11L20 13.500V19H4v-5.500ZM4 13.500h4.500l1 2.500h5l1-2.500H20',
 layers: 'm12 3.500 8.500 4.500-8.500 4.500L3.500 8 12 3.500ZM3.500 12l8.500 4.500 8.500-4.500M3.500 16l8.500 4.500 8.500-4.500',
 sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400',
 phone: 'M7.500 3h9v18h-9zM11 17.500h2',
 back: 'M19 12H5M11 6l-6 6 6 6',
 more: 'M6.500 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM19.500 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
 copy: 'M9 9h11v11H9zM15 9V4H4v11h5',
 info: 'M20.500 12a8.500 8.500 0 1 1-17 0 8.500 8.500 0 0 1 17 0ZM12 11v5.500M12 7.500v.1',
 warning: 'M12 4 2.500 20h19L12 4ZM12 10v4.500M12 17.400v.1',
}
export type IconProps = {
 /** Which glyph to draw. */
 name: IconName
 /** Width and height in px. Default 18. */
 size?: number
 className?: string
}
export default function Icon({ name, size = 18, className }: IconProps) {
 return <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}
