import { uninstallRequests, type UninstallRequest } from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike } from "drizzle-orm";

export interface IStorage {
  incrementUninstallCount(programName: string): Promise<UninstallRequest>;
  getAllUninstallRequests(): Promise<UninstallRequest[]>;
  getUninstallRequest(programName: string): Promise<UninstallRequest | undefined>;
  resetAllRequests(): Promise<void>;
  deleteRequest(programName: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async incrementUninstallCount(programName: string): Promise<UninstallRequest> {
    const trimmedName = programName.trim();
    
    // Try to find existing request (case-insensitive)
    const existing = await this.getUninstallRequest(trimmedName);
    
    if (existing) {
      // Increment existing count
      const [updated] = await db
        .update(uninstallRequests)
        .set({ count: existing.count + 1 })
        .where(eq(uninstallRequests.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new request
      const [newRequest] = await db
        .insert(uninstallRequests)
        .values({
          programName: trimmedName,
          count: 1,
        })
        .returning();
      return newRequest;
    }
  }

  async getAllUninstallRequests(): Promise<UninstallRequest[]> {
    const requests = await db
      .select()
      .from(uninstallRequests)
      .orderBy(desc(uninstallRequests.count));
    return requests;
  }

  async getUninstallRequest(programName: string): Promise<UninstallRequest | undefined> {
    const trimmedName = programName.trim();
    const requests = await db
      .select()
      .from(uninstallRequests)
      .where(ilike(uninstallRequests.programName, trimmedName));
    return requests[0] || undefined;
  }

  async resetAllRequests(): Promise<void> {
    await db.delete(uninstallRequests);
  }

  async deleteRequest(programName: string): Promise<boolean> {
    const trimmedName = programName.trim();
    const result = await db
      .delete(uninstallRequests)
      .where(ilike(uninstallRequests.programName, trimmedName))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
