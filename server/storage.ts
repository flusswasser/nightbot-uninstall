import { uninstallRequests, type UninstallRequest } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";

export interface IStorage {
  incrementUninstallCount(programName: string): Promise<UninstallRequest>;
  getAllUninstallRequests(): Promise<UninstallRequest[]>;
  getUninstallRequest(programName: string): Promise<UninstallRequest | undefined>;
  resetAllRequests(): Promise<void>;
  deleteRequest(programName: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async incrementUninstallCount(programName: string): Promise<UninstallRequest> {
    const normalizedName = programName.toLowerCase().trim();
    
    // Try to find existing request
    const existing = await this.getUninstallRequest(programName);
    
    if (existing) {
      // Increment existing count
      const [updated] = await db
        .update(uninstallRequests)
        .set({ count: sql`${uninstallRequests.count} + 1` })
        .where(eq(uninstallRequests.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new request
      const [newRequest] = await db
        .insert(uninstallRequests)
        .values({
          programName: programName.trim(),
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
      .orderBy(sql`${uninstallRequests.count} DESC`);
    return requests;
  }

  async getUninstallRequest(programName: string): Promise<UninstallRequest | undefined> {
    const normalizedName = programName.toLowerCase().trim();
    const [request] = await db
      .select()
      .from(uninstallRequests)
      .where(sql`LOWER(TRIM(${uninstallRequests.programName})) = ${normalizedName}`);
    return request || undefined;
  }

  async resetAllRequests(): Promise<void> {
    await db.delete(uninstallRequests);
  }

  async deleteRequest(programName: string): Promise<boolean> {
    const normalizedName = programName.toLowerCase().trim();
    const result = await db
      .delete(uninstallRequests)
      .where(sql`LOWER(TRIM(${uninstallRequests.programName})) = ${normalizedName}`)
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
