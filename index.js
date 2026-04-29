import { Client, GatewayIntentBits } from "discord.js";
import http from "http";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot running");
}).listen(PORT, () => console.log(`Keep-alive server running on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

client.once("clientReady", () => {
  console.log(`Discord listener online as ${client.user.tag}`);
  console.log("Bot is ready and listening for messages...");
});

client.on("messageCreate", async (message) => {
  console.log("MESSAGE EVENT RECEIVED");

  if (message.author.bot) {
    console.log("Ignored bot message");
    return;
  }

  console.log(`Message: ${message.content}`);
  console.log(`Channel ID: ${message.channel.id}`);
  console.log(`Guild ID: ${message.guild?.id}`);

  try {
    await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: message.content,
        channel_id: message.channel.id,
        guild_id: message.guild?.id,
        user_id: message.author.id,
        username: message.author.username,
        is_bot: message.author.bot
      }),
    });

    console.log("Sent message to n8n");
  } catch (error) {
    console.error("Failed to send to n8n:", error);
  }
});

client.login(DISCORD_TOKEN);