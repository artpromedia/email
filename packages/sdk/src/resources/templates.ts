import type { HttpClient } from "../http.js";
import type {
  Template,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CloneTemplateRequest,
  RenderTemplateResponse,
  PreviewTemplateRequest,
  ListTemplatesParams,
  TemplateListResponse,
  TemplateVersionListResponse,
} from "../types.js";

/**
 * Manage email templates — create, update, render, version, and clone.
 *
 * @example
 * ```ts
 * const tpl = await mail.templates.create({
 *   name: "Welcome",
 *   subject: "Welcome {{name}}!",
 *   html_content: "<h1>Hi {{name}}</h1>",
 * });
 *
 * const rendered = await mail.templates.render(tpl.id, {
 *   name: "Alice",
 * });
 * ```
 */
export class TemplatesResource {
  constructor(private readonly http: HttpClient) {}

  /** List templates with optional filters. */
  async list(params?: ListTemplatesParams): Promise<TemplateListResponse> {
    return this.http.get<TemplateListResponse>("/templates", params as Record<string, unknown>);
  }

  /** Get a single template by ID. */
  async get(id: string): Promise<Template> {
    return this.http.get<Template>(`/templates/${id}`);
  }

  /** Create a new template. */
  async create(data: CreateTemplateRequest): Promise<Template> {
    return this.http.post<Template>("/templates", data);
  }

  /** Update an existing template. */
  async update(id: string, data: UpdateTemplateRequest): Promise<Template> {
    return this.http.put<Template>(`/templates/${id}`, data);
  }

  /** Delete a template. */
  async delete(id: string): Promise<void> {
    return this.http.delete(`/templates/${id}`);
  }

  /** Render a template with substitution variables. */
  async render(id: string, substitutions: Record<string, string>): Promise<RenderTemplateResponse> {
    return this.http.post<RenderTemplateResponse>(`/templates/${id}/render`, { substitutions });
  }

  /** Clone a template. */
  async clone(id: string, data: CloneTemplateRequest): Promise<Template> {
    return this.http.post<Template>(`/templates/${id}/clone`, data);
  }

  /** List all versions of a template. */
  async listVersions(id: string): Promise<TemplateVersionListResponse> {
    return this.http.get<TemplateVersionListResponse>(`/templates/${id}/versions`);
  }

  /** Preview a template without saving (useful for editors). */
  async preview(data: PreviewTemplateRequest): Promise<RenderTemplateResponse> {
    return this.http.post<RenderTemplateResponse>("/templates/preview", data);
  }
}
