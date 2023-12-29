import { ChatOpenAI } from "langchain/chat_models/openai"
import { HuggingFaceInference } from "langchain/llms/hf"

export const openAi = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
})

export const huggingFace = new HuggingFaceInference({
  model: "tiiuae/falcon-7b-instruct",
  apiKey: process.env.HUGGINGFACE_API_KEY,
  maxTokens: 5000,
  maxRetries: 5,
})
