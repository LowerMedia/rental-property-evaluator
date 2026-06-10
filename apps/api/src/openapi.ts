/**
 * E10 — OpenAPI 3.1 spec for the /v1 surface (RPE-80)
 *
 * Hand-authored and kept in lockstep with the routes by the drift test
 * in tests/openapi.test.ts (spec paths must respond; implemented /v1
 * routes must appear here — adding a route without documenting it fails
 * CI). Served at GET /v1/openapi.json; interactive reference at
 * GET /v1/docs.
 */

const ERROR_ENVELOPE = {
  type: 'object',
  description: 'Standard /v1 error envelope.',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', examples: ['unauthorized', 'rate_limited', 'not_found', 'bad_request', 'not_acceptable'] },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
  },
} as const;

const EXPENSE_INPUT = {
  type: 'object',
  required: ['amount', 'period'],
  properties: {
    amount: { type: 'number' },
    period: { type: 'string', enum: ['monthly', 'annual'] },
  },
} as const;

const DEAL_INPUTS = {
  type: 'object',
  description: 'Deal inputs — percent values are percent-points (7 = 7%).',
  required: [
    'purchasePrice', 'percentDown', 'interestRate', 'loanTermYears',
    'closingCosts', 'rollClosingCostsIntoLoan', 'grossRent', 'vacancyPct', 'expenses',
  ],
  properties: {
    purchasePrice: { type: 'number' },
    percentDown: { type: 'number' },
    interestRate: { type: 'number' },
    loanTermYears: { type: 'number' },
    closingCosts: { type: 'number' },
    rollClosingCostsIntoLoan: { type: 'boolean' },
    rehab: { type: 'number' },
    grossRent: { type: 'number', description: 'Monthly gross rent.' },
    otherIncome: { type: 'number' },
    vacancyPct: { type: 'number' },
    expenses: {
      type: 'object',
      required: ['taxes', 'insurance'],
      properties: {
        taxes: EXPENSE_INPUT,
        insurance: EXPENSE_INPUT,
        hoa: EXPENSE_INPUT,
        other: EXPENSE_INPUT,
        capExPct: { type: 'number' },
        maintPct: { type: 'number' },
        mgmtPct: { type: 'number' },
        miscPct: { type: 'number' },
      },
    },
    units: { type: 'number' },
    sqft: { type: 'number' },
    holdYears: { type: 'number' },
    rentGrowthPct: { type: 'number' },
    expenseGrowthPct: { type: 'number' },
    appreciationPct: { type: 'number' },
    sellingCostsPct: { type: 'number' },
    discountRatePct: { type: 'number' },
  },
} as const;

const EVAL_OPTS = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['screener', 'proforma'], default: 'screener' },
  },
} as const;

const DEAL_REPORT = {
  type: 'object',
  description: 'Canonical deal report (reportVersion 1).',
  required: ['meta', 'inputs', 'score', 'metrics', 'proForma'],
  properties: {
    meta: {
      type: 'object',
      required: ['reportVersion', 'generatedAt', 'engineVersion', 'mode'],
      properties: {
        reportVersion: { type: 'integer', const: 1 },
        generatedAt: { type: 'string', format: 'date-time' },
        engineVersion: { type: 'string' },
        mode: { type: 'string', enum: ['screener', 'proforma'] },
      },
    },
    inputs: { $ref: '#/components/schemas/DealInputs' },
    score: {
      type: 'object',
      required: ['passing', 'total', 'pct'],
      properties: {
        passing: { type: 'integer' },
        total: { type: 'integer' },
        pct: { type: 'number' },
      },
    },
    metrics: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'group', 'label', 'value', 'formatted', 'direction', 'threshold', 'signal'],
        properties: {
          key: { type: 'string' },
          group: { type: 'string' },
          label: { type: 'string' },
          value: { type: ['number', 'null'] },
          formatted: { type: 'string' },
          direction: { type: 'string', enum: ['higher', 'lower', 'none'] },
          threshold: { type: ['number', 'null'] },
          signal: { type: 'string', enum: ['pass', 'fail', 'info', 'null'] },
        },
      },
    },
    proForma: {
      type: ['object', 'null'],
      description: 'Projection + hold summary; present only in proforma mode.',
    },
  },
} as const;

const RATE_LIMIT_HEADERS = {
  'X-RateLimit-Limit': { description: 'Requests allowed per minute for this identity.', schema: { type: 'string' } },
  'X-RateLimit-Remaining': { description: 'Requests left in the current minute window.', schema: { type: 'string' } },
  'X-RateLimit-Reset': { description: 'Seconds until the minute window resets.', schema: { type: 'string' } },
  'X-Request-Id': { description: 'Echoed or generated request id — quote it when reporting issues.', schema: { type: 'string' } },
} as const;

const SECURITY = [{ bearerAuth: [] }, { apiKeyHeader: [] }];

function errorResponse(description: string) {
  return {
    description,
    headers: RATE_LIMIT_HEADERS,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
  };
}

