import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

// Load environment variables (.env)
dotenv.config();

const app = express();
const PORT = 3000;

// Multer in-memory file upload middleware
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limits
});

// JSON parsing middleware
app.use(express.json({ limit: "5mb" }));

// ----------------------------------------------------
// API 0: Check API configuration status
// ----------------------------------------------------
app.get("/api/status", (req, res) => {
  res.json({ hasApiKey: !!process.env.GEMINI_API_KEY });
});

// Initialize Google Gemini API
let ai: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const currentKey = process.env.GEMINI_API_KEY;
  if (!ai && currentKey) {
    ai = new GoogleGenAI({
      apiKey: currentKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  if (!ai) {
    throw new Error("Gemini API Client is not initialized. Please verify your GEMINI_API_KEY in Settings > Secrets.");
  }
  return ai;
}

// ----------------------------------------------------
// API 1: File Parsing (PDF, DOCX, TXT)
// ----------------------------------------------------
app.post("/api/parse-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "업로드된 파일이 없습니다." });
    }

    const { mimetype, originalname, buffer } = req.file;
    let extractedText = "";

    // 10MB size guard
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "파일 크기가 10MB를 초과할 수 없습니다." });
    }

    if (mimetype === "application/pdf" || originalname.endsWith(".pdf")) {
      try {
        const parser = new PDFParse({ data: buffer });
        try {
          const parsed = await parser.getText();
          extractedText = parsed.text || "";
        } finally {
          await parser.destroy().catch(() => {});
        }
      } catch (pdfErr: any) {
        console.error("PDF Parsing error:", pdfErr);
        return res.status(422).json({ 
          error: "PDF 파일 분석에 실패했습니다. 만약 스캔 이미지 형식인 경우 텍스트 직접 복사·붙여넣기를 이용해 주세요." 
        });
      }
    } else if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
      originalname.endsWith(".docx")
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value || "";
      } catch (docxErr: any) {
        console.error("DOCX Parsing error:", docxErr);
        return res.status(422).json({ 
          error: "DOCX(Word) 문서 분석에 실패했습니다. 텍스트 직접 복사·붙여넣기를 이용해 주세요." 
        });
      }
    } else if (mimetype.startsWith("text/") || originalname.endsWith(".txt") || originalname.endsWith(".md")) {
      extractedText = buffer.toString("utf8");
    } else {
      return res.status(400).json({ 
        error: "지원하지 않는 파일 형식입니다. PDF, DOCX, 또는 TXT 파일을 업로드하시거나 텍스트를 복사해서 직접 입력해 주세요." 
      });
    }

    // Clean up unnecessary whitespaces
    extractedText = extractedText.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
    extractedText = extractedText.replace(/\n{3,}/g, "\n\n").trim();

    if (!extractedText) {
      return res.status(400).json({ error: "파일에서 텍스트를 추출하지 못했습니다. 파일 내용이 비어있거나 보안 해제가 필요할 수 있습니다." });
    }

    return res.json({ fileName: originalname, text: extractedText });
  } catch (error: any) {
    console.error("File upload parse failure:", error);
    return res.status(500).json({ error: "서버 오류로 인해 파일을 파싱하지 못했습니다. 수동 입력을 권장합니다." });
  }
});

