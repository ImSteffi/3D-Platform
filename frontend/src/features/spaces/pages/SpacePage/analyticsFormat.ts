/** Seconds as "45 s" or "2 min 5 s". */
export function duration(seconds: number) {
 if (seconds < 60) return `${seconds} s`
 return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}
