import fs from "fs"
import path from "path"
import { Document, Prisma } from "@prisma/client"
import { PDFLoader } from "langchain/document_loaders/fs/pdf"
import { TextLoader } from "langchain/document_loaders/fs/text"
import { OpenAIEmbeddings } from "langchain/embeddings/openai"
import { TokenTextSplitter } from "langchain/text_splitter"
import { PrismaVectorStore } from "langchain/vectorstores/prisma"

import { prisma } from "../server/db"

const urls = [
  //   "https://patents.justia.com/inventor/praveen-koka",
  //   "https://yourstory.com/2015/07/greenroom",
  //   "https://javascript-conference.com/speaker/praveen-koka/",
  //   "https://theorg.com/org/roq-technology/org-chart/praveen-koka",
  //   "https://lounge47.in/event/investor-series-2016-lounge47-greenroomfounders-lakshmi-balasubramanian-praveen-koka/",
  //   "https://tracxn.com/d/companies/greenroom/__HxY-Ys5177fbyLrZ0UrkcnH3c4c329EUsdWsgKQWdQc/founders-and-board-of-directors",
  //   "https://www.praveenkoka.com",
]

const vectorStore = PrismaVectorStore.withModel<Document>(prisma).create(
  new OpenAIEmbeddings(),
  {
    prisma: Prisma,
    tableName: "Document",
    vectorColumnName: "vector",
    columns: {
      id: PrismaVectorStore.IdColumn,
      content: PrismaVectorStore.ContentColumn,
    },
  }
)

const loadDocs = async () => {
  const dataDir = path.join(process.cwd(), "data")

  let allDocs: Record<string, any>[] = []

  console.log(dataDir)
  const textFiles = fs
    .readdirSync(dataDir)
    .filter((file) => file.endsWith(".txt"))

  for (const t of textFiles) {
    const filePath = path.join(process.cwd(), `data/${t}`)
    const textLoader = new TextLoader(filePath)
    const docs = await textLoader.load()
    allDocs = [...allDocs, ...docs]
  }

  const pdfFiles = fs
    .readdirSync(dataDir)
    .filter((file) => file.endsWith(".pdf"))

  console.log("Pdf", pdfFiles)

  for (const t of pdfFiles) {
    const filePath = path.join(process.cwd(), `data/${t}`)
    const pdfLoader = new PDFLoader(filePath)
    const docs = await pdfLoader.load()
    allDocs = [...allDocs, ...docs]
  }

  //   for (const u of urls) {
  //     const webLoader = new CheerioWebBaseLoader(u)
  //     const docs = await webLoader.load()
  //     allDocs = [...allDocs, ...docs]
  //   }

  let text = allDocs.map((d) => d.pageContent).join(" ")

  console.log("Text length", text.length)

  const splitter = new TokenTextSplitter({
    chunkSize: 300,
    chunkOverlap: 30,
  })
  const output = await splitter.createDocuments([text])
  console.log(output)

  const texts = output.map((d) => d.pageContent)

  await vectorStore.addModels(
    await prisma.$transaction(
      texts.map((content) => prisma.document.create({ data: { content } }))
    )
  )
}

loadDocs()
