import { analyzeWithGemini } from "@/lib/ai/gemini";
import { handleTextEndpoint } from "@/lib/server/text-endpoint";

export const maxDuration = 45;

export async function POST(request: Request) {
  return handleTextEndpoint(request, "analyze", analyzeWithGemini);
}