import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function extractYouTubeID(url: string): string | null {
  const regExp =
    /^.*(youtu.be\/|youtube.com\/embed\/|youtube.com\/v\/|youtube.com\/watch\?v=|youtube.com\/watch\?.+&v=)([^#\&\?]*).*/

  const match = url.match(regExp)

  console.log({ url, match })

  if (match && match[2].length === 11) {
    return match[2]
  } else {
    return null
  }
}

export function getYouTubeThumbnail(url: string): string | null {
  const videoID = extractYouTubeID(url)

  if (videoID) {
    return `https://img.youtube.com/vi/${videoID}/maxresdefault.jpg`
  } else {
    return null
  }
}
