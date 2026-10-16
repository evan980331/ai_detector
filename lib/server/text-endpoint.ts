import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { textInputSchema } from "../analysis/contracts";
import { checkRateLimit, clientAddress } from "../security/rate-limit";

type Operation = "analyze" | "revise";

export async function handleTextEndpoint<T>(
  request: Request,
  operation: Operation,
  processText: (text: string) => Promise<T>,
) {
  const limit = checkRateLimit(`${operation}:${clientAddress(request)}`);
  if (!limit.allowed) {
    return NextResponse.json({ error: "請求次數過多，請稍後再試。" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 50_000) return NextResponse.json({ error: "請求內容過大。" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請提供有效的 JSON 內容。" }, { status: 400 });
  }

  const input = textInputSchema.safeParse(body);
  if (!input.success) {
    const tooLong = input.error.issues.some((issue) => issue.code === "too_big");
    return NextResponse.json({ error: tooLong ? "文字超過 12,000 字上限。" : "請輸入至少 80 字的文章內容。" }, { status: tooLong ? 413 : 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "尚未設定 Gemini API key，請在本機 .env.local 或 Vercel 伺服器環境變數中設定。" }, { status: 503 });
  }

  try {
    return NextResponse.json(await processText(input.data.text));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "模型回傳格式無法驗證，請稍後重試。" }, { status: 502 });
    const service = operation === "analyze" ? "分析" : "編輯";
    return NextResponse.json({ error: `${service}服務暫時無法使用，請稍後重試。文章內容不會寫入錯誤紀錄。` }, { status: 502 });
  }
}