import { type UninstallRequest, type Boss, type Player, type Game } from "@shared/schema";
import * as fs from "fs/promises";
import * as path from "path";
import type { Express } from "express";
import { createServer, type Server } from "http";

// --- Storage Logic ---
export interface IStorage {
  // Uninstall Requests (Isolated by Channel)
  incrementUninstallCount(channelId: string, programName: string): Promise<UninstallRequest>;
  getAllUninstallRequests(channelId: string): Promise<UninstallRequest[]>;
  resetAllRequests(channelId: string): Promise<void>;
  deleteRequest(channelId: string, programName: string): Promise<boolean>;

  // Channels
  getChannels(): Promise<Player[]>;
  getChannel(id: string): Promise<Player | undefined>;
  updateChannelName(id: string, name: string): Promise<Player>;
  resetChannelDeaths(id: string): Promise<void>;
  deleteChannel(id: string): Promise<void>;

  // Games
  getGames(channelId: string): Promise<Game[]>;
  setActiveGame(channelId: string, gameName: string): Promise<Game>;
  getActiveGame(channelId: string): Promise<Game | undefined>;

  // Death Counter (Isolated by Channel & Game)
  getBoss(channelId: string, gameId: string, name: string): Promise<Boss | undefined>;
  getActiveBoss(channelId: string, gameId: string): Promise<Boss | undefined>;
  upsertBoss(channelId: string, gameId: string, name: string): Promise<Boss>;
  incrementDeaths(channelId: string, bossName?: string): Promise<Boss>;
  setDeaths(channelId: string, bossName: string, count: number): Promise<Boss>;
  markBeaten(channelId: string, bossName?: string): Promise<Boss>;
  getAllBosses(channelId: string, gameId: string): Promise<Boss[]>;
}

const DATA_FILE = path.join(process.cwd(), "data.json");

interface DataStructure {
  channels: Record<string, Player>;
  uninstallRequests: Record<string, Record<string, UninstallRequest>>;
  bosses: Record<string, Record<string, Record<string, Boss>>>; // channelId -> gameId -> bossName -> Boss
  games: Record<string, Record<string, Game>>; // channelId -> gameId -> Game
}

async function readData(): Promise<DataStructure> {
  try {
    const content = await fs.readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(content) as DataStructure;
    if (!parsed.channels) parsed.channels = {};
    if (!parsed.uninstallRequests) parsed.uninstallRequests = {};
    if (!parsed.bosses) parsed.bosses = {};
    if (!parsed.games) parsed.games = {};
    return parsed;
  } catch {
    return { channels: {}, uninstallRequests: {}, bosses: {}, games: {} };
  }
}

async function writeData(data: DataStructure): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

export class FileStorage implements IStorage {
  private data: DataStructure | null = null;

  private async ensureLoaded(): Promise<void> {
    if (this.data === null) {
      this.data = await readData();
    }
  }

