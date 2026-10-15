import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  schoolId: string;
  userId?: string;
  userRole?: string;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run<R>(store: TenantStore, callback: () => R): R {
    return this.storage.run(store, callback);
  }

  getStore(): TenantStore | undefined {
    return this.storage.getStore();
  }

  getSchoolId(): string | undefined {
    return this.storage.getStore()?.schoolId;
  }

  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  getUserRole(): string | undefined {
    return this.storage.getStore()?.userRole;
  }
}
