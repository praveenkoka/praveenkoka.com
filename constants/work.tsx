import { ReactNode } from "react"

export const PORTFOLIO_VIDEOS = {
  hawtlist: "https://www.youtube.com/watch?v=D3ST2Kgxufc",
  quant: "https://www.youtube.com/watch?v=m6_-iSVkEUE",
  socom: "https://www.youtube.com/watch?v=PJNK6wFw4nk",
  roq: [],
}

export interface Work {
  designation: string
  company: string
  startDate: string
  endDate: string
  summary: ReactNode
  tags: string[]
  imgUrl?: string
  companyUrl: string
  portfolio: {
    type: "image" | "video"
    src: string
  }[]
}

export const WORK: Work[] = [
  {
    designation: "VP Engineering",
    company: "ROQ.ai",
    startDate: "Jun 2021",
    endDate: "Present",
    summary: (
      <>
        Leading multiple Engineering teams to ship an AI platform that generates
        and deploys webapps from plaintext prompts.
        <br />
        <br />
        Started as Tech Lead, promoted to Director in 3 months, and then to VP
        Engineering a year later
      </>
    ),
    tags: ["Gen AI", "Developer Tools", "BaaS", "Enterprise", "Open AI"],
    imgUrl: "/logos/roq.svg",
    companyUrl: "https://roq.ai",
    portfolio: [
      {
        type: "image",
        src: "/portfolio/roq1.jpg",
      },
      {
        type: "video",
        src: "https://www.youtube.com/watch?v=9-3wvPv7IT4",
      },
      {
        type: "video",
        src: "https://www.youtube.com/watch?v=XXbl-79SfIc",
      },
    ],
  },
  {
    designation: "Co-Founder, CPTO",
    company: "Greenroom",
    startDate: "Jan 2015",
    endDate: "May 2021",
    summary: (
      <>
        Built a Social Analytics platform processing millions of social media
        posts per day to generate brand & influencer insights
        <br />
        <br />
        Raised an angel round, grew the company to ~ $2M in services revenue
        before moving on
      </>
    ),
    tags: ["SaaS", "Analytics", "Machine Learning", "Marketing Tech"],
    imgUrl: "/logos/greenroom.svg",
    companyUrl: "https://greenroomnow.com",
    portfolio: [
      {
        type: "image",
        src: "/portfolio/quant1.jpg",
      },
      {
        type: "image",
        src: "/portfolio/quant2.jpg",
      },
      {
        type: "image",
        src: "/portfolio/quant3.jpg",
      },
      {
        type: "image",
        src: "/portfolio/quant4.jpg",
      },
      // {
      //   type: "video",
      //   src: "https://www.youtube.com/watch?v=m6_-iSVkEUE",
      // },
      {
        type: "video",
        src: "https://www.youtube.com/watch?v=PJNK6wFw4nk",
      },
    ],
  },
  {
    designation: "Founder, CEO",
    company: "Hawtlist.com",
    startDate: "Jun 2020",
    endDate: "May 2021",
    summary: (
      <>
        Developed a highly scalable Social commerce app - hawtlist.com - where
        influencers can recommend products, and earn commissions when their
        followers purchase them
      </>
    ),
    tags: ["E-commerce", "Social Media", "B2C"],
    imgUrl: "/logos/hawtlist.svg",
    companyUrl: "https://hawtlist.com",
    portfolio: [
      {
        type: "image",
        src: "/portfolio/hl1.jpg",
      },
      {
        type: "image",
        src: "/portfolio/hl2.jpg",
      },
      {
        type: "image",
        src: "/portfolio/hl3.jpg",
      },
      {
        type: "image",
        src: "/portfolio/hl4.jpg",
      },
      // {
      //   type: "video",
      //   src: "https://www.youtube.com/watch?v=m6_-iSVkEUE",
      // },
      {
        type: "video",
        src: "https://www.youtube.com/watch?v=D3ST2Kgxufc",
      },
    ],
  },
  {
    designation: "Tech Lead, Consultant",
    company: "Goin.org",
    startDate: "Apr 2015",
    endDate: "Mar 2018",
    summary: (
      <>
        Built web and mobile dev teams to create an Uber-like app for
        paramedical transport.
        <br />
        <br />
        Deployed the solution on-site for a large government agency in Florida,
        U.S, and handed the project over to an internal Engineering team.
      </>
    ),
    tags: ["Ride sharing", "Location Services", "B2B2C", "Enterprise"],
    imgUrl: "/logos/goin.svg",
    companyUrl: "https://goin.org",
    portfolio: [
      // {
      //   type: "image",
      //   src: "/portfolio/hl1.png",
      // },
      // {
      //   type: "image",
      //   src: "/portfolio/hl2.png",
      // },
      // {
      //   type: "image",
      //   src: "/portfolio/hl3.png",
      // },
      // {
      //   type: "image",
      //   src: "/portfolio/hl4.png",
      // },
      // {
      //   type: "video",
      //   src: "https://www.youtube.com/watch?v=m6_-iSVkEUE",
      // },
      // {
      //   type: "video",
      //   src: "https://www.youtube.com/watch?v=D3ST2Kgxufc",
      // },
    ],
  },
  {
    designation: "Co-founder, Product Engineering",
    company: "Roambee",
    startDate: "Jan 2010",
    endDate: "Dec 2014",
    summary: (
      <>
        Developed IOT hardware-software solutions for the logistics industry,
        with OEM vendors in China
        <br />
        <br />
        Built TCP communication servers for IOT devices, processed streams of
        sensor data, and built dashboards with location aware sensor data
      </>
    ),
    tags: ["IOT", "Sensors", "Logistics", "Supply Chain", "Enterprise"],
    imgUrl: "/logos/roambee.svg",
    companyUrl: "https://roambee.com",
    portfolio: [],
  },
]