  private async ensureChannel(channelId: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.data!.channels[channelId]) {
      this.data!.channels[channelId] = { id: channelId, name: channelId, isDefault: Object.keys(this.data!.channels).length === 0, activeGameId: null };
    }
    if (!this.data!.uninstallRequests[channelId]) this.data!.uninstallRequests[channelId] = {};
    if (!this.data!.bosses[channelId]) this.data!.bosses[channelId] = {};
    if (!this.data!.games[channelId]) this.data!.games[channelId] = {};
  }

  // Uninstall Requests
  async incrementUninstallCount(channelId: string, programName: string): Promise<UninstallRequest> {
    await this.ensureChannel(channelId);
    const normalizedName = programName.toLowerCase().trim();
    const existing = this.data!.uninstallRequests[channelId][normalizedName];

    if (existing) {
      existing.count++;
      this.data!.uninstallRequests[channelId][normalizedName] = existing;
    } else {
      const newRequest: UninstallRequest = {
        id: crypto.randomUUID(),
        programName: programName.trim(),
        count: 1,
      };
      this.data!.uninstallRequests[channelId][normalizedName] = newRequest;
    }

    await writeData(this.data!);
    return this.data!.uninstallRequests[channelId][normalizedName];
  }

  async getAllUninstallRequests(channelId: string): Promise<UninstallRequest[]> {
    await this.ensureChannel(channelId);
    return Object.values(this.data!.uninstallRequests[channelId]).sort((a, b) => b.count - a.count);
  }

  async resetAllRequests(channelId: string): Promise<void> {
    await this.ensureChannel(channelId);
    this.data!.uninstallRequests[channelId] = {};
    await writeData(this.data!);
  }

  async deleteRequest(channelId: string, programName: string): Promise<boolean> {
    await this.ensureChannel(channelId);
    const normalizedName = programName.toLowerCase().trim();
    if (this.data!.uninstallRequests[channelId][normalizedName]) {
      delete this.data!.uninstallRequests[channelId][normalizedName];
      await writeData(this.data!);
      return true;
    }
    return false;
  }

  // Channels
  async getChannels(): Promise<Player[]> {
    await this.ensureLoaded();
    return Object.values(this.data!.channels);
  }

  async getChannel(id: string): Promise<Player | undefined> {
    await this.ensureLoaded();
    return this.data!.channels[id];
  }

  async updateChannelName(id: string, name: string): Promise<Player> {
    await this.ensureChannel(id);
    this.data!.channels[id].name = name;
    await writeData(this.data!);
    return this.data!.channels[id];
  }

  async resetChannelDeaths(id: string): Promise<void> {
    await this.ensureChannel(id);
    const activeGameId = this.data!.channels[id].activeGameId;
    if (activeGameId) {
      this.data!.bosses[id][activeGameId] = {};
    }
    await writeData(this.data!);
  }

  async deleteChannel(id: string): Promise<void> {
    await this.ensureLoaded();
    if (this.data!.channels[id]) {
      delete this.data!.channels[id];
      delete this.data!.uninstallRequests[id];
      delete this.data!.bosses[id];
      delete this.data!.games[id];
      await writeData(this.data!);
    }
  }

  // Games
  async getGames(channelId: string): Promise<Game[]> {
    await this.ensureChannel(channelId);
    return Object.values(this.data!.games[channelId]);
  }

  async setActiveGame(channelId: string, gameName: string): Promise<Game> {
    await this.ensureChannel(channelId);
    const normalizedGameName = gameName.toLowerCase().trim();
    if (!this.data!.games[channelId][normalizedGameName]) {
      this.data!.games[channelId][normalizedGameName] = {
        id: normalizedGameName,
        name: gameName.trim(),
        channelId
      };
      this.data!.bosses[channelId][normalizedGameName] = {};
    }
    this.data!.channels[channelId].activeGameId = normalizedGameName;
    await writeData(this.data!);
    return this.data!.games[channelId][normalizedGameName];
  }

  async getActiveGame(channelId: string): Promise<Game | undefined> {
    await this.ensureChannel(channelId);
    const activeGameId = this.data!.channels[channelId].activeGameId;
    return activeGameId ? this.data!.games[channelId][activeGameId] : undefined;
  }

  // Death Counter
  async getBoss(channelId: string, gameId: string, name: string): Promise<Boss | undefined> {
    await this.ensureChannel(channelId);
    if (!this.data!.bosses[channelId][gameId]) return undefined;
    return Object.values(this.data!.bosses[channelId][gameId]).find(b => b.name.toLowerCase().trim() === name.toLowerCase().trim());
  }

  async getActiveBoss(channelId: string, gameId: string): Promise<Boss | undefined> {
    await this.ensureChannel(channelId);
    if (!this.data!.bosses[channelId][gameId]) return undefined;
    return Object.values(this.data!.bosses[channelId][gameId]).find(b => !b.isBeaten);
  }

  async upsertBoss(channelId: string, gameId: string, name: string): Promise<Boss> {
    await this.ensureChannel(channelId);
    if (!this.data!.bosses[channelId][gameId]) this.data!.bosses[channelId][gameId] = {};
    const normalizedName = name.toLowerCase().trim();
    if (!this.data!.bosses[channelId][gameId][normalizedName]) {
      this.data!.bosses[channelId][gameId][normalizedName] = {
        id: crypto.randomUUID(),
        name: name.trim(),
        isBeaten: false,
        deathCount: 0,
        finalDeathCount: null,
        playerId: channelId,
        gameId
      };
      await writeData(this.data!);
    }
    return this.data!.bosses[channelId][gameId][normalizedName];
  }

  async incrementDeaths(channelId: string, bossName?: string): Promise<Boss> {
    await this.ensureChannel(channelId);
    const activeGameId = this.data!.channels[channelId].activeGameId;
    if (!activeGameId) throw new Error("No active game set");

    let boss: Boss | undefined;
    if (bossName) {
      boss = await this.upsertBoss(channelId, activeGameId, bossName);
    } else {
      boss = await this.getActiveBoss(channelId, activeGameId);
    }

    if (!boss) throw new Error("No active boss");

    boss.deathCount++;
    this.data!.bosses[channelId][activeGameId][boss.name.toLowerCase().trim()] = boss;
    await writeData(this.data!);
    return boss;
  }

  async setDeaths(channelId: string, bossName: string, count: number): Promise<Boss> {
    await this.ensureChannel(channelId);
    const activeGameId = this.data!.channels[channelId].activeGameId;
    if (!activeGameId) throw new Error("No active game set");
    
    const boss = await this.upsertBoss(channelId, activeGameId, bossName);
    boss.deathCount = count;
    this.data!.bosses[channelId][activeGameId][boss.name.toLowerCase().trim()] = boss;
    await writeData(this.data!);
    return boss;
  }

  async markBeaten(channelId: string, bossName?: string): Promise<Boss> {
    await this.ensureChannel(channelId);
    const activeGameId = this.data!.channels[channelId].activeGameId;
    if (!activeGameId) throw new Error("No active game set");

    let boss: Boss | undefined;
    if (bossName) {
      boss = this.data!.bosses[channelId][activeGameId][bossName.toLowerCase().trim()];
    } else {
      boss = await this.getActiveBoss(channelId, activeGameId);
    }

    if (!boss) throw new Error("Boss not found");

    boss.isBeaten = true;
    boss.finalDeathCount = boss.deathCount;
    this.data!.bosses[channelId][activeGameId][boss.name.toLowerCase().trim()] = boss;
    await writeData(this.data!);
    return boss;
  }

  async getAllBosses(channelId: string, gameId: string): Promise<Boss[]> {
    await this.ensureChannel(channelId);
    if (!this.data!.bosses[channelId][gameId]) return [];
    return Object.values(this.data!.bosses[channelId][gameId]);
  }
}