// ----------------------------------------------------
// API 2: STAR Structure Generation (1차 Gemini 호출)
// ----------------------------------------------------
app.post("/api/generate-star", async (req, res) => {
  try {
    const client = getGeminiClient();
    const { companyName, jobTitle, rawExperience, rawJobAd } = req.body;

    if (!rawExperience) {
      return res.status(400).json({ error: "분석할 나의 경험 이력 데이터가 부족합니다." });
    }

    const systemInstruction = 
      "당신은 구직자의 이력과 경험 카드를 채용담당자가 매료될 만한 STAR(Situation, Task, Action, Result) 논리 구조로 심폐소생해 주는 일류 자소서 마스터 컨설턴트입니다. " +
      "주어진 경험 정보와 기입한 기업/직무 정보, 채용공고를 심층 매칭하여 완벽한 역량 중심의 STAR 뼈대를 구축해 주세요.\n\n" +
      "가이드라인:\n" +
      "- S (Situation - 상황): 프로젝트 배경, 조직의 상황, 해결해야 했던 근본적 맥락과 어려움을 2~3문장 수준으로 구체적 서술.\n" +
      "- T (Task - 목표/역할): 당면한 핵심 과제와 본인의 구체적인 역할, 달성해야 했던 정량/정성적 타겟을 1~2문장으로 도출.\n" +
      "- A (Action - 행동): 문제 해결을 위해 취한 행동, 직무 전문성을 발휘한 과정, 구체적인 도구 및 솔루션 기입 내용을 3~4문장으로 구체적 서술. (역량이 가장 드러나야 하는 핵심 파트)\n" +
      "- R (Result - 성과): 행동의 결과로 나타난 정량적 성과(예: 성능 20% 향상, 비용 15% 감축)와 정성적 수확, 배운 점을 명확히 제시.\n\n" +
      "절대 빈약하거나 무의미한 플레이스홀더를 채우지 말고, 기입 내용에 없는 내용은 타당하고 현실성 있는 범위 내에서 직무 지식을 조화롭게 녹여 정교한 뼈대로 도정하세요. 응답은 순수 JSON 객체로 반환하세요.";

    const prompt = `
[지원 기업] ${companyName || "미정"}
[희망 직무] ${jobTitle || "미정"}

[내 경험 이력 데이터]
${rawExperience}

${rawJobAd ? `[채용공고 / 직무 기술서]\n${rawJobAd}` : ""}

위 데이터를 기반으로 역량 중심의 정교한 STAR 데이터를 만들어 주세요.
    `;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.3, // 일목요연하고 정합성 높은 구조화를 위해 온도 낮춤
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            situation: {
              type: Type.STRING,
              description: "S(Situation): 프로젝트의 구체적인 상황적 배경과 도전 과제",
            },
            task: {
              type: Type.STRING,
              description: "T(Task): 구체적 해결 목표 및 본인의 주 임무",
            },
            action: {
              type: Type.STRING,
              description: "A(Action): 문제를 극복하기 위해 취한 설계, 협업, 행동 등의 구체적인 역량 해결 과정",
            },
            result: {
              type: Type.STRING,
              description: "R(Result): 수치화된 정량적 성과, 프로젝트의 성공 지표 및 정성적 교훈",
            },
          },
          required: ["situation", "task", "action", "result"],
        }
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Gemini가 유효한 분석 응답을 생성하지 않았습니다.");
    }

    let cleanText = textOutput.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.substring(7);
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.substring(3);
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    cleanText = cleanText.trim();

    const starResult = JSON.parse(cleanText);
    return res.json(starResult);
  } catch (error: any) {
    console.error("STAR Generation Error:", error);
    return res.status(500).json({ 
      error: "AI로 STAR 역량 구조를 생성하는 도중 에러가 발생했습니다. 잠시 후 다시 시도해주세요.",
      details: error.message 
    });
  }
});