/** Build the spec. Pure — version injected so it tracks the package. */
export function buildOpenApiSpec(version: string): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Rental Property Evaluator API',
      version,
      description:
        'Authenticated deal evaluation and reporting. Auth: `Authorization: Bearer <key>` or `X-API-Key`. ' +
        'Keys are minted by the operator (see docs/api-quickstart.md). All endpoints are rate limited per key ' +
        '(quota headers on every response). Errors use a standard envelope with a `requestId`.',
    },
    servers: [{ url: '/v1' }],
    security: SECURITY,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key as a bearer token.' },
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        ErrorEnvelope: ERROR_ENVELOPE,
        DealInputs: DEAL_INPUTS,
        EvalOptions: EVAL_OPTS,
        DealReport: DEAL_REPORT,
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Liveness + API metadata',
          security: [],
          responses: {
            '200': {
              description: 'Service is up.',
              headers: RATE_LIMIT_HEADERS,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', const: 'ok' },
                      version: { type: 'string' },
                      apiVersion: { type: 'string', const: 'v1' },
                      gitSha: { type: ['string', 'null'] },
                    },
                  },
                },
              },
            },
            '429': errorResponse('Rate limited (per-IP for unauthenticated callers).'),
          },
        },
      },
      '/evaluate': {
        post: {
          summary: 'Evaluate a deal',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['inputs'],
                  properties: {
                    inputs: { $ref: '#/components/schemas/DealInputs' },
                    opts: { $ref: '#/components/schemas/EvalOptions' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Evaluation results (screener metrics, or pro-forma when opts.mode=proforma).',
              headers: RATE_LIMIT_HEADERS,
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'object' } } } } },
            },
            '400': errorResponse('Invalid inputs.'),
            '401': errorResponse('Missing/invalid/revoked API key.'),
            '413': errorResponse('Payload exceeds 64 KB.'),
            '429': errorResponse('Rate limit exceeded — see Retry-After.'),
          },
        },
      },
      '/reports': {
        post: {
          summary: 'Generate a deal report (json, csv, or pdf)',
          description:
            'Format precedence: `?format=` query > `format` in the body > `Accept` header > json default. ' +
            'csv/pdf return Content-Disposition attachments named rpe-YYYY-MM-DD.{csv,pdf}.',
          parameters: [
            {
              name: 'format',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['json', 'csv', 'pdf'] },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['inputs'],
                  properties: {
                    inputs: { $ref: '#/components/schemas/DealInputs' },
                    opts: { $ref: '#/components/schemas/EvalOptions' },
                    format: { type: 'string', enum: ['json', 'csv', 'pdf'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'The report in the negotiated format.',
              headers: RATE_LIMIT_HEADERS,
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/DealReport' } },
                'text/csv': { schema: { type: 'string' } },
                'application/pdf': { schema: { type: 'string', format: 'binary' } },
              },
            },
            '400': errorResponse('Invalid inputs.'),
            '401': errorResponse('Missing/invalid/revoked API key.'),
            '406': errorResponse('Unsupported format.'),
            '429': errorResponse('Rate limit exceeded — see Retry-After.'),
          },
        },
      },
      '/property': {
        post: {
          summary: 'Property lookup via RentCast (bring-your-own RentCast key in the body)',
          responses: {
            '200': { description: 'PropertyData + provenance-tagged lookup.', headers: RATE_LIMIT_HEADERS },
            '400': errorResponse('Invalid body.'),
            '401': errorResponse('Missing/invalid API key (proxy) or RentCast key (upstream).'),
            '429': errorResponse('Proxy or upstream rate limit.'),
          },
        },
      },
      '/property/context': {
        post: {
          summary: 'Comps & history for a property (read-only supporting context)',
          responses: {
            '200': { description: 'Rent/sale comps, tax history, price history.', headers: RATE_LIMIT_HEADERS },
            '400': errorResponse('Invalid body.'),
            '429': errorResponse('Proxy or upstream rate limit.'),
          },
        },
      },
      '/region': {
        get: {
          summary: 'Regional assumption defaults for a ZIP',
          parameters: [{ name: 'zip', in: 'query', required: true, schema: { type: 'string', pattern: '^\\d{5}$' } }],
          responses: {
            '200': { description: 'Regional rates + HUD rent data with national fallback.', headers: RATE_LIMIT_HEADERS },
            '400': errorResponse('Missing/invalid zip.'),
          },
        },
      },
      '/geocode': {
        get: {
          summary: 'Geocode a freeform address (US Census; disambiguation candidates)',
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string', maxLength: 256 } }],
          responses: {
            '200': { description: 'Candidate list (may be empty).', headers: RATE_LIMIT_HEADERS },
            '400': errorResponse('Missing/overlong q.'),
            '429': errorResponse('Rate limited.'),
            '502': errorResponse('Geocoder unavailable.'),
          },
        },
      },
      '/scrape': {
        post: {
          summary: 'Listing-page scrape fallback (flag-gated, OFF by default)',
          description: 'Returns 403 scrape_disabled unless the operator enables RPE_SCRAPE_ENABLED.',
          responses: {
            '200': { description: 'Low-confidence lookup parsed from the page.', headers: RATE_LIMIT_HEADERS },
            '400': errorResponse('URL not on the supported-host allowlist.'),
            '403': errorResponse('Scrape fallback disabled.'),
            '429': errorResponse('Rate limited.'),
            '502': errorResponse('Page unreachable.'),
          },
        },
      },
    },
  };
}

/** Minimal interactive reference — Scalar via CDN, no npm dependency. */
export function docsHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <title>Rental Property Evaluator API — Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/v1/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}
