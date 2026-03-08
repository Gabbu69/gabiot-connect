import { GoogleGenAI, ThinkingLevel, GenerateContentResponse, GenerateContentParameters } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export enum GeminiModel {
  PRO = "gemini-3.1-pro-preview",
  FLASH_LITE = "gemini-3.1-flash-lite-preview",
  FLASH = "gemini-3-flash-preview",
}

export interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export interface GeminiOptions {
  model?: GeminiModel;
  systemInstruction?: string;
  thinkingLevel?: ThinkingLevel;
}

export class GeminiError extends Error {
  constructor(public message: string, public originalError?: any) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function generateContent(
  prompt: string,
  options: GeminiOptions = {}
): Promise<string> {
  const {
    model = GeminiModel.FLASH_LITE,
    systemInstruction,
    thinkingLevel,
  } = options;

  try {
    const config: any = {
      systemInstruction,
    };

    if (thinkingLevel !== undefined) {
      config.thinkingConfig = { thinkingLevel };
    }

    const params: GenerateContentParameters = {
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config,
    };

    const response: GenerateContentResponse = await ai.models.generateContent(params);
    
    if (!response.text) {
      throw new GeminiError("Empty response from Gemini API");
    }

    return response.text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errorMessage = error?.message || "An unexpected error occurred while calling the Gemini API.";
    throw new GeminiError(errorMessage, error);
  }
}

export function createChat(options: GeminiOptions = {}) {
  const {
    model = GeminiModel.PRO,
    systemInstruction,
    thinkingLevel,
  } = options;

  const config: any = {
    systemInstruction,
  };

  if (thinkingLevel !== undefined) {
    config.thinkingConfig = { thinkingLevel };
  }

  try {
    return ai.chats.create({
      model,
      config,
    });
  } catch (error: any) {
    console.error("Failed to create chat:", error);
    throw new GeminiError("Failed to initialize chat session.", error);
  }
}
