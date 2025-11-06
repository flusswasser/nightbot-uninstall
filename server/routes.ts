import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

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
