# YouTube Discord Notifier Bot

A Discord bot that monitors YouTube channels and sends notifications to your Discord server when new videos are uploaded.

## Setup Instructions

### 1. Get Your YouTube API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the YouTube Data API v3
4. Create a service account or OAuth 2.0 credential
5. Copy your API key

### 2. Create a Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Go to "Bot" section and click "Add Bot"
4. Under TOKEN, click "Copy" to get your bot token
5. Give your bot the following permissions:
   - Send Messages
   - Embed Links
   - Read Message History

### 3. Set Environment Variables
Add these to your Replit Secrets:
- `DISCORD_TOKEN`: Your Discord bot token
- `YOUTUBE_API_KEY`: Your YouTube API key

### 4. Invite Bot to Server
1. In Developer Portal, go to OAuth2 > URL Generator
2. Select scopes: `bot`
3. Select permissions: `Send Messages`, `Embed Links`
4. Copy the generated URL and open it to invite the bot

### 5. Use the Bot

In any Discord channel where the bot has permissions, use these commands:

- `!subscribe <YOUTUBE_CHANNEL_ID>` - Subscribe to a YouTube channel
  - Example: `!subscribe UCBJycsmduvf2EL7D87IRLgA`
  - The bot will send notifications about new videos in that channel

- `!subscriptions` - List all active subscriptions

- `!unsubscribe <YOUTUBE_CHANNEL_ID>` - Remove a subscription

### Finding YouTube Channel IDs

1. Go to a YouTube channel
2. Click "About"
3. Find the channel URL, it looks like: `youtube.com/@channelname` or `youtube.com/channel/CHANNEL_ID`
4. The ID after `/channel/` is your YouTube Channel ID

## Features

- ✓ Monitor multiple YouTube channels
- ✓ Get notified in Discord with rich embeds
- ✓ Easy subscribe/unsubscribe commands
- ✓ Checks for new videos every 5 minutes