export const storage = new FileStorage();

// --- Routes Logic ---
export async function registerRoutes(app: Express): Promise<Server> {
  // Channel Endpoints
  app.get("/api/channels", async (req, res) => {
    try {
      const channels = await storage.getChannels();
      res.json(channels);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  app.post("/api/channels/:id", async (req, res) => {
    try {
      const channel = await storage.updateChannelName(req.params.id, req.body.name);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update channel" });
    }
  });

  app.delete("/api/channels/:id", async (req, res) => {
    try {
      await storage.deleteChannel(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });

  app.delete("/api/channels/:id/reset", async (req, res) => {
    try {
      await storage.resetChannelDeaths(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset channel deaths" });
    }
  });

  // Game Endpoints
  app.get("/api/setgame", async (req, res) => {
    const gameName = req.query.game as string;
    const channelId = (req.query.channel as string) || "default";
    if (!gameName) return res.status(400).type('text/plain').send("Usage: !setgame <game name>");
    try {
      const game = await storage.setActiveGame(channelId, gameName);
      res.type('text/plain').send(`Active game set to: ${game.name}. Death counter reset for this game.`);
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to set active game");
    }
  });

  app.get("/api/games", async (req, res) => {
    const channelId = (req.query.channel as string) || "default";
    try {
      const games = await storage.getGames(channelId);
      res.json(games);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch games" });
    }
  });

  // Uninstall Endpoints
  app.get("/api/uninstall", async (req, res) => {
    const program = req.query.program as string;
    const channelId = (req.query.channel as string) || "default";
    if (!program || typeof program !== 'string' || program.trim() === '') {
      return res.status(400).json({ error: "Program name is required" });
    }
    try {
      const result = await storage.incrementUninstallCount(channelId, program);
      const message = `Chat has requested to uninstall ${result.programName} ${result.count} ${result.count === 1 ? 'time' : 'times'}. Go ahead and do it already!`;
      res.type('text/plain').send(message);
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to process request");
    }
  });

  app.get("/api/uninstall/all", async (req, res) => {
    const channelId = (req.query.channel as string) || "default";
    try {
      const requests = await storage.getAllUninstallRequests(channelId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // Death Counter Endpoints
  app.get("/api/death", async (req, res) => {
    const bossName = req.query.boss as string;
    const channelId = (req.query.channel as string) || "default";
    try {
      const channel = await storage.getChannel(channelId);
      const game = await storage.getActiveGame(channelId);
      if (!game) return res.status(400).type('text/plain').send("No active game set. Use !setgame <game name>");
      const boss = await storage.incrementDeaths(channelId, bossName);
      res.type('text/plain').send(`${channel?.name || channelId} has died to ${boss.name} in ${game.name} ${boss.deathCount} ${boss.deathCount === 1 ? 'time' : 'times'}`);
    } catch (error: any) {
      res.status(400).type('text/plain').send(error.message || "Failed to record death");
    }
  });

  app.get("/api/deaths", async (req, res) => {
    const bossName = req.query.boss as string;
    const channelId = (req.query.channel as string) || "default";
    try {
      const channel = await storage.getChannel(channelId);
      const game = await storage.getActiveGame(channelId);
      if (!game) return res.status(400).type('text/plain').send("No active game set.");
      
      if (bossName) {
        const boss = await storage.getBoss(channelId, game.id, bossName);
        if (!boss) return res.type('text/plain').send(`No death records found for ${bossName} in ${game.name}`);
        
        if (boss.isBeaten) {
          return res.type('text/plain').send(`It took ${boss.finalDeathCount} attempts for ${channel?.name || channelId} to beat ${boss.name} in ${game.name}`);
        } else {
          return res.type('text/plain').send(`${channel?.name || channelId} has died to ${boss.name} ${boss.deathCount} times in ${game.name}`);
        }
      } else {
        const boss = await storage.getActiveBoss(channelId, game.id);
        if (!boss) return res.type('text/plain').send(`No active boss for ${game.name}.`);
        res.type('text/plain').send(`${channel?.name || channelId} has died to ${boss.name} ${boss.deathCount} times in ${game.name}`);
      }
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to fetch death records");
    }
  });

  app.get("/api/beaten", async (req, res) => {
    const bossName = req.query.boss as string;
    const channelId = (req.query.channel as string) || "default";
    try {
      const channel = await storage.getChannel(channelId);
      const game = await storage.getActiveGame(channelId);
      if (!game) return res.status(400).type('text/plain').send("No active game set.");
      const boss = await storage.markBeaten(channelId, bossName);
      res.type('text/plain').send(`It took ${boss.finalDeathCount} attempts for ${channel?.name || channelId} to beat ${boss.name} in ${game.name}`);
    } catch (error) {
      res.status(400).type('text/plain').send("No active boss found to mark as beaten.");
    }
  });

  app.get("/api/total-deaths", async (req, res) => {
    const channelId = (req.query.channel as string) || "default";
    try {
      const channel = await storage.getChannel(channelId);
      const game = await storage.getActiveGame(channelId);
      if (!game) return res.status(400).type('text/plain').send("No active game set.");
      const bosses = await storage.getAllBosses(channelId, game.id);
      const total = bosses.reduce((acc, b) => acc + b.deathCount, 0);
      res.type('text/plain').send(`${channel?.name || channelId} has died a total of ${total} times in ${game.name}`);
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to calculate total deaths");
    }
  });

  app.get("/api/setdeaths", async (req, res) => {
    const bossName = req.query.boss as string;
    const channelId = (req.query.channel as string) || "default";
    const count = parseInt(req.query.count as string);
    if (!bossName || isNaN(count)) {
      return res.status(400).type('text/plain').send("Usage: !setdeaths <boss name> <count>");
    }
    try {
      const boss = await storage.setDeaths(channelId, bossName, count);
      res.type('text/plain').send(`Death counter for ${boss.name} set to ${boss.deathCount}`);
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to update death counter");
    }
  });

  app.get("/api/bosses", async (req, res) => {
    const channelId = (req.query.channel as string) || "default";
    const gameId = req.query.game as string;
    if (!gameId) return res.json([]);
    try {
      const bosses = await storage.getAllBosses(channelId, gameId);
      res.json(bosses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bosses" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
