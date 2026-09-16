import fs from "fs";

const card = JSON.parse(fs.readFileSync("characters/character.json", "utf8"));
const t = fs.readFileSync("characters/.generated-character.txt", "utf8");
const out = "vendor/utsuwa/src/lib/alice-yue/persona.ts";
fs.mkdirSync("vendor/utsuwa/src/lib/alice-yue", { recursive: true });
const body = `export const YUE_NAME = ${JSON.stringify(card.name)};
export const YUE_USER_NAME = ${JSON.stringify(card.user_name)};
export const LLAMA_BASE_URL = "http://127.0.0.1:8081/v1";
export const LLAMA_MODEL_ID = "eclipse";
export const YUE_SYSTEM_PROMPT = ${JSON.stringify(t)};
`;
fs.writeFileSync(out, body);
console.log("wrote", out);
