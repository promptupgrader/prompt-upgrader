import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  
  const { prompt } = req.body;
  
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  
  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: `Upgrade this prompt: ${prompt}` }]
  });
  
  res.json({ result: message.content[0].text });
}
