import { type UninstallRequest, type Boss, type Player } from "@shared/schema";
import * as fs from "fs/promises";
import * as path from "path";
import type { Express } from "express";
import { createServer, type Server } from "http";

// --- Storage Logic ---
export interface IStorage {
  // Uninstall Requests
  incrementUninstallCount(programName: string): Promise<UninstallRequest>;
  getAllUninstallRequests(): Promise<UninstallRequest[]>;
  getUninstallRequest(programName: string): Promise<UninstallRequest | undefined>;
  resetAllRequests(): Promise<void>;
  deleteRequest(programName: string): Promise<boolean>;

  // Players
  getPlayers(): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | undefined>;
  updatePlayerName(id: string, name: string): Promise<Player>;
  resetPlayerDeaths(id: string): Promise<void>;

  // Death Counter
  getBoss(name: string, playerId: string): Promise<Boss | undefined>;
  getActiveBoss(playerId: string): Promise<Boss | undefined>;
  upsertBoss(name: string, playerId: string): Promise<Boss>;
  incrementDeaths(playerId: string, bossName?: string): Promise<Boss>;
  setDeaths(playerId: string, bossName: string, count: number): Promise<Boss>;
  markBeaten(playerId: string, bossName?: string): Promise<Boss>;
  getAllBosses(playerId: string): Promise<Boss[]>;
}

const DATA_FILE = path.join(process.cwd(), "data.json");

interface DataStructure {
  uninstallRequests: Record<string, UninstallRequest>;
  bosses: Record<string, Boss>;
  players: Record<string, Player>;
}

