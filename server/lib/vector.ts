import { PrismaVectorStore } from "langchain/vectorstores/prisma";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { HuggingFaceInferenceEmbeddings } from "langchain/embeddings/hf";
import { PrismaClient, Prisma, Document } from "@prisma/client";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import path from "path";
import fs from "fs";
import { CharacterTextSplitter } from "langchain/text_splitter";
import { LLMChain } from "langchain/chains";
import { RetrievalQAChain } from "langchain/chains";
import {
  RunnableSequence,
  RunnablePassthrough,
} from "langchain/schema/runnable";
import { StringOutputParser } from "langchain/schema/output_parser";
import { openAi, huggingFace } from "@/server/lib/models";

import { prisma } from "@/server/db";

const vectorStore = PrismaVectorStore.withModel<Document>(prisma).create(
  new HuggingFaceInferenceEmbeddings(),
  {
    prisma: Prisma,
    tableName: "Document",
    vectorColumnName: "vector",
    columns: {
      id: PrismaVectorStore.IdColumn,
      content: PrismaVectorStore.ContentColumn,
    },
  }
);

const processDoc = async (filePath: string) => {
  console.log(filePath);
  const loader = new PDFLoader(filePath, {
    splitPages: false,
  });

  const docs = await loader.load();
  let text = docs.map((d) => d.pageContent).join(" ");

  console.log(text.length);

  const splitter = new CharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 20,
  });
  const output = await splitter.createDocuments([text]);
  console.log(output);

  const texts = output.map((d) => d.pageContent);

  await vectorStore.addModels(
    await prisma.$transaction(
      texts.map((content) => prisma.document.create({ data: { content } }))
    )
  );
};

export const loadDocs = async () => {
  const files = fs.readdirSync("docs");

  for (const fileName of files) {
    console.log(fileName);
    try {
      await processDoc(`docs/${fileName}`);
    } catch (e) {
      console.log("Error ", e);
    }
  }

  //   fs.readdir("docs", function (err, files) {
  //     //handling error
  //     if (err) {
  //       return console.log("Unable to scan directory: " + err);
  //     }
  //     //listing all files using forEach
  //     files.forEach(function (file) {
  //       // Do whatever you want to do with the file
  //       console.log(file);
  //     });
  //   });
  //   console.log({ directoryPath });
  return;
};

export const searchDocs = async (searchText: string) => {
  // Use the `withModel` method to get proper type hints for `metadata` field:

  // const texts = ["Hello world", "Bye bye", "What's this?"];

  const result = await vectorStore.similaritySearch(searchText, 1);

  return result;

  //   // Use the default filter a.k.a {"content": "default"}
  //   const resultTwo = await vectorStore.similaritySearch("Hello world", 1);
  //   console.log(resultTwo);

  //   // Override the local filter
  //   const resultThree = await vectorStore.similaritySearchWithScore(
  //     "Hello world",
  //     1,
  //     { content: { equals: "different_content" } }
  //   );
  //   console.log(resultThree);
};

export const queryDocs = async (searchText: string) => {
  console.log("Search text", searchText);

  const retriever = vectorStore.asRetriever();

  const similarDocs = await vectorStore.similaritySearch(searchText, 2);
  console.log(similarDocs);

  const context = similarDocs
    .map((doc) => doc.pageContent)
    .join(" \n ")
    .replace(/(\r\n|\n|\r)/gm, " ");

  const prompt =
    PromptTemplate.fromTemplate(`Answer the question based only on the following context:
  {context}

  Question: {question}
  `);

  const formattedPrompt = await prompt.format({
    context,
    question: searchText,
  });

  console.log(formattedPrompt);

  const chain = new LLMChain({
    llm: huggingFace,
    // llm: openAi,
    prompt,
    verbose: true,
  });

  try {
    const result = await chain.call({
      context,
      question: searchText,
    });
    return { result };
  } catch (error) {
    return {
      error,
    };
  }

  //   const serializeDocs = (docs: Document[]) =>
  //     docs.map((doc) => doc.content).join("\n");

  //   const chain = RetrievalQAChain.fromLLM(openAi, retriever);
  //   const result = await chain.call(
  //     {
  //       query: searchText,
  //     },
  //     {}
  //   );
  //   return result;

  //   const chain = RunnableSequence.from([
  //     {
  //       context: retriever.pipe(serializeDocs),
  //       question: new RunnablePassthrough(),
  //     },
  //     prompt,
  //     model,
  //     new StringOutputParser(),
  //   ]);

  //   const result = await chain.invoke("What is the powerhouse of the cell?");

  //   console.log(result);
};
