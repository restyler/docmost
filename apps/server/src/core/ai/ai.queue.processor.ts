import { Processor, WorkerHost, OnQueueActive } from '@nestjs/bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { isPageEmbeddingsTableExists } from '@docmost/db/helpers/helpers';
import { Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { OpenAiService } from './openai/openai.service';

interface PageEmbeddingPayload {
  pageIds: string[];
  workspaceId: string;
}

interface WorkspaceEmbeddingPayload {
  workspaceId: string;
}

@Processor(QueueName.AI_QUEUE)
export class AiQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(AiQueueProcessor.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
    private readonly pageRepo: PageRepo,
    private readonly openAiService: OpenAiService,
  ) {
    super();
  }

  @OnQueueActive()
  onActive(job: any) {
    this.logger.debug(`Processing AI job ${job.name} id=${job.id}`);
  }

  async process(job: any): Promise<void> {
    switch (job.name) {
      case QueueJob.WORKSPACE_CREATE_EMBEDDINGS:
        await this.handleWorkspaceCreateEmbeddings(job.data as WorkspaceEmbeddingPayload);
        break;
      case QueueJob.WORKSPACE_DELETE_EMBEDDINGS:
        await this.handleWorkspaceDeleteEmbeddings(job.data as WorkspaceEmbeddingPayload);
        break;
      case QueueJob.PAGE_CREATED:
      case QueueJob.PAGE_RESTORED:
      case QueueJob.PAGE_CONTENT_UPDATED:
      case QueueJob.PAGE_MOVED_TO_SPACE:
        await this.handleGeneratePageEmbeddings(job.data as PageEmbeddingPayload);
        break;
      case QueueJob.PAGE_SOFT_DELETED:
      case QueueJob.PAGE_DELETED:
        await this.handleDeletePageEmbeddings(job.data as PageEmbeddingPayload);
        break;
      default:
        this.logger.debug(`Unhandled AI job ${job.name}`);
    }
  }

  private async ensureTable() {
    const exists = await isPageEmbeddingsTableExists(this.db);
    if (!exists) {
      throw new Error('page_embeddings table missing; ensure migrations and pgvector extension are applied');
    }
  }

  private async handleWorkspaceCreateEmbeddings(payload: WorkspaceEmbeddingPayload) {
    await this.ensureTable();
    // Generate embeddings for all pages in workspace (simple batch)
    const pages = await this.pageRepo.findAllByWorkspace(payload.workspaceId);
    const pageIds = pages.map((p) => p.id);
    if (!pageIds.length) return;
    await this.generateEmbeddingsForPages(pageIds, payload.workspaceId);
  }

  private async handleWorkspaceDeleteEmbeddings(payload: WorkspaceEmbeddingPayload) {
    await this.ensureTable();
    await this.db
      .deleteFrom('pageEmbeddings')
      .where('workspaceId', '=', payload.workspaceId)
      .execute();
  }

  private async handleGeneratePageEmbeddings(payload: PageEmbeddingPayload) {
    await this.ensureTable();
    await this.generateEmbeddingsForPages(payload.pageIds, payload.workspaceId);
  }

  private async handleDeletePageEmbeddings(payload: PageEmbeddingPayload) {
    await this.ensureTable();
    await this.db
      .deleteFrom('pageEmbeddings')
      .where('pageId', 'in', payload.pageIds)
      .where('workspaceId', '=', payload.workspaceId)
      .execute();
  }

  private async generateEmbeddingsForPages(pageIds: string[], workspaceId: string) {
    if (!pageIds?.length) return;

    const model = this.environmentService.getAiEmbeddingModel();
    const dimension = this.environmentService.getAiEmbeddingDimension();
    if (!model || !dimension) {
      throw new Error('AI_EMBEDDING_MODEL and AI_EMBEDDING_DIMENSION are required');
    }

    // fetch pages content
    const pages = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'textContent'])
      .where('id', 'in', pageIds)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();

    for (const page of pages) {
      const chunks = this.chunkText(page.textContent || '', 1500);
      let chunkIndex = 0;
      for (const chunk of chunks) {
        const embedding = await this.createEmbedding(chunk, model);
        await this.db
          .insertInto('pageEmbeddings')
          .values({
            pageId: page.id,
            workspaceId,
            spaceId: '', // unknown without join; set empty
            attachmentId: '',
            modelName: model,
            modelDimensions: dimension,
            chunkIndex,
            chunkStart: 0,
            chunkLength: chunk.length,
            embedding,
          } as any)
          .execute();
        chunkIndex += 1;
      }
    }
  }

  private async createEmbedding(text: string, model: string): Promise<number[]> {
    const apiKey = this.environmentService.getOpenAiApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for embeddings');
    }
    const baseUrl =
      this.environmentService.getOpenAiApiUrl() || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Embedding failed: ${response.status} ${txt}`);
    }

    const json = (await response.json()) as any;
    const vector = json?.data?.[0]?.embedding as number[] | undefined;
    if (!vector) {
      throw new Error('Embedding response missing embedding vector');
    }
    return vector;
  }

  private chunkText(text: string, chunkSize: number): string[] {
    if (!text) return [];
    const normalized = text.replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ');
    const chunks: string[] = [];
    let buffer: string[] = [];

    for (const word of words) {
      if ((buffer.join(' ').length + word.length + 1) > chunkSize) {
        chunks.push(buffer.join(' '));
        buffer = [];
      }
      buffer.push(word);
    }
    if (buffer.length) {
      chunks.push(buffer.join(' '));
    }
    return chunks;
  }
}

