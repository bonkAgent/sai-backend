import { Keypair } from "@solana/web3.js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText, CoreMessage, ToolCallPart, ToolResultPart } from "ai";
import { User } from '@privy-io/server-auth';
import "dotenv/config";

import {addActivity, setToolStatus} from "./mongoService";
import { TOOL_HANDLERS, toUsd } from "../promtsAI/tool-handlers";
import { SYSTEM_PROMPT } from "../promtsAI/systemPrompts";
import { manualTools } from "../promtsAI/manual-tools";


export async function chatWithSolanaAgentStream(
    prompt: string,
    keypair: Keypair,
    user: User,
    history: any[] = [],
    friends: any[] = [],
    _tokens: any[] = [],
    priorityFee: number = 0,
    onTool?: (payload: any) => void
) {
  if (!process.env.RPC_URL || !process.env.OPENAI_API_KEY) {
    throw new Error("RPC_URL and OPENAI_API_KEY must be set in .env");
  }
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const walletAddress = keypair.publicKey.toBase58();

  const messages: CoreMessage[] = [];
  for (const friend of friends) {
    messages.push({ role: "system", content: `User's friend name: ${friend.name}, address: ${friend.walletAddress}` });
  }
  messages.push({ role: "system", content: `Now will be history og user's requests` });
  const cleanHistory = history.filter(
      (msg) =>
          msg?.text &&
          !msg.text.includes("Error: Internal error") &&
          !msg.text.includes("Error:") &&
          !msg.text.includes("TypeError:") &&
          msg.text.trim() &&
          msg.text !== "Internal error" &&
          (msg.sender === "user" || msg.sender === "assistant")
  );
  for (const msg of cleanHistory) messages.push({ role: msg.sender, content: msg.text });

  messages.push({
    role: "system",
    content: `(Internal note: User's wallet address is ${walletAddress}. I will use it for all relevant actions without asking again.)`,
  });
  messages.push({ role: "user", content: prompt });

  const statusBuffer: Array<{ toolName: string; payload: any }> = [];
  const toolsWithContext = Object.fromEntries(
      Object.entries(manualTools).map(([key, tool]) => [
        key,
        {
          ...tool,
          execute: async (args: any) => {
            console.log(key)
            const handler = TOOL_HANDLERS[key];
            
            if (!handler) return { error: `Tool ${key} not found.` };

            try {
              const raw = await handler({ ...args, priorityFee }, keypair, user);

              const resAi = raw?.resForAi ?? { ok: true };
              const resStatus = raw?.resForStatus;

              if (resStatus && typeof onTool === "function") {
                onTool({ toolName: key, ...resStatus });
              }

              return resAi;
            } catch (e: any) {
              const err = { error: `Tool execution failed: ${e?.message || String(e)}` };
              if (typeof onTool === "function") onTool({ toolName: key, ...err });
              return err;
            }
          }
        },
      ])
  );
  
  const result = streamText({
    model: openai("gpt-4.1-mini"),
    system: SYSTEM_PROMPT,
    tools: toolsWithContext,
    messages,
    temperature: 1,
    toolChoice: "auto",
    maxSteps: 6,
  });

  const flushStatuses = async (finalText: string) => {
    if (!statusBuffer.length) return;
    for (const { toolName, payload } of statusBuffer) {
      try {
        await setToolStatus(user, toolName, finalText || "", payload);
      } catch (err) {}
    }
  };

  return Object.assign(result, { flushStatuses });
}