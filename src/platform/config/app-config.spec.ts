import { loadConfig } from './app-config';

const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'secret' };

describe('loadConfig', () => {
  it('biến để trống được coi là chưa đặt ⇒ dùng mặc định (lỗi Swagger 404 ngày 2026-11-09)', () => {
    expect(loadConfig({ ...base, SWAGGER_ENABLED: '' }).swagger.enabled).toBe(
      true,
    );
    expect(loadConfig({ ...base, PORT: '' }).http.port).toBe(3000);
    expect(loadConfig({ ...base, BCRYPT_COST: '  ' }).auth.bcryptCost).toBe(12);
  });

  it('SWAGGER_ENABLED: mặc định bật ở dev, tắt ở production, giá trị tường minh thắng', () => {
    expect(loadConfig(base).swagger.enabled).toBe(true);
    expect(
      loadConfig({ ...base, SWAGGER_ENABLED: 'false' }).swagger.enabled,
    ).toBe(false);
    const prod = {
      ...base,
      NODE_ENV: 'production',
      AI_ENGINE_MODE: 'http',
      JWT_SECRET: 'real',
    };
    expect(loadConfig(prod).swagger.enabled).toBe(false);
    expect(
      loadConfig({ ...prod, SWAGGER_ENABLED: 'true' }).swagger.enabled,
    ).toBe(true);
  });

  it('biến bắt buộc để trống vẫn báo lỗi rõ ràng', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: '' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('production cấm mock AI Engine', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: 'real' }),
    ).toThrow(/AI_ENGINE_MODE/);
  });
});
