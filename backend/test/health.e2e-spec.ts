import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health returns 200 with database connected and tenant info', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-school-id', '00000000-0000-0000-0000-000000000001')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('database');
    expect(response.body.database.status).toBe('connected');
    expect(response.body.tenantContext.activeSchoolId).toBe('00000000-0000-0000-0000-000000000001');
    expect(response.headers['x-school-id']).toBe('00000000-0000-0000-0000-000000000001');
  });
});
