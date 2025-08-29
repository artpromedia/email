import { SendMailRequest } from '@ceerion/shared';
import { Telemetry } from '@ceerion/observability';
import { DatabaseAdapter } from '../db/adapter.js';

export interface QueuedJob {
  id: string;
  type: string;
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  attempts: number;
  maxAttempts: number;
  scheduleAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class QueueService {
  constructor(
    private db: DatabaseAdapter,
    private redis: any,
    private telemetry: Telemetry
  ) {}

  async enqueueEmail(
    request: SendMailRequest, 
    userId: string, 
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<{ messageId: string; queueId: string }> {
    const messageId = this.generateMessageId();
    const queueId = this.generateQueueId();
    
    const priorityMap = { low: 1, normal: 5, high: 10 };
    
    const job: Partial<QueuedJob> = {
      id: queueId,
      type: 'send_email',
      payload: {
        ...request,
        userId,
        messageId
      },
      status: 'pending',
      priority: priorityMap[priority],
      attempts: 0,
      maxAttempts: 3,
      scheduleAt: request.scheduleAt,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Store in database
    const query = `
      INSERT INTO mail_queue (id, type, payload, status, priority, attempts, max_attempts, schedule_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    
    await this.db.query(query, [
      job.id,
      job.type,
      JSON.stringify(job.payload),
      job.status,
      job.priority,
      job.attempts,
      job.maxAttempts,
      job.scheduleAt,
      job.createdAt,
      job.updatedAt
    ]);

    // Add to Redis queue for immediate processing
    if (!request.scheduleAt || request.scheduleAt <= new Date()) {
      await this.redis.lpush('mail_queue', JSON.stringify(job));
    }

    return { messageId, queueId };
  }

  async getQueueStatus(queueId: string): Promise<QueuedJob | null> {
    const query = `
      SELECT * FROM mail_queue WHERE id = $1
    `;
    
    const result = await this.db.query(query, [queueId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      status: row.status,
      priority: row.priority,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      scheduleAt: row.schedule_at ? new Date(row.schedule_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async updateJobStatus(queueId: string, status: QueuedJob['status'], error?: string): Promise<void> {
    const query = `
      UPDATE mail_queue 
      SET status = $1, updated_at = NOW(), error_message = $2
      WHERE id = $3
    `;
    
    await this.db.query(query, [status, error, queueId]);
  }

  async retryJob(queueId: string): Promise<void> {
    const query = `
      UPDATE mail_queue 
      SET status = 'pending', attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1 AND attempts < max_attempts
    `;
    
    const result = await this.db.query(query, [queueId]);
    
    if (result.rowCount > 0) {
      // Get the updated job and add back to Redis queue
      const job = await this.getQueueStatus(queueId);
      if (job) {
        await this.redis.lpush('mail_queue', JSON.stringify(job));
      }
    }
  }

  private generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `${timestamp}-${random}@ceerion.com`;
  }

  private generateQueueId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
}
