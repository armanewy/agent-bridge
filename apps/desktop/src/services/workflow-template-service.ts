import {
  createDefaultChatGptCodexWorkflowTemplate,
  validateWorkflowTemplate,
  type AgentProviderProfile,
  type WorkflowTemplate
} from "@agentbridge/core";

export interface WorkflowTemplateStorage {
  saveWorkflowTemplate(template: WorkflowTemplate): Promise<void>;
  getWorkflowTemplate(id: string): Promise<WorkflowTemplate | undefined>;
  listWorkflowTemplates(): Promise<WorkflowTemplate[]>;
}

export class WorkflowTemplateService {
  constructor(private readonly store: WorkflowTemplateStorage) {}

  async ensureDefaultTemplate(): Promise<WorkflowTemplate> {
    const template = createDefaultChatGptCodexWorkflowTemplate();
    const existing = await this.store.getWorkflowTemplate(template.id);
    if (existing) {
      return existing;
    }
    await this.store.saveWorkflowTemplate(template);
    return template;
  }

  async listTemplates(): Promise<WorkflowTemplate[]> {
    const templates = await this.store.listWorkflowTemplates();
    if (templates.length > 0) {
      return templates;
    }
    return [await this.ensureDefaultTemplate()];
  }

  async saveTemplate(template: WorkflowTemplate): Promise<WorkflowTemplate> {
    const validated = validateWorkflowTemplate(template);
    await this.store.saveWorkflowTemplate(validated);
    return validated;
  }

  validateTemplateProviders(template: WorkflowTemplate, providers: AgentProviderProfile[]): string[] {
    const byId = new Map(providers.map((provider) => [provider.id, provider]));
    return template.roles.flatMap((role) => {
      const provider = byId.get(role.providerId);
      if (!provider) {
        return role.optional ? [] : [`${role.role} provider ${role.providerId} is missing.`];
      }
      const missingCapabilities = role.requiredCapabilities.filter((capability) => !provider.capabilities.includes(capability as never));
      return missingCapabilities.map((capability) => `${role.role} provider ${role.providerId} lacks ${capability}.`);
    });
  }
}
