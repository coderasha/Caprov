import { HealthController } from './health.controller';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { emptyStore } from '../../infrastructure/database/models';

describe('HealthController', () => {
  it('returns the service health payload', () => {
    const db = { snapshot: emptyStore() } as DatabaseService;
    const controller = new HealthController(db);

    expect(controller.getHealth()).toMatchObject({
      service: 'caprov-api',
      status: 'ok',
      assets: 0,
      documents: 0,
    });
  });
});
