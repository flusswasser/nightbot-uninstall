import { type UninstallRequest } from "@shared/schema";

export interface IStorage {
  incrementUninstallCount(programName: string): Promise<UninstallRequest>;
  getAllUninstallRequests(): Promise<UninstallRequest[]>;
  getUninstallRequest(programName: string): Promise<UninstallRequest | undefined>;
  resetAllRequests(): Promise<void>;
  deleteRequest(programName: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private requests: Map<string, UninstallRequest>;

  constructor() {
    this.requests = new Map();
  }

  async incrementUninstallCount(programName: string): Promise<UninstallRequest> {
    const normalizedName = programName.toLowerCase().trim();
    const existing = this.requests.get(normalizedName);
    
    if (existing) {
      existing.count++;
      this.requests.set(normalizedName, existing);
      return existing;
    } else {
      const newRequest: UninstallRequest = {
        id: crypto.randomUUID(),
        programName: programName.trim(),
        count: 1,
      };
      this.requests.set(normalizedName, newRequest);
      return newRequest;
    }
  }

  async getAllUninstallRequests(): Promise<UninstallRequest[]> {
    return Array.from(this.requests.values()).sort((a, b) => b.count - a.count);
  }

  async getUninstallRequest(programName: string): Promise<UninstallRequest | undefined> {
    const normalizedName = programName.toLowerCase().trim();
    return this.requests.get(normalizedName);
  }

  async resetAllRequests(): Promise<void> {
    this.requests.clear();
  }

  async deleteRequest(programName: string): Promise<boolean> {
    const normalizedName = programName.toLowerCase().trim();
    return this.requests.delete(normalizedName);
  }
}

export const storage = new MemStorage();
