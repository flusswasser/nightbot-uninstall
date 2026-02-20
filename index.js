"use strict";
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    ActivityType,
    PermissionsBitField 
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// --- Configuration ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

const YOUTUBE_CHECK_INTERVAL = 60000; // 1 min
const TWITCH_CHECK_INTERVAL = 10000;   // 10 seconds

const SUBS_FILE = path.join(__dirname, 'subscriptions.json');
const TWITCH_SUBS_FILE = path.join(__dirname, 'twitch_subscriptions.json');
const TWITCH_TOKEN_FILE = path.join(__dirname, 'twitch_token.json');

let client = null;
let subscriptions = [];
let twitchSubscriptions = [];
let twitchOAuthToken = null;

// --- Error Reporting Helper ---
function logError(context, error) {
    const timestamp = new Date().toLocaleString();
    const errorMessage = error.response ? 
        JSON.stringify(error.response.data.error || error.response.data) : 
        error.message;
    console.error(`[${timestamp}] ❌ ERROR in ${context}: ${errorMessage}`);
}

// --- Data Management ---
function loadData() {
    try {
        if (fs.existsSync(SUBS_FILE)) subscriptions = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
        if (fs.existsSync(TWITCH_SUBS_FILE)) twitchSubscriptions = JSON.parse(fs.readFileSync(TWITCH_SUBS_FILE, 'utf-8'));
        if (fs.existsSync(TWITCH_TOKEN_FILE)) twitchOAuthToken = JSON.parse(fs.readFileSync(TWITCH_TOKEN_FILE, 'utf-8'));
        console.log("✓ Data files loaded.");
    } catch (e) { console.error("Error loading data:", e); }
}

function saveData() {
    try {
        fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions, null, 2));
        fs.writeFileSync(TWITCH_SUBS_FILE, JSON.stringify(twitchSubscriptions, null, 2));
        if (twitchOAuthToken) fs.writeFileSync(TWITCH_TOKEN_FILE, JSON.stringify(twitchOAuthToken, null, 2));
    } catch (e) { console.error("Error saving data:", e); }
}

// --- API Helpers ---
async function getTwitchAccessToken() {
    if (!twitchOAuthToken || twitchOAuthToken.expires_at <= Date.now() + 60000) {
        try {
            const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: TWITCH_CLIENT_ID,
                    client_secret: TWITCH_CLIENT_SECRET,
                    grant_type: 'client_credentials'
                }
            });
            twitchOAuthToken = {
                access_token: res.data.access_token,
                expires_at: Date.now() + res.data.expires_in * 1000
            };
            saveData();
        } catch (e) { 
            logError("Twitch Auth", e);
            return null; 
        }
    }
    return twitchOAuthToken.access_token;
}

async function getTwitchUserInfo(username) {
    const token = await getTwitchAccessToken();
    if (!token) return null;
    try {
        const res = await axios.get('https://api.twitch.tv/helix/users', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
            params: { login: username }
        });
        return res.data.data?.[0] || null;
    } catch (e) { 
        logError(`Twitch User Info (${username})`, e);
        return null; 
    }
}

// --- Notifications ---
async function notifyTwitchLive(channelId, stream, displayName, customMessage, profileImageUrl) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) return;

        const content = customMessage || `@Twitch Pings I'm live! Come drop in and say hi!`;

        const embed = new EmbedBuilder()
            .setAuthor({ 
                name: `${displayName} is now live on Twitch!`, 
                iconURL: profileImageUrl || 'https://cdn.discordapp.com/emojis/1183615831721123851.webp' 
            })
            .setTitle(stream.title)
            .setURL(`https://www.twitch.tv/${stream.user_login}`)
            .addFields({ name: 'Game', value: stream.game_name || 'Unknown', inline: true })
            .setImage(stream.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'))
            .setColor(0x9146FF)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Watch Stream').setURL(`https://www.twitch.tv/${stream.user_login}`).setStyle(ButtonStyle.Link)
        );

        await channel.send({ content: content, embeds: [embed], components: [row] });
    } catch (e) { logError("Discord Notify (Twitch)", e); }
}

