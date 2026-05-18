import { Client, GatewayIntentBits } from "discord.js";
import http from "http";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

const STAFF_ROLE_ID = "1378770600193032282";
const REPLY_DELAY_MS = 10000; // 10 seconds

const pendingReplies = new Map();

if (!DISCORD_TOKEN || !N8N_WEBHOOK_URL) {
  console.error("Missing DISCORD_TOKEN or N8N_WEBHOOK_URL");
  process.exit(1);
}

http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot running");
  })
  .listen(PORT, () => {
    console.log(`Keep-alive server running on port ${PORT}`);
  });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", () => {
  console.log(`Discord listener online as ${client.user.tag}`);
  console.log("Bot is ready and listening for messages...");
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) {
      console.log("Ignored bot message");
      return;
    }

    if (!message.content || !message.content.trim()) {
      console.log("Ignored empty message");
      return;
    }

    const channelId = message.channel.id;

    console.log("MESSAGE EVENT RECEIVED");
    console.log(`Message: ${message.content}`);
    console.log(`Message ID: ${message.id}`);
    console.log(`Channel ID: ${channelId}`);
    console.log(`Guild ID: ${message.guild?.id}`);

    // If staff/mod talks, cancel any pending AI reply and do not intervene.
    if (message.member?.roles?.cache?.has(STAFF_ROLE_ID)) {
      if (pendingReplies.has(channelId)) {
        clearTimeout(pendingReplies.get(channelId));
        pendingReplies.delete(channelId);
        console.log("Cancelled pending AI reply because staff responded");
      }

      console.log("Ignored staff message");
      return;
    }

    // If another user talks before the delay finishes, cancel the previous pending reply.
    if (pendingReplies.has(channelId)) {
      clearTimeout(pendingReplies.get(channelId));
      pendingReplies.delete(channelId);
      console.log("Cancelled pending AI reply because conversation continued");
    }

    // Wait 10 seconds. If nobody continues the chat, send this message to n8n.
    const timeout = setTimeout(async () => {
      try {
        console.log(`No new messages for 10s, sending to n8n: ${message.content}`);

        const response = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: message.content,
            message_id: message.id,
            channel_id: message.channel.id,
            guild_id: message.guild?.id,
            user_id: message.author.id,
            username: message.author.username,
            is_bot: message.author.bot,
          }),
        });

        console.log(`n8n response status: ${response.status}`);

        if (!response.ok) {
          console.error("n8n webhook failed:", response.status, await response.text());
        } else {
          console.log("Sent message to n8n");
        }
      } catch (error) {
        console.error("Failed to send to n8n:", error);
      } finally {
        pendingReplies.delete(channelId);
      }
    }, REPLY_DELAY_MS);

    pendingReplies.set(channelId, timeout);
  } catch (error) {
    console.error("Listener error:", error);
  }
});

client.login(DISCORD_TOKEN);
