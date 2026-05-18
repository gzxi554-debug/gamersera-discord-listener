import { Client, GatewayIntentBits } from "discord.js";
import http from "http";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

const STAFF_ROLE_ID = "1378770600193032282";

const USER_REPLY_DELAY_MS = 30000; // normal users: 30 seconds
const STAFF_REPLY_DELAY_MS = 3000; // staff normal messages: 3 seconds
const INSTANT_REPLY_DELAY_MS = 0; // strong tournament/help messages: instant
const ACTIVE_CHAT_WINDOW_MS = 30000; // detect users chatting within 30 seconds

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

function getIntentFlags(content) {
  const text = content.toLowerCase();

  const strongHelpKeywords = [
    "how do i join",
    "how to join",
    "how can i join",
    "where do i register",
    "how do i register",
    "how to register",
    "registration",
    "register for",
    "sign up for",
    "signup for",
    "check in",
    "check-in",
    "checkin",
    "ladies only",
    "women only",
    "female only",
  ];

  const normalHelpKeywords = [
    "tournament",
    "tournaments",
    "tourney",
    "tourneys",
    "prize",
    "prizes",
    "rules",
    "format",
    "schedule",
    "dates",
    "date",
    "giveaway",
    "giveaways",
    "fifa",
    "fc26",
    "fortnite",
    "rocket league",
    "valorant",
    "warzone",
    "scrim",
    "custom",
  ];

  const strongHelpIntent = strongHelpKeywords.some((keyword) =>
    text.includes(keyword)
  );

  const normalHelpIntent = normalHelpKeywords.some((keyword) =>
    text.includes(keyword)
  );

  return {
    strongHelpIntent,
    normalHelpIntent,
    instantReply: strongHelpIntent || normalHelpIntent,
  };
}

function getRecentHumanMessages(message) {
  return message.channel.messages.cache.filter((m) =>
    !m.author.bot &&
    m.author.id !== message.author.id &&
    Date.now() - m.createdTimestamp < ACTIVE_CHAT_WINDOW_MS
  );
}

async function sendToN8n(message, meta) {
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
      is_staff: Boolean(meta.isStaff),
      is_replying_to_someone: meta.isReplyingToSomeone,
      instant_reply: meta.instantReply,
      strong_help_intent: meta.strongHelpIntent,
      normal_help_intent: meta.normalHelpIntent,
      active_conversation: meta.activeConversation,
    }),
  });

  console.log(`n8n response status: ${response.status}`);

  if (!response.ok) {
    console.error("n8n webhook failed:", response.status, await response.text());
  } else {
    console.log("Sent message to n8n");
  }
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

    if (!message.guild) {
      console.log("Ignored DM message");
      return;
    }

    const channelId = message.channel.id;

    const member = await message.guild.members.fetch(message.author.id);
    const isStaff = member.roles.cache.has(STAFF_ROLE_ID);
    const isReplyingToSomeone = Boolean(message.reference?.messageId);

    const {
      strongHelpIntent,
      normalHelpIntent,
      instantReply,
    } = getIntentFlags(message.content);

    const recentHumanMessages = getRecentHumanMessages(message);
    const activeConversation = recentHumanMessages.size >= 1;

    console.log("MESSAGE EVENT RECEIVED");
    console.log(`Message: ${message.content}`);
    console.log(`Message ID: ${message.id}`);
    console.log(`Channel ID: ${channelId}`);
    console.log(`Guild ID: ${message.guild?.id}`);
    console.log(`Is Staff: ${Boolean(isStaff)}`);
    console.log(`Is Replying To Someone: ${isReplyingToSomeone}`);
    console.log(`Strong Help Intent: ${strongHelpIntent}`);
    console.log(`Normal Help Intent: ${normalHelpIntent}`);
    console.log(`Instant Reply: ${instantReply}`);
    console.log(`Active Conversation: ${activeConversation}`);

    if (isStaff && isReplyingToSomeone) {
      if (pendingReplies.has(channelId)) {
        clearTimeout(pendingReplies.get(channelId));
        pendingReplies.delete(channelId);
        console.log("Cancelled pending AI reply because staff replied to a user");
      }

      console.log("Ignored staff reply");
      return;
    }

    if (activeConversation && !strongHelpIntent && !isStaff) {
      if (pendingReplies.has(channelId)) {
        clearTimeout(pendingReplies.get(channelId));
        pendingReplies.delete(channelId);
        console.log("Cancelled pending AI reply because users are actively chatting");
      }

      console.log("Ignored because users are actively chatting");
      return;
    }

    if (pendingReplies.has(channelId)) {
      clearTimeout(pendingReplies.get(channelId));
      pendingReplies.delete(channelId);
      console.log("Cancelled pending AI reply because conversation continued");
    }

    const delay = strongHelpIntent
      ? INSTANT_REPLY_DELAY_MS
      : normalHelpIntent && !activeConversation
        ? INSTANT_REPLY_DELAY_MS
        : isStaff
          ? STAFF_REPLY_DELAY_MS
          : USER_REPLY_DELAY_MS;

    const timeout = setTimeout(async () => {
      try {
        console.log(
          delay === 0
            ? `Instant allowed message, sending to n8n: ${message.content}`
            : `No new messages for ${delay / 1000}s, sending to n8n: ${message.content}`
        );

        await sendToN8n(message, {
          isStaff,
          isReplyingToSomeone,
          instantReply: delay === 0,
          strongHelpIntent,
          normalHelpIntent,
          activeConversation,
        });
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
