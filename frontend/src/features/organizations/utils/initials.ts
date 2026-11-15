/** Up to two letters for a name mark: "Harbour Estates" -> "HE", "maria" -> "MA". */
export function initials(name: string): string {
 const words = name.trim().split(/\s+/).filter(Boolean)
 if (words.length === 0) return '?'
 const letters = words.length === 1 ? Array.from(words[0]).slice(0, 2) : [Array.from(words[0])[0], Array.from(words[1])[0]]
 return letters.join('').toUpperCase()
}
