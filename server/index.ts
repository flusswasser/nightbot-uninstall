import express from 'express';
import { Client, ChannelType, EmbedBuilder, ActivityType } from 'discord.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface YouTubeSubscription {
  channelId: string;
  channelName: string;
  discordChannelId: string;
  lastPostedVideoId: string;
}

interface TwitchSubscription {
  twitchUsername: string;
  twitchUserId: string;
  twitchDisplayName: string;
  discordChannelId: string;
  lastNotifiedStreamId: string;
}

const app = express();
app.use(express.json());

// Initialize Discord client
let client: Client | null = null;
let subscriptions: YouTubeSubscription[] = [];
let twitchSubscriptions: TwitchSubscription[] = [];

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CHECK_INTERVAL = 300000;
const SUBSCRIPTIONS_FILE = path.join(process.cwd(), 'subscriptions.json');
const TWITCH_SUBSCRIPTIONS_FILE = path.join(process.cwd(), 'twitch_subscriptions.json');
const TWITCH_TOKEN_FILE = path.join(process.cwd(), 'twitch_token.json');

interface TwitchOAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
}

let twitchOAuthToken: TwitchOAuthToken | null = null;
let twitchDeviceAuthUrl: string | null = null;
let twitchDeviceCode: string | null = null;

// Load subscriptions and Twitch token from file
function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const data = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8');
      subscriptions = JSON.parse(data);
      console.log(`✓ Loaded ${subscriptions.length} YouTube subscriptions from file`);
    }
    if (fs.existsSync(TWITCH_SUBSCRIPTIONS_FILE)) {
      const data = fs.readFileSync(TWITCH_SUBSCRIPTIONS_FILE, 'utf-8');
      twitchSubscriptions = JSON.parse(data);
      console.log(`✓ Loaded ${twitchSubscriptions.length} Twitch subscriptions from file`);
    }
    if (fs.existsSync(TWITCH_TOKEN_FILE)) {
      const data = fs.readFileSync(TWITCH_TOKEN_FILE, 'utf-8');
      twitchOAuthToken = JSON.parse(data);
      console.log(`✓ Loaded Twitch OAuth token`);
    }
  } catch (error) {
    console.error('Error loading subscriptions:', error);
  }
}

// Save subscriptions and Twitch token to file
function saveSubscriptions() {
  try {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2), 'utf-8');
    fs.writeFileSync(TWITCH_SUBSCRIPTIONS_FILE, JSON.stringify(twitchSubscriptions, null, 2), 'utf-8');
    if (twitchOAuthToken) {
      fs.writeFileSync(TWITCH_TOKEN_FILE, JSON.stringify(twitchOAuthToken, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('Error saving subscriptions:', error);
  }
}

// Get Twitch device code URL for authentication
async function initiateTwitchDeviceAuth(): Promise<void> {
  if (!TWITCH_CLIENT_ID) return;

  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/device', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        scopes: 'user:read:email',
      },
    });

    twitchDeviceCode = response.data.device_code;
    twitchDeviceAuthUrl = response.data.verification_uri;
    console.log('✓ Twitch device code generated. Auth URL:', twitchDeviceAuthUrl);
  } catch (error) {
    console.error('Error initiating Twitch device auth:', error);
  }
}

// Poll for device code authorization completion
async function pollTwitchDeviceAuth(): Promise<boolean> {
  if (!TWITCH_CLIENT_ID || !twitchDeviceCode) return false;

  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        device_code: twitchDeviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
    });

    twitchOAuthToken = {
      access_token: response.data.access_token,
      token_type: response.data.token_type,
      expires_in: response.data.expires_in,
      expires_at: Date.now() + response.data.expires_in * 1000,
    };
    saveSubscriptions();
    console.log('✓ Obtained Twitch OAuth token via device flow');
    return true;
  } catch (error: any) {
    if (error.response?.data?.error === 'authorization_pending') {
      // Still waiting for user authorization
      return false;
    }
    console.error('Error polling Twitch device auth:', error);
    return false;
  }
}

