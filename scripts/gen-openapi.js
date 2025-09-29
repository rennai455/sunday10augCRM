#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const openapi = {
  openapi: '3.1.0',
  info: { title: 'renn-ai-crm API', version: '1.0.0' },
  servers: [{ url: '/' }],
  paths: {},
  components: { schemas: {} },
};

// Schemas
openapi.components.schemas.LoginBody = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', maxLength: 256 },
    password: { type: 'string', minLength: 6, maxLength: 256 },
  },
};
openapi.components.schemas.PaginationQuery = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
    sort: { type: 'string', enum: ['created_at', 'updated_at'] },
    order: { type: 'string', enum: ['asc', 'desc'] },
  },
};
openapi.components.schemas.Campaign = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    agency_id: { type: 'integer' },
    name: { type: 'string' },
    status: { type: 'string' },
    details: { type: 'object', additionalProperties: true, nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};
openapi.components.schemas.Lead = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    campaign_id: { type: 'integer' },
    name: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    phone: { type: 'string', nullable: true },
    status: { type: 'string', nullable: true },
    status_history: {
      type: 'array',
      items: { type: 'object' },
      nullable: true,
    },
    created_at: { type: 'string', format: 'date-time' },
  },
};
openapi.components.schemas.DashboardTotals = {
  type: 'object',
  required: ['campaigns', 'leads', 'averageScore', 'activeClients'],
  properties: {
    campaigns: { type: 'integer' },
    leads: { type: 'integer' },
    averageScore: { type: 'integer' },
    activeClients: { type: 'integer' },
  },
};
openapi.components.schemas.DashboardCampaignSummary = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    client: { type: 'string', nullable: true },
    status: { type: 'string' },
    leads: { type: 'integer' },
    started_at: { type: 'string', format: 'date-time' },
  },
};
openapi.components.schemas.DashboardResponse = {
  type: 'object',
  required: ['totals', 'recentCampaigns'],
  properties: {
    totals: { $ref: '#/components/schemas/DashboardTotals' },
    recentCampaigns: {
      type: 'array',
      items: { $ref: '#/components/schemas/DashboardCampaignSummary' },
    },
  },
};

// Paths
openapi.paths['/api/auth/login'] = {
  post: {
    summary: 'Login with email/password',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/LoginBody' },
        },
      },
    },
    responses: {
      200: { description: 'OK' },
      400: { description: 'Bad Request' },
      401: { description: 'Unauthorized' },
    },
  },
};
openapi.paths['/api/auth/logout'] = {
  post: {
    summary: 'Logout',
    parameters: [
      {
        in: 'header',
        name: 'x-csrf-token',
        required: false,
        schema: { type: 'string' },
        description: 'CSRF token required in production',
      },
    ],
    responses: { 200: { description: 'OK' } },
  },
};
openapi.paths['/api/auth/me'] = {
  get: {
    summary: 'Current user info',
    responses: {
      200: { description: 'OK' },
      401: { description: 'Unauthorized' },
    },
  },
};
openapi.paths['/api/campaigns'] = {
  get: {
    summary: 'List campaigns (tenant scoped)',
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } },
      {
        in: 'query',
        name: 'pageSize',
        schema: { type: 'integer', minimum: 1, maximum: 100 },
      },
      {
        in: 'query',
        name: 'sort',
        schema: { type: 'string', enum: ['created_at', 'updated_at'] },
      },
      {
        in: 'query',
        name: 'order',
        schema: { type: 'string', enum: ['asc', 'desc'] },
      },
    ],
    responses: {
      200: {
        description: 'OK',
        headers: { 'X-Total-Count': { schema: { type: 'integer' } } },
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                campaigns: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Campaign' },
                },
              },
            },
          },
        },
      },
    },
  },
};
openapi.paths['/api/campaigns/{id}'] = {
  get: {
    summary: 'Get campaign by id (tenant scoped)',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', pattern: '^\\d+$' },
      },
    ],
    responses: {
      200: { description: 'OK' },
      404: { description: 'Not Found' },
    },
  },
};
openapi.paths['/api/csrf-token'] = {
  get: {
    summary: 'Issue CSRF token',
    responses: { 200: { description: 'OK' } },
  },
};
openapi.paths['/api/dashboard'] = {
  get: {
    summary: 'Aggregated dashboard metrics and recent campaigns',
    responses: {
      200: {
        description: 'OK',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DashboardResponse' },
          },
        },
      },
      401: { description: 'Unauthorized' },
    },
  },
};
openapi.paths['/webhook'] = {
  post: {
    summary: 'Webhook receiver (HMAC + optional replay guard)',
    parameters: [
      { in: 'header', name: 'x-id', schema: { type: 'string' } },
      { in: 'header', name: 'x-timestamp', schema: { type: 'string' } },
      {
        in: 'header',
        name: 'x-signature',
        required: true,
        schema: { type: 'string' },
      },
    ],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object' } } },
    },
    responses: {
      200: { description: 'OK' },
      400: { description: 'Invalid' },
      401: { description: 'Missing signature' },
    },
  },
};

