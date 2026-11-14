import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import api from '../services/api';
import examinationApi from '../services/examination.api';

describe('Multipart Upload & Content-Type Interceptor Regression', () => {
  let server: any;
  let serverUrl: string;
  let lastReceivedHeaders: Record<string, string | string[] | undefined> = {};
  let lastReceivedBody: any;

  beforeAll(async () => {
    const mod = 'node:http';
    const http: any = await (Function('m', 'return import(m)')(mod));
    const NodeBuffer = (globalThis as any).Buffer;
    lastReceivedBody = NodeBuffer.alloc(0);

    server = http.createServer((req: any, res: any) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      lastReceivedHeaders = req.headers;
      const chunks: any[] = [];
      req.on('data', (chunk: any) =>
        chunks.push(NodeBuffer.isBuffer(chunk) ? chunk : NodeBuffer.from(chunk)),
      );
      req.on('end', () => {
        lastReceivedBody = NodeBuffer.concat(chunks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            totalRows: 5,
            validCount: 5,
            invalidCount: 0,
            validQuestions: [],
            invalidQuestions: [],
          }),
        );
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('1. Interceptor sets Content-Type to null for FormData to suppress Axios x-www-form-urlencoded fallback', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['test-data'], { type: 'application/octet-stream' }), 'test.xlsx');

    let capturedConfig: any = null;
    const testApi = api as any;

    const originalAdapter = testApi.defaults.adapter;
    try {
      testApi.defaults.adapter = async (config: any) => {
        capturedConfig = config;
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
      };

      await testApi.post('/test-form', formData);

      expect(capturedConfig).not.toBeNull();
      // The AxiosHeaders instance must NOT have Content-Type set to application/x-www-form-urlencoded
      expect(capturedConfig.headers.getContentType()).toBeNull();
      expect(capturedConfig.headers.toJSON()['Content-Type']).toBeUndefined();
    } finally {
      testApi.defaults.adapter = originalAdapter;
    }
  });

  it('2. Dispatches genuine multipart request with boundary and "file" field to HTTP server', async () => {
    const formData = new FormData();
    const mockFileContent = 'PKdummy-xlsx-content';
    formData.append(
      'file',
      new Blob([mockFileContent], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'questions.xlsx',
    );

    const res = await api.post(
      `${serverUrl}/api/v1/examination/assessments/test-id/questions/import/preview`,
      formData,
    );
    expect(res.status).toBe(200);

    const contentType = lastReceivedHeaders['content-type'];
    expect(contentType).toBeDefined();
    // Must be multipart/form-data
    expect(contentType).toMatch(/^multipart\/form-data;\s*boundary=/i);
    // Must NOT be application/x-www-form-urlencoded
    expect(contentType).not.toContain('application/x-www-form-urlencoded');

    // Verify multipart body contains the "file" field and filename
    const bodyStr = lastReceivedBody.toString('utf8');
    expect(bodyStr).toContain('name="file"');
    expect(bodyStr).toContain('filename="questions.xlsx"');
    expect(bodyStr).toContain(mockFileContent);
  });

  it('3. Normal JSON requests continue to use application/json correctly', async () => {
    const payload = { title: 'Midterm Exam', totalMarks: 100, isDraft: true };
    const res = await api.post(`${serverUrl}/api/v1/examination/assessments`, payload);

    expect(res.status).toBe(200);

    const contentType = lastReceivedHeaders['content-type'];
    expect(contentType).toBe('application/json');

    const receivedJson = JSON.parse(lastReceivedBody.toString('utf8'));
    expect(receivedJson).toEqual(payload);
  });

  it('4. examinationApi.previewImport dispatches multipart without manual Content-Type override', async () => {
    const fakeFile = new File(['mock-excel-bytes'], 'MCQ_Template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    // Temporarily point api baseURL to the test server
    const originalBaseURL = api.defaults.baseURL;
    api.defaults.baseURL = `${serverUrl}/api/v1`;

    try {
      const result = await examinationApi.previewImport('test-assessment-123', fakeFile);
      expect(result).toBeDefined();
      expect(result.totalRows).toBe(5);

      const contentType = lastReceivedHeaders['content-type'];
      expect(contentType).toMatch(/^multipart\/form-data;\s*boundary=/i);
      expect(contentType).not.toContain('application/x-www-form-urlencoded');

      const bodyStr = lastReceivedBody.toString('utf8');
      expect(bodyStr).toContain('name="file"');
      expect(bodyStr).toContain('filename="MCQ_Template.xlsx"');
    } finally {
      api.defaults.baseURL = originalBaseURL;
    }
  });
});
