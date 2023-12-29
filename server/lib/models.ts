import { ChatOpenAI } from "langchain/chat_models/openai"

export const openAi = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-3.5-turbo",
})
