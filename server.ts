import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { AutomationService, AutomationLogEntry, VerificationStatus } from "./server/services/automation.service.js";
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize PostgreSQL Pool
// It will only connect if DATABASE_URL is provided in the environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

if (process.env.DATABASE_URL) {
  console.log("✅ DATABASE_URL is configured.");
} else {
  console.log("⚠️ DATABASE_URL is NOT configured. API will return empty arrays.");
}

interface ApplicationData {
  jobId: string;
  candidateId: string;
  status: string;
  logs?: AutomationLogEntry[];
  verification?: VerificationStatus;
  applicationId?: string;
  strategy?: string;
  updatedAt: string;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory storage for applications (simulating a database)
  const applications: ApplicationData[] = [
    { jobId: '1', candidateId: 'can1', status: 'Applied', updatedAt: new Date().toISOString() },
    { jobId: '2', candidateId: 'can2', status: 'Saved', updatedAt: new Date().toISOString() }
  ];

  // API routes
  app.get("/api/companies", async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.json([]); // Return empty if no DB connected yet
      }
      const result = await pool.query('SELECT * FROM companies ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (error) {
      console.error("[DB Error] Fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/jobs", async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.json([]);
      }
      const result = await pool.query(`
        SELECT j.*, c.name as company_name 
        FROM jobs j 
        JOIN companies c ON j.company_id = c.id 
        ORDER BY j.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("[DB Error] Fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.post("/api/webhook/scraper", async (req, res) => {
    const { fuente, titulo, empresa, url_postulacion } = req.body;
    
    if (!empresa || !titulo || !url_postulacion) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      if (!process.env.DATABASE_URL) {
        return res.status(503).json({ error: "Database not configured yet" });
      }

      // 1. Upsert Company
      const slug = empresa.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const companyResult = await pool.query(`
        INSERT INTO companies (name, slug, enrichment_status) 
        VALUES ($1, $2, 'pending')
        ON CONFLICT (slug) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `, [empresa, slug]);
      
      const companyId = companyResult.rows[0].id;

      // 2. Insert Job
      await pool.query(`
        INSERT INTO jobs (company_id, title, source, url)
        VALUES ($1, $2, $3, $4)
      `, [companyId, titulo, fuente || 'other', url_postulacion]);

      res.json({ success: true, message: "Job and company processed successfully" });
    } catch (error) {
      console.error("[Webhook Error]:", error);
      res.status(500).json({ error: "Internal server error processing webhook" });
    }
  });

  app.patch("/api/companies/:id", async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(503).json({ error: "Database not configured yet" });
      }

      const setClause = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');
      
      const values = Object.values(updates);
      
      await pool.query(`
        UPDATE companies 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP, enriched_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [id, ...values]);

      res.json({ success: true });
    } catch (error) {
      console.error("[DB Error] Updating company:", error);
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.post("/api/apply/auto", async (req, res) => {
    const { job, candidate } = req.body;
    
    if (!job || !candidate) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing job or candidate data for automation." 
      });
    }

    console.log(`[Backend] Auto-Apply triggered for ${candidate.name} at ${job.companyName}`);

    try {
      // Execute the 3-layer automation logic on the backend
      const result = await AutomationService.executeApplication(job, candidate);
      
      // Update or create application record
      const appIndex = applications.findIndex(
        app => app.jobId === job.id && app.candidateId === candidate.id
      );

      let status = 'Failed';
      if (result.success) {
        status = 'Applied';
      } else if (result.requiresExtension) {
        status = 'Needs Extension';
      }

      const appData: ApplicationData = {
        jobId: job.id,
        candidateId: candidate.id,
        status: status,
        logs: result.logs,
        verification: result.verification,
        applicationId: result.applicationId,
        strategy: result.strategy,
        updatedAt: new Date().toISOString()
      };

      if (appIndex !== -1) {
        applications[appIndex] = appData;
      } else {
        applications.push(appData);
      }

      res.json(result);
    } catch (error) {
      console.error("[Automation Error]", error);
      res.status(500).json({
        success: false,
        message: "An internal error occurred during automation."
      });
    }
  });

  app.post("/api/apply", (req, res) => {
    const { jobId, candidateId, notes } = req.body;
    
    console.log(`Application received for Job: ${jobId}, Candidate: ${candidateId}`);
    
    if (!jobId || !candidateId) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: jobId or candidateId" 
      });
    }

    // Check for duplicates
    const appIndex = applications.findIndex(
      app => app.jobId === jobId && app.candidateId === candidateId
    );

    if (appIndex !== -1 && applications[appIndex].status === 'Applied') {
      return res.status(400).json({
        success: false,
        message: "This candidate has already been submitted for this job."
      });
    }

    const appData: ApplicationData = {
      jobId,
      candidateId,
      status: 'Applied',
      updatedAt: new Date().toISOString()
    };

    if (appIndex !== -1) {
      applications[appIndex] = appData;
    } else {
      applications.push(appData);
    }

    // Simulate success
    setTimeout(() => {
      res.json({ 
        success: true, 
        message: "Application submitted successfully! The candidate has been added to the pipeline." 
      });
    }, 1000);
  });

  app.patch("/api/apply/status", (req, res) => {
    const { jobId, candidateId, status } = req.body;
    
    if (!jobId || !candidateId || !status) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: jobId, candidateId, or status" 
      });
    }

    // Find the application
    const appIndex = applications.findIndex(
      app => app.jobId === jobId && app.candidateId === candidateId
    );

    if (appIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Application not found."
      });
    }

    // Update status
    applications[appIndex].status = status;
    applications[appIndex].updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: `Status updated to ${status} successfully.`
    });
  });

  app.get("/api/apply/status", (req, res) => {
    const { jobId, candidateId } = req.query;
    
    if (!jobId || !candidateId) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing jobId or candidateId" 
      });
    }

    const application = applications.find(
      app => app.jobId === jobId && app.candidateId === candidateId
    );

    if (application) {
      res.json({ 
        success: true, 
        status: application.status,
        logs: application.logs,
        verification: application.verification,
        applicationId: application.applicationId,
        strategy: application.strategy,
        updatedAt: application.updatedAt
      });
    } else {
      res.json({ success: true, status: 'Saved' }); // Default if no application yet
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
