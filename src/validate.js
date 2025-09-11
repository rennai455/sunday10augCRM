const { z } = require('zod');

function validate({ body, query, params }) {
  return (req, res, next) => {
    try {
      if (body) req.body = body.parse(req.body);
      if (query) req.query = query.parse(req.query);
      if (params) req.params = params.parse(req.params);
      next();
    } catch (err) {
      const issues = err?.issues || [{ message: err.message }];
      return res.status(400).json({ error: 'Invalid request', details: issues });
    }
  };
}

// Common schemas
const schemas = {
  loginBody: z.object({
    email: z.string().email().max(256),
    password: z.string().min(6).max(256),
  }),
  idParam: z.object({ id: z.string().regex(/^\d+$/) }),
  paginationQuery: z.object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.enum(['created_at', 'updated_at']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
  }),
  leadsFilterQuery: z.object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    campaignId: z.coerce.number().int().optional(),
    status: z.string().max(32).optional(),
    sort: z.enum(['created_at', 'status', 'updated_at']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).refine((v) => !(v.from && v.to) || new Date(v.from) <= new Date(v.to), { message: 'from must be <= to' }),
  auditLimitQuery: z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
  auditSearchQuery: z
    .object({
      limit: z.coerce.number().int().min(1).max(200).optional(),
      action: z.string().max(64).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .refine((v) => !(v.from && v.to) || new Date(v.from) <= new Date(v.to), {
      message: 'from must be <= to',
    }),
  leadCreateBody: z.object({
    campaign_id: z.coerce.number().int(),
    name: z.string().max(128).optional(),
    email: z.string().email().max(128).optional(),
    phone: z.string().max(32).optional(),
    status: z.string().max(32).optional(),
  }),
  leadUpdateBody: z.object({
    name: z.string().max(128).optional(),
    email: z.string().email().max(128).optional(),
    phone: z.string().max(32).optional(),
    status: z.string().max(32).optional(),
  }).refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' }),
};

module.exports = { validate, schemas };
