import {
  defaultJobOptions,
  OutboxPayloadSchema,
  QueueName,
  type QueueName as QueueNameType
} from '@cherryfin/schemas/jobs';
import {
  Queue,
  Worker,
  type ConnectionOptions
} from 'bullmq';
import postgres from 'postgres';
import { loadWorkerConfig } from './config.js';
import { createAttachmentProcessor } from './processor.js';
import { WorkerObjectStorage } from './storage.js';

interface OutboxRow {
  id: string;
  topic: string;
  queue_name: string;
  aggregate_type: string;
  aggregate_id: string;
  trace_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  const connection: ConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number.isFinite(database) ? database : 0
  };

  if (url.username) {
    connection.username = decodeURIComponent(url.username);
  }
  if (url.password) {
    connection.password = decodeURIComponent(url.password);
  }
  if (url.protocol === 'rediss:') {
    connection.tls = {};
  }

  return connection;
}

const allowedQueues = new Set<QueueNameType>(Object.values(QueueName));
const config = loadWorkerConfig();
const sql = postgres(config.DATABASE_URL, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false
});
const connection = redisConnection(config.REDIS_URL);
const queues = new Map<QueueNameType, Queue>();
const storage = new WorkerObjectStorage(config);
const attachmentWorker = new Worker(
  QueueName.attachments,
  createAttachmentProcessor(config, storage),
  {
    connection,
    concurrency: config.ATTACHMENT_CONCURRENCY,
    lockDuration: 180_000
  }
);
let dispatching = false;
let stopping = false;

attachmentWorker.on('completed', (job) => {
  console.info(
    JSON.stringify({
      level: 'info',
      event: 'attachment_job.completed',
      jobId: job.id
    })
  );
});
attachmentWorker.on('failed', (job, error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'attachment_job.failed',
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    })
  );
});

function queueFor(name: string): Queue {
  if (!allowedQueues.has(name as QueueNameType)) {
    throw new Error(`Unknown outbox queue: ${name}`);
  }

  const queueName = name as QueueNameType;
  const existing = queues.get(queueName);
  if (existing) {
    return existing;
  }

  const queue = new Queue(queueName, {
    connection,
    defaultJobOptions
  });
  queues.set(queueName, queue);
  return queue;
}

async function claimBatch(): Promise<OutboxRow[]> {
  const rows = await sql<OutboxRow[]>`
    with candidates as (
      select id
      from outbox_events
      where (status = 'pending'
          or (status = 'processing' and locked_at < now() - interval '5 minutes'))
        and available_at <= now()
      order by created_at
      for update skip locked
      limit ${config.OUTBOX_BATCH_SIZE}
    )
    update outbox_events as event
    set status = 'processing',
        locked_at = now(),
        updated_at = now()
    from candidates
    where event.id = candidates.id
    returning
      event.id,
      event.topic,
      event.queue_name,
      event.aggregate_type,
      event.aggregate_id,
      event.trace_id,
      event.payload,
      event.attempts
  `;
  return [...rows];
}

async function markDispatched(eventId: string): Promise<void> {
  await sql`
    update outbox_events
    set status = 'dispatched',
        dispatched_at = now(),
        locked_at = null,
        last_error = null,
        updated_at = now()
    where id = ${eventId}
  `;
}

async function markFailed(event: OutboxRow, error: unknown): Promise<void> {
  const nextAttempts = event.attempts + 1;
  const terminal = nextAttempts >= 5;
  const message = error instanceof Error ? error.message : 'Unknown dispatch error';

  await sql`
    update outbox_events
    set status = ${terminal ? 'failed' : 'pending'},
        attempts = ${nextAttempts},
        available_at = now() + interval '5 seconds',
        locked_at = null,
        last_error = ${message.slice(0, 2_000)},
        updated_at = now()
    where id = ${event.id}
  `;
}

async function dispatchOnce(): Promise<void> {
  if (dispatching || stopping) {
    return;
  }
  dispatching = true;

  try {
    const events = await claimBatch();
    for (const event of events) {
      try {
        const payload = OutboxPayloadSchema.parse({
          eventId: event.id,
          topic: event.topic,
          aggregateType: event.aggregate_type,
          aggregateId: event.aggregate_id,
          ...(event.trace_id ? { traceId: event.trace_id } : {}),
          payload: event.payload
        });

        await queueFor(event.queue_name).add(event.topic, payload, {
          jobId: `outbox_${event.id}`
        });
        await markDispatched(event.id);
        console.info(
          JSON.stringify({
            level: 'info',
            event: 'outbox.dispatched',
            eventId: event.id,
            topic: event.topic,
            queue: event.queue_name,
            traceId: event.trace_id
          })
        );
      } catch (error) {
        await markFailed(event, error);
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'outbox.dispatch_failed',
            eventId: event.id,
            topic: event.topic,
            error: error instanceof Error ? error.message : String(error)
          })
        );
      }
    }
  } finally {
    dispatching = false;
  }
}

const interval = setInterval(() => {
  void dispatchOnce().catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'outbox.poll_failed',
        error: error instanceof Error ? error.message : String(error)
      })
    );
  });
}, config.OUTBOX_POLL_INTERVAL_MS);

await dispatchOnce();
console.info(
  JSON.stringify({
    level: 'info',
    event: 'worker.started',
    pollIntervalMs: config.OUTBOX_POLL_INTERVAL_MS,
    batchSize: config.OUTBOX_BATCH_SIZE,
    attachmentConcurrency: config.ATTACHMENT_CONCURRENCY,
    scanMode: config.SCAN_MODE
  })
);

async function shutdown(signal: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  clearInterval(interval);
  console.info(JSON.stringify({ level: 'info', event: 'worker.stopping', signal }));

  await Promise.allSettled([
    attachmentWorker.close(),
    ...[...queues.values()].map(async (queue) => queue.close()),
    sql.end({ timeout: 5 })
  ]);
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
