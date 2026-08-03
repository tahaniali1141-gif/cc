// ============================================================
//  دالة موحّدة تقبل 3 مزوّدين: Anthropic / OpenAI / Gemini
//  تكتشف المزوّد تلقائياً من بداية المفتاح — بدون أي تعديل يدوي.
//
//  في إعدادات Vercel، أضف متغيّراً واحداً فقط باسم:  AI_API_KEY
//  والصق فيه مفتاح أي مزوّد من الثلاثة. .
//
//    sk-ant-...  ← Anthropic
//    AIza...     ← Gemini
//    غير ذلك     ← OpenAI (sk-... / sk-proj-...)
// ============================================================

// الموديل الافتراضي لكل مزوّد (بدّلها إذا حبيت جودة أعلى)
const MODELS = {
  anthropic: "claude-haiku-4-5-20251001", // أو claude-sonnet-5
  openai: "gpt-4o-mini",                  // أو gpt-4o
  gemini: "gemini-1.5-flash",             // أو gemini-1.5-pro
};

// يحدد المزوّد من شكل المفتاح
function detectProvider(key) {
  if (key.startsWith("AQ.")) return "gemini";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "استخدم POST فقط" });
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "المفتاح غير موجود. أضف AI_API_KEY في إعدادات Vercel.",
    });
  }

  const { messages, system } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "لا توجد رسائل في الطلب" });
  }

  const provider = detectProvider(apiKey);
  const sys = system || "أنت مساعد ذكي ودود.";

  try {
    let reply = "";

    // ---------- Anthropic ----------
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODELS.anthropic,
          max_tokens: 1024,
          system: sys,
          messages: messages,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || "خطأ Anthropic");
      reply = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }

    // ---------- OpenAI ----------
    else if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODELS.openai,
          max_tokens: 1024,
          messages: [{ role: "system", content: sys }, ...messages],
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || "خطأ OpenAI");
      reply = data.choices?.[0]?.message?.content || "";
    }

    // ---------- Gemini ----------
    else if (provider === "gemini") {
      // Gemini يستخدم "contents" و "role: user/model" وتعليمات النظام منفصلة
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${MODELS.gemini}:generateContent?key=${apiKey}`;

      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: contents,
          generationConfig: { maxOutputTokens: 1024 },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || "خطأ Gemini");
      reply =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
    }

    return res.status(200).json({ reply: reply.trim(), provider });
  } catch (err) {
    return res.status(500).json({ error: err.message || "خطأ غير متوقع" });
  }
}
