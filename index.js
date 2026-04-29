import { Client, GatewayIntentBits } from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!DISCORD_TOKEN || !N8N_WEBHOOK_URL) {
  console.error("Missing DISCORD_TOKEN or N8N_WEBHOOK_URL");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Discord listener online as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    // Ignore bot messages
    if (message.author.bot) return;

    // Ignore empty messages
    if (!message.content || !message.content.trim()) return;

    // Send message to n8n webhook
    await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: message.content,
        channel_id: message.channel.id,
        guild_id: message.guild?.id,
        user_id: message.author.id,
        username: message.author.username,
        is_bot: message.author.bot,
      }),
    });

  } catch (error) {
    console.error("Failed to send message to n8n:", error);
  }
});

client.login(DISCORD_TOKEN);
