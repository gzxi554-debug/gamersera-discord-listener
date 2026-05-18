import { Client, GatewayIntentBits } from "discord.js";
import http from "http";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

const STAFF_ROLE_ID = "1378770600193032282";
const USER_REPLY_DELAY_MS = 10000; // normal users: 10 seconds
const STAFF_REPLY_DELAY_MS = 3000; // staff normal messages: 3 seconds
const INSTANT_REPLY_DELAY_MS = 0; // tournament/help messages: instant

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

function shouldReplyInstantly(content) {
  const text = content.toLowerCase();

  const instantReplyKeywords = [
    "tournament",
    "tournaments",
    "tourney",
    "tourneys",
    "register",
    "registration",
    "sign up",
    "signup",
    "join",
    "how to join",
    "check in",
    "check-in",
    "checkin",
    "prize",
    "prizes",
    "rules",
    "format",
    "schedule",
    "time",
    "dates",
    "date",
    "giveaway",
    "giveaways",
    "ladies",
    "ladies only",
    "women",
    "female",
    "fc",
    "fifa",
    "fc26",
    "fortnite",
    "rocket league",
    "rl",
    "valorant",
    "warzone",
    "scrim",
    "custom",
    "support",
    "help",
    "xp",
  ];

  return instantReplyKeywords.some((keyword) => text.includes(keyword));
}

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
    const isStaff = message.member?.roles?.cache?.has(STAFF_ROLE_ID);
    const isReplyingToSomeone = Boolean(message.reference?.messageId);
    const instantReply = shouldReplyInstantly(message.content);

    console.log("MESSAGE EVENT RECEIVED");
    console.log(`Message: ${message.content}`);
    console.log(`Message ID: ${message.id}`);
    console.log(`Channel ID: ${channelId}`);
    console.log(`Guild ID: ${message.guild?.id}`);
    console.log(`Is Staff: ${Boolean(isStaff)}`);
    console.log(`Is Replying To Someone: ${isReplyingToSomeone}`);
    console.log(`Instant Reply: ${instantReply}`);

    // If staff replies directly to another user/message, cancel AI and stay quiet.
    if (isStaff && isReplyingToSomeone) {
      if (pendingReplies.has(channelId)) {
        clearTimeout(pendingReplies.get(channelId));
        pendingReplies.delete(channelId);
        console.log("Cancelled pending AI reply because staff replied to a user");
      }

      console.log("Ignored staff reply");
      return;
    }

    // If another message appears before the delay finishes, cancel the previous pending reply.
    if (pendingReplies.has(channelId)) {
      clearTimeout(pendingReplies.get(channelId));
      pendingReplies.delete(channelId);
      console.log("Cancelled pending AI reply because conversation continued");
    }

    // Tournament/help messages reply instantly.
    // Staff normal messages reply in 3 seconds.
    // Normal casual messages reply in 10 seconds if nobody continues chatting.
    const delay = instantReply
      ? INSTANT_REPLY_DELAY_MS
      : isStaff
        ? STAFF_REPLY_DELAY_MS
        : USER_REPLY_DELAY_MS;

    const timeout = setTimeout(async () => {
      try {
        console.log(
          delay === 0
            ? `Instant help/tournament message, sending to n8n: ${message.content}`
            : `No new messages for ${delay / 1000}s, sending to n8n: ${message.content}`
        );

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
            is_staff: Boolean(isStaff),
            is_replying_to_someone: isReplyingToSomeone,
            instant_reply: instantReply,
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
    }, delay);

    pendingReplies.set(channelId, timeout);
  } catch (error) {
    console.error("Listener error:", error);
  }
});

client.login(DISCORD_TOKEN);