async function checkForLiveStreams() {
    if (twitchSubscriptions.length === 0) return;
    const token = await getTwitchAccessToken();
    if (!token) return;

    const ids = [...new Set(twitchSubscriptions.map(s => s.twitchUserId))];
    const params = new URLSearchParams();
    ids.forEach(id => params.append('user_id', id));

    try {
        const res = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
            params: params
        });

        const liveStreams = res.data.data || [];
        for (const sub of twitchSubscriptions) {
            const stream = liveStreams.find(s => s.user_id === sub.twitchUserId);
            if (stream) {
                if (stream.id !== sub.lastNotifiedStreamId) {
                    await notifyTwitchLive(sub.discordChannelId, stream, sub.twitchDisplayName, sub.liveMessage, sub.profileImageUrl);
                    sub.lastNotifiedStreamId = stream.id;
                    saveData();
                }
            } else {
                sub.lastNotifiedStreamId = "";
            }
        }
    } catch (e) { logError("Twitch Bulk Check", e); }
}

async function checkForNewVideos() {
    const videoCache = new Map();
    let dataChanged = false;

    for (const sub of subscriptions) {
        try {
            if (!sub.uploadsPlaylistId) {
                const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
                    params: { part: 'contentDetails', id: sub.channelId, key: YOUTUBE_API_KEY }
                });
                const channel = res.data.items?.[0];
                if (channel) {
                    sub.uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
                    dataChanged = true;
                } else continue;
            }

            let video;
            if (videoCache.has(sub.uploadsPlaylistId)) {
                video = videoCache.get(sub.uploadsPlaylistId);
            } else {
                const res = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
                    params: { 
                        part: 'snippet,contentDetails', 
                        playlistId: sub.uploadsPlaylistId, 
                        maxResults: 5, 
                        key: YOUTUBE_API_KEY 
                    }
                });
                const videos = res.data.items || [];
                // Sort by publishedAt descending just in case, though usually they are
                videos.sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
                video = videos[0];
                videoCache.set(sub.uploadsPlaylistId, video); 
            }

            if (video) {
                const currentVideoId = video.snippet.resourceId.videoId;
                if (currentVideoId !== sub.lastPostedVideoId) {
                    // Check if the video is actually new (published within the last 24 hours)
                    // to avoid posting old videos if the cache/storage is reset
                    const publishedAt = new Date(video.snippet.publishedAt);
                    const isRecent = Date.now() - publishedAt.getTime() < 24 * 60 * 60 * 1000;
                    
                    if (isRecent) {
                        const channel = await client.channels.fetch(sub.discordChannelId);
                        if (channel?.type === ChannelType.GuildText) {
                            await channel.send(`**${sub.channelName} Posted A New Video**\n${video.snippet.title}\n\nhttps://www.youtube.com/watch?v=${currentVideoId}`);
                            sub.lastPostedVideoId = currentVideoId;
                            dataChanged = true; 
                        }
                    } else {
                        // If it's old but different, just update the ID so we don't check again
                        sub.lastPostedVideoId = currentVideoId;
                        dataChanged = true;
                    }
                }
            }
        } catch (e) { logError(`YouTube Check (${sub.channelName})`, e); }
    }
    if (dataChanged) saveData();
}

