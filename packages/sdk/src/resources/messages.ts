import type { HttpClient } from "../http.js";
import type {
  Message,
  MessageTimeline,
  ListMessagesParams,
  MessageListResponse,
  ListEventsParams,
  EventListResponse,
} from "../types.js";

/**
 * Query sent messages and delivery events.
 *
 * @example
 * ```ts
 * const msgs = await mail.messages.list({ status: "delivered", limit: 10 });
 * for (const msg of msgs.messages) {
 *   const timeline = await mail.messages.timeline(msg.id);
 *   console.log(timeline.events);
 * }
 * ```
 */
export class MessagesResource {
  constructor(private readonly http: HttpClient) {}

  /** List messages with optional filters (status, from, to). */
  async list(params?: ListMessagesParams): Promise<MessageListResponse> {
    return this.http.get<MessageListResponse>("/messages", params as Record<string, unknown>);
  }

  /** Get a single message by ID. */
  async get(id: string): Promise<Message> {
    return this.http.get<Message>(`/messages/${id}`);
  }

  /** Get the full delivery timeline for a message. */
  async timeline(id: string): Promise<MessageTimeline> {
    return this.http.get<MessageTimeline>(`/messages/${id}/timeline`);
  }
}

/**
 * Query raw email events (processed, delivered, bounced, opened, etc.)
 */
export class EventsResource {
  constructor(private readonly http: HttpClient) {}

  /** List events with optional filters. */
  async list(params?: ListEventsParams): Promise<EventListResponse> {
    return this.http.get<EventListResponse>("/events", params as Record<string, unknown>);
  }
}
