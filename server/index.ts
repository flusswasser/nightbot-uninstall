import { Client, ChannelType, EmbedBuilder } from 'discord.js';
import axios from 'axios';

interface YouTubeSubscription {
  channelId: string;
  channelName: string;
  discordChannelId: string;
  lastCheckTime: number;
}

interface StoredSubscriptions {
  subscriptions: YouTubeSubscription[];
}

// Initialize Discord client
const client = new Client({ intents: ['Guilds', 'DirectMessages'] });

// Store subscriptions in memory (in production, use a database)
let subscriptions: YouTubeSubscription[] = [];
let lastSaveTime = Date.now();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHECK_INTERVAL = 300000; // Check every 5 minutes

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

// Discord notification
async function notifyNewVideo(
  discordChannelId: string,
  video: Awaited<ReturnType<typeof getLatestVideo>>
) {
  try {
    if (!video) return;

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
      .setColor(0xFF0000) // YouTube red
      .setTimestamp(video.publishedAt);

    await channel.send({ embeds: [embed] });
    console.log(`Notified about video: ${video.title}`);
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

// Check for new videos
async function checkForNewVideos() {
  for (const sub of subscriptions) {
    const video = await getLatestVideo(sub.channelId);
    if (video && video.publishedAt > sub.lastCheckTime) {
      await notifyNewVideo(sub.discordChannelId, video);
      sub.lastCheckTime = video.publishedAt;
    }
  }
}

// Discord event handlers
client.on('ready', () => {
  console.log(`✓ Discord bot logged in as ${client.user?.tag}`);
  
  // Start checking for new videos
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
      await message.reply('Usage: `!subscribe <YOUTUBE_CHANNEL_ID>`');
      return;
    }

    // Verify channel exists
    const video = await getLatestVideo(youtubeChannelId);
    if (!video) {
      await message.reply('Could not find YouTube channel with that ID.');
      return;
    }

    // Add subscription
    subscriptions.push({
      channelId: youtubeChannelId,
      channelName: video.channelTitle,
      discordChannelId: message.channelId,
      lastCheckTime: Date.now(),
    });

    await message.reply(
      `✓ Subscribed to **${video.channelTitle}** in this channel!`
    );
  } else if (command === 'subscriptions') {
    if (subscriptions.length === 0) {
      await message.reply('No subscriptions configured.');
      return;
    }

    const list = subscriptions
      .map((s) => `• ${s.channelName} (${s.channelId})`)
      .join('\n');
    
    await message.reply(
      `**Active Subscriptions:**\n${list}`
    );
  } else if (command === 'unsubscribe') {
    const youtubeChannelId = args[0];
    
    if (!youtubeChannelId) {
      await message.reply('Usage: `!unsubscribe <YOUTUBE_CHANNEL_ID>`');
      return;
    }

    const index = subscriptions.findIndex(
      (s) => s.channelId === youtubeChannelId && 
             s.discordChannelId === message.channelId
    );

    if (index === -1) {
      await message.reply('Subscription not found in this channel.');
      return;
    }

    const removed = subscriptions.splice(index, 1)[0];
    await message.reply(`✓ Unsubscribed from **${removed.channelName}**`);
  }
});

// Login to Discord
client.login(DISCORD_TOKEN);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down bot...');
  await client.destroy();
  process.exit(0);
});