// ----------------------------------------------------
// API 3: Final Cover Letter Output (2차 Gemini 호출)
// ----------------------------------------------------
app.post("/api/generate-cover-letter", async (req, res) => {
  try {
    const client = getGeminiClient();
    const { companyName, jobTitle, starData, question, targetLength, tone } = req.body;

    if (!starData || !starData.situation || !starData.action) {
      return res.status(400).json({ error: "STAR 교정 데이터가 필요합니다." });
    }

    const goalLength = targetLength || 500;
    const minLength = Math.round(goalLength * 0.95);
    const maxLength = Math.round(goalLength * 1.05);

    const systemInstruction = 
      "당신은 구직자가 STAR 교정 카드로 잘 다듬은 뼈대를 바탕으로 인사담당자의 가슴을 뛰게 할 자기소개서 초안을 집필하는 1급 대필 전문가입니다.\n\n" +
      "작성 필수 요구사항:\n" +
      `1. 글자수 규격: 공백 포함 최소 ${minLength}자 ~ 최대 ${maxLength}자 사이를 칼같이 엄수해야 합니다. 너무 길거나 너무 짧으면 탈락입니다.\n` +
      "2. 구성 요소: 무미건조한 나열이 아닌, 설득력 있는 논리 흐름을 구현하세요. 반드시 매력적인 소제목을 처음에 포함해야 합니다.\n" +
      "3. STAR 통합: 제공된 S, T, A, R 각 요소를 한 편의 완벽한 유기적인 입체적 글로 결합하세요.\n" +
      "4. 문맥 준수: 요구된 문항에 초점을 맞추어, 갈등 해결이면 Action 부분에서 소통과 협업을 부각하고 기술 해결이면 전문성을 극대화하는 형태로 조율해야 합니다.\n" +
      "5. 가공 및 과장 지양: 주어지지 않은 타인의 성과를 함부로 훔치거나 말도 안 되는 매출액 급증 등의 소설은 쓰지 마십시오. 대신, 매끄럽고 설득력 있는 문장력을 극대화하세요.\n" +
      "6. 소제목의 예: '[상황을 극복한 어떤 혁신: 구체적인 주요 액션 성과 요약]'\n";

    const prompt = `
[지원 정보] 
- 지원 기업: ${companyName || "미정"}
- 희망 직무: ${jobTitle || "미정"}

[타겟 자소서 문항]
${question || "자유 양식으로 자기소개 및 강점을 제시하세요."}

[수정 보완된 STAR 뼈대]
- Situation (상황): ${starData.situation}
- Task (과제/목표): ${starData.task}
- Action (구체적 행동): ${starData.action}
- Result (정량/정성 성과): ${starData.result}

[스타일 옵션]
- 목표 자수: 공백 포함 ${goalLength}자 (허용 오차: ${minLength}~${maxLength}자)
- 어조 및 톤앤매너: ${tone || "신뢰감 있는 전문성"}

위 STAR 데이터의 맥락을 완벽히 흡수하여, 오직 텍스트 형태의 자기소개서 아웃풋을 작성해 주세요. 불필요한 서문, 인사말, 또는 '네, 자소서를 작성해 드리겠습니다'와 같은 부연설명은 절대 쓰지 마십시오. 오직 소제목을 포함한 자기소개서 한 편의 초안 텍스트 본문만 답변해 주세요.
    `;

    // Calculate approx max tokens dynamically to guide the model further, but rely mostly on the prompt constraint
    // Typical Korean characters take 2-3 bytes. 1 Korean character is roughly 1.5 tokens in Gemini.
    // 500 characters -> maxOutputTokens ~800 is plenty but safe.
    const maxTokensGoal = Math.max(800, goalLength * 2);

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7, // 창의적이고 자연스러운 비유와 스토리텔링을 위해 적정 온도 유지
        maxOutputTokens: maxTokensGoal,
      }
    });

    const coverLetter = response.text;
    if (!coverLetter) {
      throw new Error("Gemini가 완성된 자기소개서 본문을 생성하지 못했습니다.");
    }

    return res.json({ coverLetter: coverLetter.trim() });
  } catch (error: any) {
    console.error("Cover Letter Generation Error:", error);
    return res.status(500).json({ 
      error: "AI로 자기소개서 초안을 도출하는 도중 에러가 발생했습니다.",
      details: error.message 
    });
  }
});


// ----------------------------------------------------
// Express + Vite Dev Integration Setup
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Standard Vite Dev server HTML rendering
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(
          path.resolve(process.cwd(), "index.html"),
          "utf-8"
        );
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 자소서 치트키 Server running on port ${PORT}`);
    if (process.env.NODE_ENV !== "production") {
      console.log(`🎯 Dev Server preview active on http://0.0.0.0:${PORT}`);
    }
  });
}

startServer();
