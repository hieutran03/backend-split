import {
  type DynamicModule,
  Global,
  Logger,
  Module,
  type OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { DataSource, type MixedList, type EntitySchema } from 'typeorm';

import { TRANSACTION_MANAGER } from '@platform/ports/transaction-manager.port';
import { OUTBOX } from '@platform/ports/outbox.port';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { DbContext, TypeOrmTransactionManager } from './db-context';
import { TypeOrmOutbox } from './outbox/typeorm-outbox';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type EntityList = MixedList<Function | string | EntitySchema>;

export function createDataSource(
  config: AppConfig['database'],
  entities: EntityList,
  migrations: EntityList = [],
): DataSource {
  return new DataSource({
    type: 'postgres',
    url: config.url,
    entities,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    migrations: migrations as Function[],
    migrationsTableName: 'backend_migrations', // §6.3 S7: không đụng alembic_version
    synchronize: false, // TUYỆT ĐỐI không bật: schema thuộc Alembic tới P3
    logging: config.logQueries,
    extra: { max: config.poolMax },
  });
}

@Global()
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  private static readonly logger = new Logger('Database');

  public constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  public static forRoot(options: { entities: EntityList }): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DataSource,
          useFactory: async (config: AppConfig) => {
            const ds = createDataSource(config.database, options.entities);
            await ds.initialize();
            DatabaseModule.logger.log('PostgreSQL connected');
            return ds;
          },
          inject: [APP_CONFIG],
        },
        {
          provide: DbContext,
          useFactory: (ds: DataSource) => new DbContext(ds),
          inject: [DataSource],
        },
        {
          provide: TRANSACTION_MANAGER,
          useFactory: (db: DbContext) => new TypeOrmTransactionManager(db),
          inject: [DbContext],
        },
        {
          provide: OUTBOX,
          useFactory: (db: DbContext) => new TypeOrmOutbox(db),
          inject: [DbContext],
        },
      ],
      exports: [DataSource, DbContext, TRANSACTION_MANAGER, OUTBOX],
    };
  }

  public async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}
