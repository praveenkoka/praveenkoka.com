import { ReactNode, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { WORK, Work } from "@/constants/work"
import FsLightbox from "fslightbox-react"
import { PlayCircle } from "react-feather"

import { getYouTubeThumbnail } from "@/lib/utils"
import { Avatar, AvatarImage } from "@/components/ui/avatar"

const prettyDuration = (startDate: string, endDate: string): string => {
  const start = new Date(startDate)
  const end =
    endDate.toLowerCase() === "present" ? new Date() : new Date(endDate)

  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()

  if (months < 0) {
    years -= 1
    months += 12
  }

  months += 1

  if (months === 12) {
    years += 1
    months = 0
  }

  let result = `${years} year${years > 1 ? "s" : ""}`

  if (months > 0) {
    result += ` ${months} month${months > 1 ? "s" : ""}`
  }

  return result.trim()
}

const ExperienceNode: React.FC<Work> = ({
  designation,
  company,
  startDate,
  endDate,
  summary,
  tags,
  imgUrl,
  companyUrl,
  portfolio,
}) => {
  const [isLightboxOpen, setLightboxOpen] = useState(false)
  const [currentImage, setCurrentImage] = useState(0)

  const openLightbox = (index: number) => {
    setCurrentImage(index)
    console.log("Opening lightbox")
    setLightboxOpen(true)
  }

  return (
    <div className="flex gap-3 mb-6">
      <Avatar className="rounded-lg">
        <AvatarImage src={imgUrl} />
      </Avatar>

      <div className="flex-grow">
        <h3 className="text-lg font-bold">{designation}</h3>
        <p className="text-md mb-4">
          <Link target="_blank" href={companyUrl}>
            {company}{" "}
          </Link>
          <span className="text-sm text-muted-foreground">
            ({startDate} - {endDate}, {prettyDuration(startDate, endDate)})
          </span>
        </p>
        <p className="text-sm">{summary}</p>
        <div className="mt-4">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-2">
          {portfolio.map((item, index) => (
            <div
              key={index}
              className="cursor-pointer relative"
              onClick={() => openLightbox(index)}
            >
              {item.type === "image" ? (
                <div className="rounded-2xl h-full">
                  <Image
                    height={200}
                    width={200}
                    src={item.src}
                    alt="Carousel item"
                    className="rounded-2xl"
                  />
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-black to-black opacity-20 rounded-2xl" />
                </div>
              ) : (
                <div className="rounded-2xl flex h-full">
                  <div className="absolute top-2 right-2">
                    <PlayCircle
                      color="white"
                      size={40}
                      className="rounded-full bg-black"
                    />
                  </div>
                  <Image
                    height={200}
                    width={200}
                    src={getYouTubeThumbnail(item.src) || ""}
                    alt="Carousel item"
                    className="rounded-2xl"
                  />
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-violet-600 to-indigo-600 opacity-20 rounded-2xl" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <FsLightbox
        toggler={isLightboxOpen}
        sourceIndex={currentImage}
        exitFullscreenOnClose={true}
        sources={portfolio.map((p) => p.src)}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  )
}

const WorkExperienceTimeline: React.FC = () => {
  return (
    <div className="space-y-6">
      {WORK.map((exp, index) => (
        <>
          <ExperienceNode key={index} {...exp} />
          <div className="border-t md:border-b-0 border-gray-200"></div>
        </>
      ))}
    </div>
  )
}

export default WorkExperienceTimeline
