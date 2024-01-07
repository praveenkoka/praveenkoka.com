import { NextRequest, NextResponse } from "next/server"
import { queryDocs } from "@/server/lib/vector"

export async function GET(req: NextRequest, res: NextResponse) {
  const question = "Tell me about Sequoia"

  const result = await queryDocs(question)
  return NextResponse.json(result)
}
