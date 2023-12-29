import { NextRequest, NextResponse } from "next/server"
import { queryDocs } from "@/server/lib/vector"

export async function GET(req: NextRequest, res: NextResponse) {
  const question = "Are you an angel investor?"

  const result = await queryDocs(question)
  return NextResponse.json(result)
}