// Leads
openapi.paths['/api/leads'] = {
  get: {
    summary: 'List leads (tenant scoped)',
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } },
      {
        in: 'query',
        name: 'pageSize',
        schema: { type: 'integer', minimum: 1, maximum: 100 },
      },
      { in: 'query', name: 'campaignId', schema: { type: 'integer' } },
      { in: 'query', name: 'status', schema: { type: 'string' } },
      {
        in: 'query',
        name: 'sort',
        schema: {
          type: 'string',
          enum: ['created_at', 'status', 'updated_at'],
        },
      },
      {
        in: 'query',
        name: 'order',
        schema: { type: 'string', enum: ['asc', 'desc'] },
      },
      {
        in: 'query',
        name: 'from',
        schema: { type: 'string', format: 'date-time' },
      },
      {
        in: 'query',
        name: 'to',
        schema: { type: 'string', format: 'date-time' },
      },
    ],
    responses: {
      200: {
        description: 'OK',
        headers: { 'X-Total-Count': { schema: { type: 'integer' } } },
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                leads: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Lead' },
                },
              },
            },
          },
        },
      },
    },
  },
  post: {
    summary: 'Create lead (tenant scoped)',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              campaign_id: { type: 'integer' },
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
              phone: { type: 'string' },
              status: { type: 'string' },
            },
            required: ['campaign_id'],
          },
        },
      },
    },
    responses: {
      201: { description: 'Created' },
      404: { description: 'Campaign not found' },
    },
  },
};
openapi.paths['/api/leads/{id}'] = {
  get: {
    summary: 'Get lead by id',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', pattern: '^\\d+$' },
      },
    ],
    responses: {
      200: { description: 'OK' },
      404: { description: 'Not Found' },
    },
  },
  put: {
    summary: 'Update lead',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', pattern: '^\\d+$' },
      },
    ],
    responses: {
      200: { description: 'OK' },
      404: { description: 'Not Found' },
    },
  },
  delete: {
    summary: 'Delete lead',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', pattern: '^\\d+$' },
      },
    ],
    responses: {
      204: { description: 'No Content' },
      404: { description: 'Not Found' },
    },
  },
};
openapi.paths['/api/audit/leads'] = {
  get: {
    summary: 'Recent lead activity (audit)',
    parameters: [
      {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', minimum: 1, maximum: 50 },
      },
    ],
    responses: { 200: { description: 'OK' } },
  },
};
openapi.paths['/api/audit/recent'] = {
  get: {
    summary: 'Recent audit events (any action)',
    parameters: [
      {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', minimum: 1, maximum: 50 },
      },
    ],
    responses: { 200: { description: 'OK' } },
  },
};

openapi.paths['/api/audit/search'] = {
  get: {
    summary: 'Search audit events (admin only)',
    parameters: [
      {
        in: 'query',
        name: 'action',
        schema: { type: 'string' },
        description: 'Prefix match, e.g., lead:',
      },
      {
        in: 'query',
        name: 'from',
        schema: { type: 'string', format: 'date-time' },
      },
      {
        in: 'query',
        name: 'to',
        schema: { type: 'string', format: 'date-time' },
      },
      {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', minimum: 1, maximum: 200 },
      },
    ],
    responses: {
      200: { description: 'OK' },
      403: { description: 'Forbidden' },
    },
  },
};

const outDir = path.join(__dirname, '..', 'docs');
const outPath = path.join(outDir, 'openapi.json');
try {
  fs.mkdirSync(outDir, { recursive: true });
} catch (e) {
  if (!e || e.code !== 'EEXIST') throw e;
}
fs.writeFileSync(outPath, JSON.stringify(openapi, null, 2));
console.log('Wrote', outPath);
