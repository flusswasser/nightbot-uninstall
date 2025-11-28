import express from 'express';
import { Client, ChannelType, EmbedBuilder, ActivityType } from 'discord.js';
import axios from 'axios';

interface YouTubeSubscription {
  channelId: string;
  channelName: string;
  discordChannelId: string;
  lastCheckTime: number;
}

const app = express();
app.use(express.json());

// Initialize Discord client
let client: Client | null = null;
let subscriptions: YouTubeSubscription[] = [];

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHECK_INTERVAL = 300000;

// Setup page HTML
const setupHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>YouTube Discord Bot - Setup</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a1a; color: #fff; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 32px; margin-bottom: 30px; color: #FF0000; }
    .step { background: #2a2a2a; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #FF0000; }
    .step h2 { font-size: 18px; margin-bottom: 10px; }
    .step p { font-size: 14px; line-height: 1.6; margin-bottom: 10px; }
    .code { background: #1a1a1a; padding: 10px; border-radius: 4px; font-family: monospace; color: #4a9eff; margin: 10px 0; }
    .status { background: #3a5a3a; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #5a9a5a; }
    .status.error { background: #5a3a3a; border-color: #9a5a5a; }
    .status.success { background: #3a5a3a; border-color: #5a9a5a; }
    .alert { background: #4a3a2a; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #FF8800; }
    a { color: #4a9eff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 YouTube Discord Bot</h1>
    
    <div class="status error">
      <strong>⚠️ Setup Required:</strong> Add your credentials to continue
    </div>

    <div class="step">
      <h2>Step 1: Get Discord Bot Token</h2>
      <p>1. Go to <a href="https://discord.com/developers/applications" target="_blank">Discord Developer Portal</a></p>
      <p>2. Click "New Application"</p>
      <p>3. Go to "Bot" section and click "Add Bot"</p>
      <p>4. Under TOKEN, click "Copy"</p>
      <p>5. In Replit, go to Tools → Secrets and add:</p>
      <div class="code">DISCORD_TOKEN = your_token_here</div>
    </div>

    <div class="step">
      <h2>Step 2: Get YouTube API Key</h2>
      <p>1. Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></p>
      <p>2. Create a new project</p>
      <p>3. Enable YouTube Data API v3</p>
      <p>4. Go to Credentials and create an API key</p>
      <p>5. In Replit Secrets, add:</p>
      <div class="code">YOUTUBE_API_KEY = your_api_key_here</div>
    </div>

    <div class="step">
      <h2>Step 3: Invite Bot to Discord</h2>
      <p>1. In Developer Portal, go to OAuth2 → URL Generator</p>
      <p>2. Select scopes: <strong>bot</strong></p>
      <p>3. Select permissions: <strong>Send Messages, Embed Links, Read Message History</strong></p>
      <p>4. Copy the generated URL and open it to invite the bot</p>
    </div>

    <div class="alert">
      <strong>💡 Pro Tip:</strong> After adding secrets to Replit, the bot will automatically restart and connect!
    </div>

    <div class="step">
      <h2>Bot Commands</h2>
      <p><strong>!subscribe &lt;YOUTUBE_CHANNEL_ID&gt;</strong> - Subscribe to new uploads</p>
      <p><strong>!subscriptions</strong> - View active subscriptions</p>
      <p><strong>!unsubscribe &lt;YOUTUBE_CHANNEL_ID&gt;</strong> - Remove subscription</p>
    </div>

    <div class="step">
      <h2>Finding YouTube Channel IDs</h2>
      <p>1. Go to a YouTube channel</p>
      <p>2. Click "About"</p>
      <p>3. URL format: youtube.com/channel/<strong>CHANNEL_ID</strong></p>
      <p>Example: <strong>UCBJycsmduvf2EL7D87IRLgA</strong></p>
    </div>

    <p style="text-align: center; margin-top: 40px; color: #888; font-size: 12px;">
      Checking for credentials... (auto-refresh in 10s)
    </p>
  </div>

  <script>
    setInterval(() => location.reload(), 10000);
  </script>
</body>
</html>
`;

// YouTube API functions
async function getLatestVideo(channelId: string) {
  try {
    const response = await axios.get(
      'https://www.googleapis.com/youtube/v3/search',
      {
        params: {
          part: 'snippet',
          channelId: channelId,
          order: 'date',
          maxResults: 1,
          key: YOUTUBE_API_KEY,
        },
      }
    );

    if (response.data.items && response.data.items.length > 0) {
      const video = response.data.items[0];
      return {
        videoId: video.id.videoId,
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: new Date(video.snippet.publishedAt).getTime(),
        thumbnail: video.snippet.thumbnails.high?.url,
        channelTitle: video.snippet.channelTitle,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching videos for channel ${channelId}:`, error);
    return null;
  }
}

async function notifyNewVideo(
  discordChannelId: string,
  video: Awaited<ReturnType<typeof getLatestVideo>>
) {
  try {
    if (!video || !client) return;

    const channel = await client.channels.fetch(discordChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.error(`Invalid Discord channel: ${discordChannelId}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`New Video from ${video.channelTitle}`)
      .setDescription(video.title)
      .setURL(`https://www.youtube.com/watch?v=${video.videoId}`)
      .setThumbnail(video.thumbnail || '')
      .setColor(0xFF0000)
      .setTimestamp(video.publishedAt);

    await channel.send({ embeds: [embed] });
    console.log(`✓ Notified about video: ${video.title}`);
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

async function checkForNewVideos() {
  for (const sub of subscriptions) {
    const video = await getLatestVideo(sub.channelId);
    if (video && video.publishedAt > sub.lastCheckTime) {
      await notifyNewVideo(sub.discordChannelId, video);
      sub.lastCheckTime = video.publishedAt;
    }
  }
}

// Initialize Discord bot if credentials exist
async function initializeBot() {
  if (DISCORD_TOKEN && YOUTUBE_API_KEY && !client) {
    client = new Client({ intents: ['Guilds', 'DirectMessages', 'MessageContent'] });

    client.on('ready', () => {
      console.log(`✓ Discord bot logged in as ${client?.user?.tag}`);
      client?.user?.setActivity('eating cookies', { type: ActivityType.Custom });
      setInterval(checkForNewVideos, CHECK_INTERVAL);
    });

    client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.content.startsWith('!')) return;

      const args = message.content.slice(1).split(/ +/);
      const command = args.shift()?.toLowerCase();

      if (command === 'subscribe') {
        const youtubeChannelId = args[0];
        if (!youtubeChannelId) {
          await message.reply('**Usage:** `!subscribe <YOUTUBE_CHANNEL_ID>`');
          return;
        }

        const video = await getLatestVideo(youtubeChannelId);
        if (!video) {
          await message.reply('❌ Could not find YouTube channel with that ID.');
          return;
        }

        if (subscriptions.some(s => s.channelId === youtubeChannelId && s.discordChannelId === message.channelId)) {
          await message.reply(`Already subscribed to **${video.channelTitle}**.`);
          return;
        }

        subscriptions.push({
          channelId: youtubeChannelId,
          channelName: video.channelTitle,
          discordChannelId: message.channelId,
          lastCheckTime: Date.now(),
        });

        await message.reply(`✓ Subscribed to **${video.channelTitle}**!`);
      } else if (command === 'subscriptions') {
        const channelSubs = subscriptions.filter(s => s.discordChannelId === message.channelId);
        if (channelSubs.length === 0) {
          await message.reply('No subscriptions in this channel.');
          return;
        }
        const list = channelSubs.map((s, i) => `${i + 1}. **${s.channelName}**`).join('\n');
        await message.reply(`**Subscriptions:**\n${list}`);
      } else if (command === 'unsubscribe') {
        const youtubeChannelId = args[0];
        if (!youtubeChannelId) {
          await message.reply('**Usage:** `!unsubscribe <YOUTUBE_CHANNEL_ID>`');
          return;
        }
        const index = subscriptions.findIndex(
          (s) => s.channelId === youtubeChannelId && s.discordChannelId === message.channelId
        );
        if (index === -1) {
          await message.reply('Subscription not found.');
          return;
        }
        const removed = subscriptions.splice(index, 1)[0];
        await message.reply(`✓ Unsubscribed from **${removed.channelName}**`);
      }
    });

    client.on('error', (error) => console.error('Discord error:', error));
    await client.login(DISCORD_TOKEN);
  }
}

// Routes
app.get('/', (req, res) => {
  if (DISCORD_TOKEN && YOUTUBE_API_KEY) {
    res.json({ status: 'running', message: 'Bot is connected' });
  } else {
    res.send(setupHTML);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', botConnected: !!client });
});

// Start server
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  initializeBot();
});

process.on('SIGINT', async () => {
  if (client) await client.destroy();
  process.exit(0);
});
