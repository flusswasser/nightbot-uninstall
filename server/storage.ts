import { type UninstallRequest } from "@shared/schema";
import * as fs from "fs/promises";
import * as path from "path";

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
    // File doesn't exist or is invalid JSON, start fresh
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

  async getUninstallRequest(
    programName: string
  ): Promise<UninstallRequest | undefined> {
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
