import { Client, ActivityType } from 'discord.js';
import axios from 'axios';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

async function testBot() {
  console.log('🧪 Starting Bot Tests...\n');

  // Test 1: Check environment variables
  console.log('📋 Test 1: Checking Environment Variables');
  if (!DISCORD_TOKEN) {
    console.log('❌ DISCORD_TOKEN is not set');
  } else {
    console.log('✓ DISCORD_TOKEN is set');
  }

  if (!YOUTUBE_API_KEY) {
    console.log('❌ YOUTUBE_API_KEY is not set\n');
  } else {
    console.log('✓ YOUTUBE_API_KEY is set\n');
  }

  if (!DISCORD_TOKEN || !YOUTUBE_API_KEY) {
    console.log('⚠️  Cannot proceed without both tokens. Add them to Replit Secrets.');
    process.exit(1);
  }

  // Test 2: Test Discord Connection
  console.log('📋 Test 2: Testing Discord Connection');
  try {
    const client = new Client({ intents: ['Guilds'] });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout after 10 seconds'));
      }, 10000);

      client.on('ready', () => {
        clearTimeout(timeout);
        console.log(`✓ Connected to Discord`);
        console.log(`✓ Bot username: ${client.user?.tag}`);
        console.log(`✓ Bot ID: ${client.user?.id}\n`);
        
        // Set presence
        client.user?.setActivity('eating cookies', { type: ActivityType.Custom });
        console.log('✓ Presence set to "eating cookies"\n');
        
        resolve(true);
      });

      client.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      client.login(DISCORD_TOKEN).catch(reject);
    });

    // Clean up
    const client2 = new Client({ intents: ['Guilds'] });
    await client2.login(DISCORD_TOKEN);
    await client2.destroy();
  } catch (error) {
    console.log(`❌ Discord Connection Failed`);
    console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Test 3: Test YouTube API
  console.log('📋 Test 3: Testing YouTube API');
  try {
    const channelId = 'UCX6OQ9kcY8nj0j-0I7Ey5w'; // MrBeast
    
    // First get the channel info to find its uploads playlist
    const channelResponse = await axios.get(
      'https://www.googleapis.com/youtube/v3/channels',
      {
        params: {
          part: 'contentDetails',
          id: channelId,
          key: YOUTUBE_API_KEY,
        },
      }
    );

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.log('❌ Channel not found');
      process.exit(1);
    }

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
      console.log('✓ YouTube API is working');
      console.log(`✓ Latest video: ${video.snippet.title}`);
      console.log(`✓ Channel: ${video.snippet.channelTitle}`);
      console.log(`✓ Published: ${video.snippet.publishedAt}\n`);
    } else {
      console.log('❌ No videos found in playlist');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ YouTube API Failed');
    if (error instanceof Error) {
      console.log(`Error: ${error.message}`);
      if ('response' in error && error.response) {
        console.log('Response:', (error.response as any).data);
      }
    }
    process.exit(1);
  }

  console.log('✅ All tests passed! Your bot is ready to use.');
  console.log('\nNext steps:');
  console.log('1. Invite the bot to your Discord server');
  console.log('2. Use !subscribe <YOUTUBE_CHANNEL_ID> in a channel');
  console.log('3. The bot will send notifications about new videos\n');

  process.exit(0);
}

testBot().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