// Get a valid Twitch OAuth token (refresh if needed)
async function getTwitchAccessToken(): Promise<string | null> {
  if (!TWITCH_CLIENT_ID) {
    return null;
  }

  // Check if token is expired
  if (twitchOAuthToken && twitchOAuthToken.expires_at > Date.now()) {
    return twitchOAuthToken.access_token;
  }

  // If we don't have a token yet, try polling or initiating device flow
  if (!twitchOAuthToken) {
    if (!twitchDeviceCode) {
      await initiateTwitchDeviceAuth();
    } else {
      await pollTwitchDeviceAuth();
    }
  }

  return twitchOAuthToken?.access_token || null;
}

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
      <h2>Step 3: Get Twitch Client ID</h2>
      <p>1. Go to <a href="https://dev.twitch.tv/console/apps" target="_blank">Twitch Developer Console</a></p>
      <p>2. Create a new application</p>
      <p>3. Copy your Client ID</p>
      <p>4. In Replit Secrets, add:</p>
      <div class="code">TWITCH_CLIENT_ID = your_client_id</div>
      <p>5. When you first use a Twitch command, the bot will provide an authorization URL to complete the device flow</p>
    </div>

    <div class="step">
      <h2>Step 4: Invite Bot to Discord</h2>
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
      <p><strong>!sub &lt;YOUTUBE_CHANNEL_ID&gt;</strong> - Subscribe to YouTube uploads</p>
      <p><strong>!subs</strong> - View YouTube subscriptions</p>
      <p><strong>!unsub &lt;YOUTUBE_CHANNEL_ID&gt;</strong> - Remove YouTube subscription</p>
      <p><strong>!tsub &lt;TWITCH_USERNAME&gt;</strong> - Subscribe to Twitch streams</p>
      <p><strong>!tsubs</strong> - View Twitch subscriptions</p>
      <p><strong>!tunsub &lt;TWITCH_USERNAME&gt;</strong> - Remove Twitch subscription</p>
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
    // First get the channel info to find its uploads playlist
    const channelResponse = await axios.get(
      'https://www.googleapis.com/youtube/v3/channels',
      {
        params: {
          part: 'contentDetails,snippet',
          id: channelId,
          key: YOUTUBE_API_KEY,
        },
      }
    );

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.error(`Channel not found: ${channelId}`);
      console.error(`API Response:`, channelResponse.data);
      return null;
    }

    const channelTitle = channelResponse.data.items[0].snippet.title;
    const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

    // Now get videos from the uploads playlist
    const videosResponse = await axios.get(
      'https://www.googleapis.com/youtube/v3/playlistItems',
      {
        params: {
          part: 'snippet',
          playlistId: uploadsPlaylistId,
          maxResults: 1,
          key: YOUTUBE_API_KEY,
        },
      }
    );

    if (videosResponse.data.items && videosResponse.data.items.length > 0) {
      const video = videosResponse.data.items[0];
      return {
        videoId: video.snippet.resourceId.videoId,
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: new Date(video.snippet.publishedAt).getTime(),
        thumbnail: video.snippet.thumbnails.high?.url,
        channelTitle: channelTitle,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching videos for channel ${channelId}:`);
    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);
    }
    if (error && typeof error === 'object' && 'response' in error) {
      console.error(`API Error:`, (error as any).response?.data);
    }
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

    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    const message = `**${video.channelTitle} Posted A New Video**\n${video.title}\n\n${videoUrl}`;

    await channel.send(message);
    console.log(`✓ Notified about video: ${video.title}`);
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

async function checkForNewVideos() {
  for (const sub of subscriptions) {
    const video = await getLatestVideo(sub.channelId);
    if (video && video.videoId !== sub.lastPostedVideoId) {
      await notifyNewVideo(sub.discordChannelId, video);
      sub.lastPostedVideoId = video.videoId;
      saveSubscriptions();
    }
  }
}

// Twitch API functions
async function getTwitchUserInfo(username: string) {
  try {
    const accessToken = await getTwitchAccessToken();
    if (!accessToken) {
      console.error('Could not obtain Twitch access token');
      return null;
    }

    const response = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
      },
      params: {
        login: username,
      },
    });

    if (response.data.data && response.data.data.length > 0) {
      return response.data.data[0];
    }
    return null;
  } catch (error) {
    console.error(`Error fetching Twitch user ${username}:`, error);
    return null;
  }
}

async function checkIfTwitchLive(userId: string) {
  try {
    const accessToken = await getTwitchAccessToken();
    if (!accessToken) {
      console.error('Could not obtain Twitch access token');
      return null;
    }

    const response = await axios.get('https://api.twitch.tv/helix/streams', {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
      },
      params: {
        user_id: userId,
      },
    });

    if (response.data.data && response.data.data.length > 0) {
      return response.data.data[0];
    }
    return null;
  } catch (error) {
    console.error(`Error checking Twitch stream status for user ${userId}:`, error);
    return null;
  }
}

async function notifyTwitchLive(
  discordChannelId: string,
  stream: any,
  displayName: string
) {
  try {
    if (!client) return;

    const channel = await client.channels.fetch(discordChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.error(`Invalid Discord channel: ${discordChannelId}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${displayName} is now live on Twitch!`)
      .setDescription(stream.title)
      .setURL(`https://www.twitch.tv/${stream.user_login}`)
      .setThumbnail(stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180'))
      .setColor(0x9146FF)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log(`✓ Notified about Twitch stream: ${displayName}`);
  } catch (error) {
    console.error('Error sending Twitch notification:', error);
  }
}

async function checkForLiveStreams() {
  for (const sub of twitchSubscriptions) {
    const stream = await checkIfTwitchLive(sub.twitchUserId);
    if (stream && stream.id !== sub.lastNotifiedStreamId) {
      await notifyTwitchLive(sub.discordChannelId, stream, sub.twitchDisplayName);
      sub.lastNotifiedStreamId = stream.id;
      saveSubscriptions();
    }
  }
}

// Initialize Discord bot if credentials exist
async function initializeBot() {
  if (DISCORD_TOKEN && YOUTUBE_API_KEY && !client) {
    client = new Client({ 
      intents: ['Guilds', 'GuildMessages', 'DirectMessages', 'MessageContent'] 
    });

    client.on('clientReady', () => {
      console.log(`✓ Discord bot logged in as ${client?.user?.tag}`);
      client?.user?.setActivity('Eating Cookies', { type: ActivityType.Custom });
      setInterval(checkForNewVideos, CHECK_INTERVAL);
      if (TWITCH_CLIENT_ID) {
        // Try to load existing token or initiate device auth
        if (twitchOAuthToken) {
          setInterval(checkForLiveStreams, CHECK_INTERVAL);
        } else {
          initiateTwitchDeviceAuth();
        }
      }
    });

    client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;
        
        console.log(`Message received: "${message.content}" from ${message.author.tag} in ${message.guild?.name || 'DM'}`);
        
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(/ +/);
        const command = args.shift()?.toLowerCase();
        console.log(`Command: ${command}, Args: ${args.join(', ')}`);

        if (command === 'sub') {
        const youtubeChannelId = args[0];
        if (!youtubeChannelId) {
          await message.reply('**Usage:** `!sub <YOUTUBE_CHANNEL_ID>`');
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
          lastPostedVideoId: video.videoId,
        });
        saveSubscriptions();

        await message.reply(`✓ Subscribed to **${video.channelTitle}**!\n📹 Latest video: ${video.title}`);
      } else if (command === 'subs') {
        const channelSubs = subscriptions.filter(s => s.discordChannelId === message.channelId);
        if (channelSubs.length === 0) {
          await message.reply('No subscriptions in this channel.');
          return;
        }
        const list = channelSubs.map((s, i) => `${i + 1}. **${s.channelName}**`).join('\n');
        await message.reply(`**Subscriptions:**\n${list}`);
      } else if (command === 'unsub') {
        const youtubeChannelId = args[0];
        if (!youtubeChannelId) {
          await message.reply('**Usage:** `!unsub <YOUTUBE_CHANNEL_ID>`');
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
        saveSubscriptions();
        await message.reply(`✓ Unsubscribed from **${removed.channelName}**`);
      } else if (command === 'tsub') {
        if (!TWITCH_CLIENT_ID) {
          await message.reply('❌ Twitch integration not configured.');
          return;
        }
        
        // If no token, either initiate auth or ask them to authorize
        if (!twitchOAuthToken) {
          if (!twitchDeviceCode) {
            await initiateTwitchDeviceAuth();
          } else {
            // Try polling in case they just authorized
            await pollTwitchDeviceAuth();
          }
          
          if (twitchDeviceAuthUrl && !twitchOAuthToken) {
            await message.reply(`⚠️ Twitch authorization needed!\nGo to: ${twitchDeviceAuthUrl} to authorize the bot.\nThen try the command again!`);
            return;
          }
        }
        
        const twitchUsername = args[0];
        if (!twitchUsername) {
          await message.reply('**Usage:** `!tsub <TWITCH_USERNAME>`');
          return;
        }

        const userInfo = await getTwitchUserInfo(twitchUsername);
        if (!userInfo) {
          await message.reply('❌ Could not find Twitch user with that username.');
          return;
        }

        if (twitchSubscriptions.some(s => s.twitchUserId === userInfo.id && s.discordChannelId === message.channelId)) {
          await message.reply(`Already subscribed to **${userInfo.display_name}**.`);
          return;
        }

        twitchSubscriptions.push({
          twitchUsername: userInfo.login,
          twitchUserId: userInfo.id,
          twitchDisplayName: userInfo.display_name,
          discordChannelId: message.channelId,
          lastNotifiedStreamId: '',
        });
        saveSubscriptions();

        await message.reply(`✓ Subscribed to **${userInfo.display_name}** on Twitch! You'll be notified when they go live.`);
      } else if (command === 'tsubs') {
        const channelSubs = twitchSubscriptions.filter(s => s.discordChannelId === message.channelId);
        if (channelSubs.length === 0) {
          await message.reply('No Twitch subscriptions in this channel.');
          return;
        }
        const list = channelSubs.map((s, i) => `${i + 1}. **${s.twitchDisplayName}**`).join('\n');
        await message.reply(`**Twitch Subscriptions:**\n${list}`);
      } else if (command === 'tunsub') {
        const twitchUsername = args[0];
        if (!twitchUsername) {
          await message.reply('**Usage:** `!tunsub <TWITCH_USERNAME>`');
          return;
        }
        const index = twitchSubscriptions.findIndex(
          (s) => s.twitchUsername === twitchUsername.toLowerCase() && s.discordChannelId === message.channelId
        );
        if (index === -1) {
          await message.reply('Twitch subscription not found.');
          return;
        }
        const removed = twitchSubscriptions.splice(index, 1)[0];
        saveSubscriptions();
        await message.reply(`✓ Unsubscribed from **${removed.twitchDisplayName}**`);
      } else if (command === 'latest') {
        const youtubeChannelId = args[0];
        if (!youtubeChannelId) {
          await message.reply('**Usage:** `!latest <YOUTUBE_CHANNEL_ID>`');
          return;
        }

        const video = await getLatestVideo(youtubeChannelId);
        if (!video) {
          await message.reply('❌ Could not find YouTube channel or videos.');
          return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
        const testMessage = `**${video.channelTitle} Posted A New Video**\n${video.title}\n\n${videoUrl}`;

        await message.reply(testMessage);
      } else if (command === 'nyoom') {
        await message.reply(':ellenaNYOOM: :ellenaNYOOM: :ellenaNYOOM: :ellenaNYOOM: :ellenaNYOOM: :ellenaNYOOM: :ellenaNYOOM:');
      } else if (command === 'wiggle') {
        await message.reply(':ellenaWIGGLE: :ellenaWIGGLE: :ellenaWIGGLE: :ellenaWIGGLE: :ellenaWIGGLE: :ellenaWIGGLE: :ellenaWIGGLE:');
      } else if (command === 'dino') {
        await message.reply(':ellenaDINO: :ellenaDINO: :ellenaDINO: :ellenaDINO: :ellenaDINO: :ellenaDINO: :ellenaDINO:');
      }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    client.on('error', (error) => console.error('Discord client error:', error));
    client.on('warn', (warning) => console.warn('Discord warning:', warning));
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
  loadSubscriptions();
  initializeBot();
});

process.on('SIGINT', async () => {
  if (client) await client.destroy();
  process.exit(0);
});
