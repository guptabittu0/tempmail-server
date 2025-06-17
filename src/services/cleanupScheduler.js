const cron = require('cron');
const EmailService = require('./emailService');
const TempEmail = require('../models/TempEmail');
const Email = require('../models/Email');

class CleanupScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('Cleanup scheduler is already running');
      return;
    }

    const cleanupInterval = process.env.CLEANUP_INTERVAL_MINUTES || 60;
    const cronPattern = `*/${cleanupInterval} * * * *`; // Every N minutes

    console.log(`Starting cleanup scheduler with pattern: ${cronPattern}`);

    // Main cleanup job
    const cleanupJob = new cron.CronJob(cronPattern, async () => {
      await this.performCleanup();
    });

    // Daily statistics job (runs at midnight)
    const statsJob = new cron.CronJob('0 0 * * *', async () => {
      await this.generateDailyStats();
    });

    // Weekly maintenance job (runs every Sunday at 2 AM)
    const maintenanceJob = new cron.CronJob('0 2 * * 0', async () => {
      await this.performMaintenance();
    });

    this.jobs.set('cleanup', cleanupJob);
    this.jobs.set('stats', statsJob);
    this.jobs.set('maintenance', maintenanceJob);

    // Start all jobs
    for (const [name, job] of this.jobs) {
      job.start();
      console.log(`Started ${name} job`);
    }

    this.isRunning = true;
    console.log('Cleanup scheduler started successfully');
  }

  stop() {
    if (!this.isRunning) {
      console.log('Cleanup scheduler is not running');
      return;
    }

    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`Stopped ${name} job`);
    }

    this.jobs.clear();
    this.isRunning = false;
    console.log('Cleanup scheduler stopped');
  }

  async performCleanup() {
    try {
      console.log('Starting scheduled cleanup...');
      const startTime = Date.now();

      const result = await EmailService.cleanupExpiredEmails();
      
      const duration = Date.now() - startTime;
      
      console.log(`Cleanup completed in ${duration}ms:`, {
        deletedEmails: result.deletedEmails,
        deletedTempEmails: result.deletedTempEmails
      });

      return result;
    } catch (error) {
      console.error('Error during scheduled cleanup:', error);
      throw error;
    }
  }

  async generateDailyStats() {
    try {
      console.log('Generating daily statistics...');

      const tempEmailStats = await TempEmail.getStats();
      const emailStats = await Email.getStats();

      const stats = {
        timestamp: new Date().toISOString(),
        tempEmails: tempEmailStats,
        emails: emailStats,
        date: new Date().toISOString().split('T')[0]
      };

      console.log('Daily stats:', stats);

      // Here you could save stats to a file or send to monitoring service
      // await this.saveStatsToFile(stats);
      
      return stats;
    } catch (error) {
      console.error('Error generating daily stats:', error);
      throw error;
    }
  }

  async performMaintenance() {
    try {
      console.log('Performing weekly maintenance...');

      // Cleanup very old records (older than configured retention + buffer)
      const extendedRetentionHours = (parseInt(process.env.EMAIL_RETENTION_HOURS) || 24) * 7; // 7x normal retention
      
      const veryOldEmails = await Email.cleanup(extendedRetentionHours);
      const veryOldTempEmails = await TempEmail.cleanup();

      // You could add more maintenance tasks here:
      // - Database vacuum/analyze
      // - Log rotation
      // - Disk cleanup
      // - Performance monitoring

      console.log(`Weekly maintenance completed:`, {
        veryOldEmailsDeleted: veryOldEmails,
        veryOldTempEmailsDeleted: veryOldTempEmails
      });

      return {
        veryOldEmailsDeleted: veryOldEmails,
        veryOldTempEmailsDeleted: veryOldTempEmails
      };
    } catch (error) {
      console.error('Error during weekly maintenance:', error);
      throw error;
    }
  }

  async runCleanupNow() {
    console.log('Running cleanup manually...');
    return await this.performCleanup();
  }

  async getSchedulerStatus() {
    const status = {
      isRunning: this.isRunning,
      jobs: {}
    };

    for (const [name, job] of this.jobs) {
      status.jobs[name] = {
        running: job.running,
        lastDate: job.lastDate(),
        nextDate: job.nextDate()
      };
    }

    return status;
  }

  // Optional: Save stats to file for historical tracking
  async saveStatsToFile(stats) {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const statsDir = path.join(process.cwd(), 'stats');
      
      // Create stats directory if it doesn't exist
      try {
        await fs.access(statsDir);
      } catch {
        await fs.mkdir(statsDir, { recursive: true });
      }

      const filename = `stats-${stats.date}.json`;
      const filepath = path.join(statsDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(stats, null, 2));
      console.log(`Stats saved to: ${filepath}`);
    } catch (error) {
      console.error('Error saving stats to file:', error);
    }
  }

  // Method to add custom cleanup tasks
  addCustomJob(name, cronPattern, taskFunction) {
    if (this.jobs.has(name)) {
      throw new Error(`Job with name '${name}' already exists`);
    }

    const customJob = new cron.CronJob(cronPattern, taskFunction);
    this.jobs.set(name, customJob);

    if (this.isRunning) {
      customJob.start();
      console.log(`Started custom job: ${name}`);
    }

    return customJob;
  }

  removeCustomJob(name) {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
      console.log(`Removed custom job: ${name}`);
      return true;
    }
    return false;
  }
}

// Singleton instance
const cleanupScheduler = new CleanupScheduler();

module.exports = cleanupScheduler; 