async function readData(): Promise<DataStructure> {
  try {
    const content = await fs.readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(content) as DataStructure;
    if (!parsed.players) {
      parsed.players = {
        "default": { id: "default", name: "Mango", isDefault: true }
      };
    }
    return parsed;
  } catch {
    return { 
      uninstallRequests: {}, 
      bosses: {}, 
      players: { 
        "default": { id: "default", name: "Mango", isDefault: true } 
      } 
    };
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

  // Uninstall Requests
  async incrementUninstallCount(programName: string): Promise<UninstallRequest> {
    await this.ensureLoaded();
    const normalizedName = programName.toLowerCase().trim();
    const existing = this.data!.uninstallRequests[normalizedName];

    if (existing) {
      existing.count++;
      this.data!.uninstallRequests[normalizedName] = existing;
    } else {
      const newRequest: UninstallRequest = {
        id: crypto.randomUUID(),
        programName: programName.trim(),
        count: 1,
      };
      this.data!.uninstallRequests[normalizedName] = newRequest;
    }

    await writeData(this.data!);
    return this.data!.uninstallRequests[normalizedName];
  }

  async getAllUninstallRequests(): Promise<UninstallRequest[]> {
    await this.ensureLoaded();
    return Object.values(this.data!.uninstallRequests).sort((a, b) => b.count - a.count);
  }

  async getUninstallRequest(programName: string): Promise<UninstallRequest | undefined> {
    await this.ensureLoaded();
    return this.data!.uninstallRequests[programName.toLowerCase().trim()];
  }

  async resetAllRequests(): Promise<void> {
    await this.ensureLoaded();
    this.data!.uninstallRequests = {};
    await writeData(this.data!);
  }

  async deleteRequest(programName: string): Promise<boolean> {
    await this.ensureLoaded();
    const normalizedName = programName.toLowerCase().trim();
    if (this.data!.uninstallRequests[normalizedName]) {
      delete this.data!.uninstallRequests[normalizedName];
      await writeData(this.data!);
      return true;
    }
    return false;
  }

  // Players
  async getPlayers(): Promise<Player[]> {
    await this.ensureLoaded();
    return Object.values(this.data!.players);
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    await this.ensureLoaded();
    return this.data!.players[id];
  }

  async updatePlayerName(id: string, name: string): Promise<Player> {
    await this.ensureLoaded();
    if (!this.data!.players[id]) {
      this.data!.players[id] = { id, name, isDefault: false };
    } else {
      this.data!.players[id].name = name;
    }
    await writeData(this.data!);
    return this.data!.players[id];
  }

  async resetPlayerDeaths(id: string): Promise<void> {
    await this.ensureLoaded();
    const bossesToDelete = Object.keys(this.data!.bosses).filter(key => this.data!.bosses[key].playerId === id);
    bossesToDelete.forEach(key => delete this.data!.bosses[key]);
    await writeData(this.data!);
  }

  // Death Counter
  async getBoss(name: string, playerId: string): Promise<Boss | undefined> {
    await this.ensureLoaded();
    return Object.values(this.data!.bosses).find(b => b.name.toLowerCase().trim() === name.toLowerCase().trim() && b.playerId === playerId);
  }

  async getActiveBoss(playerId: string): Promise<Boss | undefined> {
    await this.ensureLoaded();
    return Object.values(this.data!.bosses).find(b => !b.isBeaten && b.playerId === playerId);
  }

  async upsertBoss(name: string, playerId: string): Promise<Boss> {
    await this.ensureLoaded();
    const normalizedName = `${playerId}_${name.toLowerCase().trim()}`;
    if (!this.data!.bosses[normalizedName]) {
      this.data!.bosses[normalizedName] = {
        id: crypto.randomUUID(),
        name: name.trim(),
        isBeaten: false,
        deathCount: 0,
        finalDeathCount: null,
        playerId
      };
      await writeData(this.data!);
    }
    return this.data!.bosses[normalizedName];
  }

  async incrementDeaths(playerId: string, bossName?: string): Promise<Boss> {
    await this.ensureLoaded();
    let boss: Boss | undefined;
    if (bossName) {
      boss = await this.upsertBoss(bossName, playerId);
    } else {
      boss = await this.getActiveBoss(playerId);
    }

    if (!boss) throw new Error("No active boss and no boss name provided");

    boss.deathCount++;
    const key = `${playerId}_${boss.name.toLowerCase().trim()}`;
    this.data!.bosses[key] = boss;
    await writeData(this.data!);
    return boss;
  }

  async setDeaths(playerId: string, bossName: string, count: number): Promise<Boss> {
    await this.ensureLoaded();
    const boss = await this.upsertBoss(bossName, playerId);
    boss.deathCount = count;
    const key = `${playerId}_${boss.name.toLowerCase().trim()}`;
    this.data!.bosses[key] = boss;
    await writeData(this.data!);
    return boss;
  }

  async markBeaten(playerId: string, bossName?: string): Promise<Boss> {
    await this.ensureLoaded();
    let boss: Boss | undefined;
    if (bossName) {
      boss = await this.getBoss(bossName, playerId);
    } else {
      boss = await this.getActiveBoss(playerId);
    }

    if (!boss) throw new Error("Boss not found");

    boss.isBeaten = true;
    boss.finalDeathCount = boss.deathCount;
    const key = `${playerId}_${boss.name.toLowerCase().trim()}`;
    this.data!.bosses[key] = boss;
    await writeData(this.data!);
    return boss;
  }

  async getAllBosses(playerId: string): Promise<Boss[]> {
    await this.ensureLoaded();
    return Object.values(this.data!.bosses).filter(b => b.playerId === playerId);
  }
}

export const storage = new FileStorage();

// --- Routes Logic ---
export async function registerRoutes(app: Express): Promise<Server> {
  // Player Endpoints
  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  app.post("/api/players/:id", async (req, res) => {
    try {
      const player = await storage.updatePlayerName(req.params.id, req.body.name);
      res.json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to update player" });
    }
  });

  app.delete("/api/players/:id/reset", async (req, res) => {
    try {
      await storage.resetPlayerDeaths(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset player deaths" });
    }
  });

  // Uninstall Endpoints
  app.get("/api/uninstall", async (req, res) => {
    const program = req.query.program as string;
    if (!program || typeof program !== 'string' || program.trim() === '') {
      return res.status(400).json({ error: "Program name is required" });
    }
    try {
      const result = await storage.incrementUninstallCount(program);
      const message = `Chat has requested to uninstall ${result.programName} ${result.count} ${result.count === 1 ? 'time' : 'times'}. Go ahead and do it already!`;
      res.type('text/plain').send(message);
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to process request");
    }
  });

  app.get("/api/uninstall/all", async (req, res) => {
    try {
      const requests = await storage.getAllUninstallRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // Death Counter Endpoints
  app.get("/api/death", async (req, res) => {
    const bossName = req.query.boss as string;
    const playerToken = (req.query.player as string) || "default";
    try {
      const player = await storage.getPlayer(playerToken);
      const boss = await storage.incrementDeaths(playerToken, bossName);
      res.type('text/plain').send(`${player?.name || "Player"} has died to ${boss.name} ${boss.deathCount} ${boss.deathCount === 1 ? 'time' : 'times'}`);
    } catch (error) {
      res.status(400).type('text/plain').send("No active boss found. Use !death <boss name> to start tracking.");
    }
  });

  app.get("/api/deaths", async (req, res) => {
    const bossName = req.query.boss as string;
    const playerToken = (req.query.player as string) || "default";
    try {
      const player = await storage.getPlayer(playerToken);
      if (bossName) {
        const boss = await storage.getBoss(bossName, playerToken);
        if (!boss) return res.type('text/plain').send(`No death records found for ${bossName}`);
        
        if (boss.isBeaten) {
          return res.type('text/plain').send(`It took ${boss.finalDeathCount} attempts for ${player?.name || "Player"} to beat ${boss.name}`);
        } else {
          return res.type('text/plain').send(`${player?.name || "Player"} has died to ${boss.name} ${boss.deathCount} times`);
        }
      } else {
        const boss = await storage.getActiveBoss(playerToken);
        if (!boss) return res.type('text/plain').send("No active boss is currently being tracked.");
        res.type('text/plain').send(`${player?.name || "Player"} has died to ${boss.name} ${boss.deathCount} times`);
      }
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to fetch death records");
    }
  });

  app.get("/api/beaten", async (req, res) => {
    const bossName = req.query.boss as string;
    const playerToken = (req.query.player as string) || "default";
    try {
      const player = await storage.getPlayer(playerToken);
      const boss = await storage.markBeaten(playerToken, bossName);
      res.type('text/plain').send(`It took ${boss.finalDeathCount} attempts for ${player?.name || "Player"} to beat ${boss.name}`);
    } catch (error) {
      res.status(400).type('text/plain').send("No active boss found to mark as beaten.");
    }
  });

  app.get("/api/total-deaths", async (req, res) => {
    const playerToken = (req.query.player as string) || "default";
    try {
      const player = await storage.getPlayer(playerToken);
      const bosses = await storage.getAllBosses(playerToken);
      const total = bosses.reduce((acc, b) => acc + b.deathCount, 0);
      res.type('text/plain').send(`${player?.name || "Player"} has died a total of ${total} times across all bosses`);
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to calculate total deaths");
    }
  });

  app.get("/api/setdeaths", async (req, res) => {
    const bossName = req.query.boss as string;
    const playerToken = (req.query.player as string) || "default";
    const count = parseInt(req.query.count as string);
    if (!bossName || isNaN(count)) {
      return res.status(400).type('text/plain').send("Usage: !setdeaths <boss name> <count>");
    }
    try {
      const boss = await storage.setDeaths(playerToken, bossName, count);
      res.type('text/plain').send(`Death counter for ${boss.name} set to ${boss.deathCount}`);
    } catch (error) {
      res.status(500).type('text/plain').send("Failed to update death counter");
    }
  });

  app.get("/api/bosses", async (req, res) => {
    const playerToken = (req.query.player as string) || "default";
    try {
      const bosses = await storage.getAllBosses(playerToken);
      res.json(bosses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bosses" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
