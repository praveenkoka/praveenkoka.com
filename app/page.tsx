"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Skills from "@/components/skills"
import WorkExperienceTimeline from "@/components/work-experience-timeline"

export default function IndexPage() {
  return (
    <>
      <section className="container grid items-center gap-6 pb-8 pt-6 md:py-10">
        <div className="flex flex-col md:flex-row max-w-[980px] items-center md:items-start gap-12 mb-8">
          <Avatar className="w-48 h-48 mx-auto md:mx-0">
            <AvatarImage src="/profile-pic.jpg" />
            <AvatarFallback>PK</AvatarFallback>
          </Avatar>
          <div className="flex flex-col justify-center sm:h-48 text-center md:text-left">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl mb-2">
              👋 Hi there, I'm Praveen Koka
            </h1>
            <p className="max-w-[700px] text-lg text-muted-foreground mx-auto md:mx-0">
              I'm a CTO, CPTO, and software architect. I've founded and built 3
              startups in IOT, analytics, and SaaS. Led teams of 5-30 members
              across product, engineering, and operations. Currently work as VP
              Engineering at an AI dev tools company in Berlin.
            </p>
          </div>
        </div>
      </section>
      <section className="grid items-center gap-6 pb-8 pt-6 md:py-10 bg-gray-100">
        <div className="container">
          <div className="flex flex-col lg:flex-row gap-12">
            <div className="lg:w-3/5 w-full">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl mb-12">
                Work
              </h1>
              <WorkExperienceTimeline />

              <h1 className="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl mt-12 mb-12">
                Skills
              </h1>
              <Skills />
            </div>
            <div className="lg:w-2/5 w-full"></div>
          </div>
        </div>
      </section>
    </>
  )
}