// --- Bot Logic ---
async function initializeBot() {
    client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages]
    });

    client.on('ready', () => {
        console.log(`✓ Online: ${client.user.tag}`);
        client.user.setActivity('Eating Cookies', { type: ActivityType.Custom });
        setInterval(checkForLiveStreams, TWITCH_CHECK_INTERVAL);
        setInterval(checkForNewVideos, YOUTUBE_CHECK_INTERVAL);
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(/ +/);
        const command = args.shift().toLowerCase();
        const isMod = message.member?.permissions.has(PermissionsBitField.Flags.ManageChannels) || 
                      message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

        // --- Fun ---
        if (command === 'nyoom') await message.reply('<a:ellenaNYOOM:1141667448815362188> '.repeat(7));
        else if (command === 'wiggle') await message.reply('<a:ellenaWIGGLE:1045838228172832798> '.repeat(7));
        else if (command === 'dino') await message.reply('<a:ellenaDINO:1105677378132389939> '.repeat(7));
        else if (command === 'cookie') await message.reply(`Thanks for the cookie **${message.author.username}**. <:ellenaRibert1:1183615831721123851>`);

        // --- Management (Mod Only) ---
        else if (isMod) {
            if (command === 'sub') {
                const channelId = args[0];
                if (!channelId) return message.reply('Usage: `!sub <CHANNEL_ID>`');
                try {
                    const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
                        params: { part: 'contentDetails,snippet', id: channelId, key: YOUTUBE_API_KEY }
                    });
                    const channel = res.data.items?.[0];
                    if (!channel) return message.reply('Channel not found.');

                    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

                    // FETCH LATEST VIDEO ID ON SUB TO PREVENT OLD POSTS
                    const vRes = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
                        params: { part: 'snippet', playlistId: uploadsPlaylistId, maxResults: 1, key: YOUTUBE_API_KEY }
                    });
                    const currentId = vRes.data.items?.[0]?.snippet.resourceId.videoId || '';

                    subscriptions.push({ 
                        channelId, 
                        channelName: channel.snippet.title, 
                        uploadsPlaylistId: uploadsPlaylistId, 
                        discordChannelId: message.channelId, 
                        lastPostedVideoId: currentId 
                    });
                    saveData();
                    await message.reply(`✓ Subscribed to **${channel.snippet.title}**. Current video bookmarked.`);
                } catch (e) { logError("Manual Sub", e); message.reply('API Error.'); }
            }
            else if (command === 'tsub') {
                const username = args[0];
                const msg = args.slice(1).join(' ');
                const info = await getTwitchUserInfo(username);
                if (!info) return message.reply('Twitch user not found.');
                twitchSubscriptions.push({ 
                    twitchUsername: info.login, twitchUserId: info.id, twitchDisplayName: info.display_name, 
                    profileImageUrl: info.profile_image_url, discordChannelId: message.channelId, 
                    lastNotifiedStreamId: '', liveMessage: msg || null 
                });
                saveData();
                await message.reply(`✓ Subscribed to **${info.display_name}**`);
            }
            else if (command === 'tmsg') {
                const username = args[0]?.toLowerCase();
                const newMessage = args.slice(1).join(' ');
                const sub = twitchSubscriptions.find(s => s.twitchUsername === username && s.discordChannelId === message.channelId);
                if (!sub) return message.reply('Subscription not found.');
                sub.liveMessage = newMessage;
                saveData();
                await message.reply(`✓ Message updated for **${sub.twitchDisplayName}**!`);
            }
            else if (command === 'unsub') {
                const id = args[0];
                const index = subscriptions.findIndex(s => s.channelId === id && s.discordChannelId === message.channelId);
                if (index !== -1) { subscriptions.splice(index, 1); saveData(); await message.reply('✓ Removed.'); }
            }
            else if (command === 'tunsub') {
                const name = args[0]?.toLowerCase();
                const index = twitchSubscriptions.findIndex(s => s.twitchUsername === name && s.discordChannelId === message.channelId);
                if (index !== -1) { twitchSubscriptions.splice(index, 1); saveData(); await message.reply('✓ Removed.'); }
            }
            else if (command === 'subs') {
                const list = subscriptions.filter(s => s.discordChannelId === message.channelId);
                await message.reply(list.length ? list.map((s, i) => `${i+1}. **${s.channelName}**`).join('\n') : "No YouTube subs.");
            }
            else if (command === 'tsubs') {
                const list = twitchSubscriptions.filter(s => s.discordChannelId === message.channelId);
                await message.reply(list.length ? list.map((s, i) => `${i+1}. **${s.twitchDisplayName}**`).join('\n') : "No Twitch subs.");
            }
        }
    });

    await client.login(DISCORD_TOKEN);
}

loadData();
initializeBot();
app.listen(process.env.PORT || 7890);