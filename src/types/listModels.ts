// scripts/listModels.ts
import OpenAI from "openai";
import "dotenv/config";

async function printAvailableModels() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.models.list();
  console.log("Доступные модели:", res.data.map((m) => m.id));
}

printAvailableModels().catch((err) => {
  console.error("Не удалось получить список моделей:", err);
  process.exit(1);
});