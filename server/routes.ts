import { type UninstallRequest } from "@shared/schema";
import * as fs from "fs/promises";
import * as path from "path";
import type { Express } from "express";
import { createServer, type Server } from "http";

// --- Storage Logic ---
export interface IStorage {
  incrementUninstallCount(programName: string): Promise<UninstallRequest>;
  getAllUninstallRequests(): Promise<UninstallRequest[]>;
  getUninstallRequest(programName: string): Promise<UninstallRequest | undefined>;
  resetAllRequests(): Promise<void>;
  deleteRequest(programName: string): Promise<boolean>;
}

const DATA_FILE = path.join(process.cwd(), "data.json");

async function readData(): Promise<Map<string, UninstallRequest>> {
  try {
    const content = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(content) as Record<string, UninstallRequest>;
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

async function writeData(data: Map<string, UninstallRequest>): Promise<void> {
  const obj = Object.fromEntries(data);
  await fs.writeFile(DATA_FILE, JSON.stringify(obj, null, 2));
}

export class FileStorage implements IStorage {
  private data: Map<string, UninstallRequest> | null = null;

  private async ensureLoaded(): Promise<void> {
    if (this.data === null) {
      this.data = await readData();
    }
  }

  async incrementUninstallCount(programName: string): Promise<UninstallRequest> {
    await this.ensureLoaded();
    const normalizedName = programName.toLowerCase().trim();
    const existing = this.data!.get(normalizedName);

    if (existing) {
      existing.count++;
      this.data!.set(normalizedName, existing);
    } else {
      const newRequest: UninstallRequest = {
        id: crypto.randomUUID(),
        programName: programName.trim(),
        count: 1,
      };
      this.data!.set(normalizedName, newRequest);
    }

    await writeData(this.data!);
    return this.data!.get(normalizedName)!;
  }

  async getAllUninstallRequests(): Promise<UninstallRequest[]> {
    await this.ensureLoaded();
    return Array.from(this.data!.values()).sort((a, b) => b.count - a.count);
  }

  async getUninstallRequest(programName: string): Promise<UninstallRequest | undefined> {
    await this.ensureLoaded();
    const normalizedName = programName.toLowerCase().trim();
    return this.data!.get(normalizedName);
  }

  async resetAllRequests(): Promise<void> {
    await this.ensureLoaded();
    this.data!.clear();
    await writeData(this.data!);
  }

  async deleteRequest(programName: string): Promise<boolean> {
    await this.ensureLoaded();
    const normalizedName = programName.toLowerCase().trim();
    const deleted = this.data!.delete(normalizedName);
    if (deleted) {
      await writeData(this.data!);
    }
    return deleted;
  }
}

export const storage = new FileStorage();

// --- Routes Logic ---
export async function registerRoutes(app: Express): Promise<Server> {
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

  app.delete("/api/uninstall/reset", async (req, res) => {
    try {
      await storage.resetAllRequests();
      res.json({ success: true, message: "All requests reset" });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset requests" });
    }
  });

  app.delete("/api/uninstall/:programName", async (req, res) => {
    const programName = req.params.programName;
    if (!programName || programName.trim() === '') {
      return res.status(400).json({ error: "Program name is required" });
    }

    try {
      const deleted = await storage.deleteRequest(decodeURIComponent(programName));
      if (deleted) {
        res.json({ success: true, message: "Request deleted" });
      } else {
        res.status(404).json({ error: "Request not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete request" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
